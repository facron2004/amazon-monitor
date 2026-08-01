import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import type {
  AgentRunOutput,
  DesktopAgentBridgeMessage,
  DesktopAgentRpcResult,
} from "@amazon-monitor/shared";
import { createStore, initSchema } from "../store.js";
import {
  configureDesktopAgentStore,
  configureDesktopAgentRecoveryStarter,
  configureDesktopAgentTransport,
  receiveDesktopAgentMessage,
  startDesktopAgentRun,
} from "./desktop-agent-transport.js";

describe("Desktop Agent transport", () => {
  it("keeps SDK execution remote while serving scoped Session RPC", async () => {
    const database = new DatabaseSync(":memory:");
    initSchema(database);
    const store = createStore(database);
    const user = store.listUsers()[0]!;
    const session = store.createAgentSession({
      orgId: user.orgId,
      userId: user.id,
      title: "Desktop transport",
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
    const complete = vi.fn();
    configureDesktopAgentStore(store);
    configureDesktopAgentTransport((message) => sent.push(message));

    startDesktopAgentRun(
      run,
      { datasets: ["category"] },
      {
        enabled: true,
        primaryModel: "gpt-5.6-sol",
        fallbackModel: "gpt-5.6-terra",
        reasoningEffort: "medium",
        maxTurns: 10,
        tracingDisabled: true,
      },
      { appendEvent: vi.fn(), complete, fail: vi.fn() },
    );

    expect(sent[0]).toMatchObject({
      type: "agent.run.start",
      run: { id: run.id, orgId: user.orgId, sessionId: session.id },
    });
    await receiveDesktopAgentMessage({
      type: "agent.rpc.request",
      requestId: "add-1",
      runId: run.id,
      method: "session.add",
      payload: { items: [{ role: "user", content: "hello" }] },
    });
    await receiveDesktopAgentMessage({
      type: "agent.rpc.request",
      requestId: "get-1",
      runId: run.id,
      method: "session.get",
      payload: {},
    });
    const getResult = sent.at(-1) as DesktopAgentRpcResult;
    expect(getResult).toMatchObject({
      type: "agent.rpc.result",
      requestId: "get-1",
      ok: true,
      result: [{ role: "user", content: "hello" }],
    });

    const output: AgentRunOutput = {
      summary: "Complete",
      conclusions: [],
      freshness: {
        status: "fresh",
        checkedAt: "2026-07-29T00:00:00.000Z",
        maxAgeHours: 24,
        oldestEvidenceAt: "2026-07-29T00:00:00.000Z",
        staleSources: [],
        dataGaps: [],
        warnings: [],
      },
      riskNotes: [],
      recommendedActions: [],
    };
    await receiveDesktopAgentMessage({
      type: "agent.run.complete",
      runId: run.id,
      output,
    });
    expect(complete).toHaveBeenCalledWith(run.id, output);
    database.close();
  });

  it("starts the linked recovery run when Crawler reports collection completion", async () => {
    const database = new DatabaseSync(":memory:");
    initSchema(database);
    const store = createStore(database);
    const user = store.listUsers()[0]!;
    const session = store.createAgentSession({
      orgId: user.orgId,
      userId: user.id,
      title: "Recovery transport",
    });
    const source = store.createAgentRun({
      sessionId: session.id,
      orgId: user.orgId,
      userId: user.id,
      taskType: "investigation",
      input: "Investigate category 1",
      model: "gpt-5.6-sol",
      fallbackModel: "gpt-5.6-terra",
    });
    const recovery = store.createAgentRun({
      sessionId: session.id,
      orgId: user.orgId,
      userId: user.id,
      taskType: "recovery",
      input: "Re-evaluate after collection",
      model: source.model,
      fallbackModel: source.fallbackModel,
      recoveryOfRunId: source.id,
    });
    store.appendAgentRunEvent({
      runId: recovery.id,
      type: "recovery.waiting_for_collection",
      payload: {
        jobId: 42,
        freshnessInput: { datasets: ["category"], categoryId: 1 },
      },
    });
    const starter = vi.fn();
    configureDesktopAgentStore(store);
    configureDesktopAgentRecoveryStarter(starter);

    await receiveDesktopAgentMessage({
      type: "agent.recovery.ready",
      jobId: 42,
    });

    expect(starter).toHaveBeenCalledWith(
      expect.objectContaining({ id: recovery.id, recoveryOfRunId: source.id }),
      { datasets: ["category"], categoryId: 1 },
    );
    expect(store.listAgentRunEvents(recovery.id).at(-1)).toMatchObject({
      type: "recovery.collection_completed",
      payload: { jobId: 42 },
    });
    database.close();
  });

  it("starts every waiting recovery run when a deduplicated job completes", async () => {
    const database = new DatabaseSync(":memory:");
    initSchema(database);
    const store = createStore(database);
    const user = store.listUsers()[0]!;
    const session = store.createAgentSession({
      orgId: user.orgId,
      userId: user.id,
      title: "Recovery fan-out",
    });
    const recoveries = [1, 2].map((index) => {
      const source = store.createAgentRun({
        sessionId: session.id,
        orgId: user.orgId,
        userId: user.id,
        taskType: "investigation",
        input: `Investigate category ${index}`,
        model: "gpt-5.6-sol",
        fallbackModel: "gpt-5.6-terra",
      });
      const recovery = store.createAgentRun({
        sessionId: session.id,
        orgId: user.orgId,
        userId: user.id,
        taskType: "recovery",
        input: "Re-evaluate after collection",
        model: source.model,
        fallbackModel: source.fallbackModel,
        recoveryOfRunId: source.id,
      });
      store.appendAgentRunEvent({
        runId: recovery.id,
        type: "recovery.waiting_for_collection",
        payload: {
          jobId: 42,
          freshnessInput: { datasets: ["category"], categoryId: index },
        },
      });
      return recovery;
    });
    const starter = vi.fn();
    configureDesktopAgentStore(store);
    configureDesktopAgentRecoveryStarter(starter);

    await receiveDesktopAgentMessage({
      type: "agent.recovery.ready",
      jobId: 42,
    });

    expect(starter).toHaveBeenCalledTimes(2);
    expect(starter).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: recoveries[0]!.id }),
      { datasets: ["category"], categoryId: 1 },
    );
    expect(starter).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: recoveries[1]!.id }),
      { datasets: ["category"], categoryId: 2 },
    );
    for (const recovery of recoveries) {
      expect(store.listAgentRunEvents(recovery.id).at(-1)).toMatchObject({
        type: "recovery.collection_completed",
        payload: { jobId: 42 },
      });
    }
    database.close();
  });

  it("fails active runs when the Agent process exits and never replays them", async () => {
    const database = new DatabaseSync(":memory:");
    initSchema(database);
    const store = createStore(database);
    const user = store.listUsers()[0]!;
    const session = store.createAgentSession({
      orgId: user.orgId,
      userId: user.id,
      title: "Interrupted desktop run",
    });
    const run = store.createAgentRun({
      sessionId: session.id,
      orgId: user.orgId,
      userId: user.id,
      taskType: "investigation",
      input: "Investigate interruption",
      model: "gpt-5.6-sol",
      fallbackModel: "gpt-5.6-terra",
    });
    const complete = vi.fn();
    const fail = vi.fn();
    configureDesktopAgentStore(store);
    configureDesktopAgentTransport(vi.fn());
    startDesktopAgentRun(
      run,
      { datasets: ["category"] },
      {
        enabled: true,
        primaryModel: "gpt-5.6-sol",
        fallbackModel: "gpt-5.6-terra",
        reasoningEffort: "medium",
        maxTurns: 10,
        tracingDisabled: true,
      },
      { appendEvent: vi.fn(), complete, fail },
    );

    await receiveDesktopAgentMessage({
      type: "agent.process.unavailable",
      role: "agent",
      errorMessage: "Agent process exited; active runs stopped without replay",
    });
    await receiveDesktopAgentMessage({
      type: "agent.run.complete",
      runId: run.id,
      output: {
        summary: "Late result",
        conclusions: [],
        freshness: {
          status: "fresh",
          checkedAt: "2026-07-30T00:00:00.000Z",
          maxAgeHours: 24,
          oldestEvidenceAt: null,
          staleSources: [],
          dataGaps: [],
          warnings: [],
        },
        riskNotes: [],
        recommendedActions: [],
      },
    });

    expect(fail).toHaveBeenCalledWith(
      run.id,
      "Agent process exited; active runs stopped without replay",
    );
    expect(complete).not.toHaveBeenCalled();
    database.close();
  });
});
