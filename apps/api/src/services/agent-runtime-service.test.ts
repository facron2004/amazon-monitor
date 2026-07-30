import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { DesktopAgentBridgeMessage } from "@amazon-monitor/shared";
import { createStore, initSchema } from "../store.js";
import {
  configureDesktopAgentStore,
  configureDesktopAgentTransport,
  receiveDesktopAgentMessage,
} from "./desktop-agent-transport.js";
import { AgentRuntimeService } from "./agent-runtime-service.js";

describe("AgentRuntimeService terminal events", () => {
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
});
