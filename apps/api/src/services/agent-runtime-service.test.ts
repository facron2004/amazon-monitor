import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { DesktopAgentBridgeMessage } from "@amazon-monitor/shared";
import { createStore, initSchema } from "../store.js";
import {
  configureDesktopAgentStore,
  configureDesktopAgentTransport,
  receiveDesktopAgentMessage,
} from "./desktop-agent-transport.js";
import {
  AgentRuntimeService,
} from "./agent-runtime-service.js";
import { recoverInterruptedAgentRuns } from "./agent-runtime-recovery.js";

describe("AgentRuntimeService terminal events", () => {
  it("enables the desktop runtime only for a configured active connection", async () => {
    const database = new DatabaseSync(":memory:");
    initSchema(database);
    const store = createStore(database);
    const runtime = new AgentRuntimeService(store, {
      enabled: false,
      primaryModel: "disabled-model",
      fallbackModel: "disabled-fallback",
      reasoningEffort: "medium",
      maxTurns: 10,
      tracingDisabled: true,
    });

    await receiveDesktopAgentMessage({
      type: "agent.connection.active",
      connection: {
        id: "oauth",
        name: "ChatGPT",
        provider: "chatgpt-oauth",
        apiMode: "responses",
        baseUrl: null,
        primaryModel: "gpt-5.6-sol",
        fallbackModel: "gpt-5.6-terra",
        reasoningEnabled: true,
        configured: false,
      },
    });
    expect(runtime.effectiveConfig).toMatchObject({
      enabled: false,
      primaryModel: "gpt-5.6-sol",
    });

    await receiveDesktopAgentMessage({
      type: "agent.connection.active",
      connection: {
        id: "oauth",
        name: "ChatGPT",
        provider: "chatgpt-oauth",
        apiMode: "responses",
        baseUrl: null,
        primaryModel: "gpt-5.6-sol",
        fallbackModel: "gpt-5.6-terra",
        reasoningEnabled: true,
        configured: true,
      },
    });
    expect(runtime.effectiveConfig).toMatchObject({
      enabled: true,
      fallbackModel: "gpt-5.6-terra",
    });

    await receiveDesktopAgentMessage({
      type: "agent.connection.active",
      connection: null,
    });
    database.close();
  });

  it("persists a terminal event so SSE clients refresh the failed run", async () => {
    const database = new DatabaseSync(":memory:");
    initSchema(database);
    const store = createStore(database);
    const user = store.listUsers()[0]!;
    const session = store.createAgentSession({
      orgId: user.orgId,
      userId: user.id,
      title: "Terminal event",
    });
    const run = store.createAgentRun({
      sessionId: session.id,
      orgId: user.orgId,
      userId: user.id,
      taskType: "investigation",
      input: "Investigate B000TEST01",
      model: "gpt-5.6-sol",
      fallbackModel: "gpt-5.6-terra",
    });
    const sent: DesktopAgentBridgeMessage[] = [];
    configureDesktopAgentStore(store);
    configureDesktopAgentTransport((message) => sent.push(message));
    const runtime = new AgentRuntimeService(store, {
      enabled: true,
      primaryModel: "gpt-5.6-sol",
      fallbackModel: "gpt-5.6-terra",
      reasoningEffort: "medium",
      maxTurns: 10,
      tracingDisabled: true,
    });

    runtime.start(run, { datasets: ["category"], categoryId: 1 });
    expect(sent[0]).toMatchObject({ type: "agent.run.start", run: { id: run.id } });
    await receiveDesktopAgentMessage({
      type: "agent.run.fail",
      runId: run.id,
      errorMessage: "model unavailable",
    });

    expect(store.getAgentRun(run.id, user.orgId)).toMatchObject({
      status: "failed",
      errorMessage: "model unavailable",
    });
    expect(store.listAgentRunEvents(run.id).at(-1)).toMatchObject({
      type: "run.failed",
      payload: { errorMessage: "model unavailable" },
    });
    database.close();
  });

  it("fails interrupted runtime state without replaying collection recovery", () => {
    const database = new DatabaseSync(":memory:");
    initSchema(database);
    const store = createStore(database);
    const user = store.listUsers()[0]!;
    const session = store.createAgentSession({
      orgId: user.orgId,
      userId: user.id,
      title: "Restart reconciliation",
    });
    const interrupted = store.createAgentRun({
      sessionId: session.id,
      orgId: user.orgId,
      userId: user.id,
      taskType: "investigation",
      input: "Interrupted analysis",
      model: "gpt-5.6-sol",
      fallbackModel: "gpt-5.6-terra",
    });
    store.updateAgentRun(interrupted.id, user.orgId, {
      status: "running_tools",
    });
    const step = store.createAgentStep({
      runId: interrupted.id,
      title: "Analyze evidence",
    });
    const toolCall = store.createAgentToolCall({
      runId: interrupted.id,
      stepId: step.id,
      toolName: "get_asin_history",
      arguments: { asin: "B000TEST01" },
    });
    const recovery = store.createAgentRun({
      sessionId: session.id,
      orgId: user.orgId,
      userId: user.id,
      taskType: "recovery",
      input: "Wait for collection",
      model: "gpt-5.6-sol",
      fallbackModel: "gpt-5.6-terra",
      recoveryOfRunId: interrupted.id,
    });
    store.appendAgentRunEvent({
      runId: recovery.id,
      type: "recovery.waiting_for_collection",
      payload: { jobId: 42 },
    });

    expect(recoverInterruptedAgentRuns(store)).toBe(1);
    expect(store.getAgentRun(interrupted.id, user.orgId)).toMatchObject({
      status: "failed",
      errorMessage: expect.stringContaining("API process restart"),
    });
    expect(store.listAgentSteps(interrupted.id)[0]).toMatchObject({
      status: "failed",
    });
    expect(store.listAgentToolCalls(interrupted.id)[0]).toMatchObject({
      id: toolCall.id,
      status: "failed",
    });
    expect(store.listAgentRunEvents(interrupted.id).at(-1)).toMatchObject({
      type: "run.interrupted",
      payload: { replayed: false },
    });
    expect(store.getAgentRun(recovery.id, user.orgId)).toMatchObject({
      status: "created",
    });
    database.close();
  });
});
