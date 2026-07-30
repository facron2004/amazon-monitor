import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApiApp } from "../server.js";
import {
  AgentRuntimeService,
  resolveAgentActionRiskLevel,
} from "../services/agent-runtime-service.js";
import { SqliteAgentSession } from "../services/sqlite-agent-session.js";
import { createStore, initSchema } from "../store.js";

describe("Agent API", () => {
  let db: DatabaseSync;
  let store: ReturnType<typeof createStore>;
  let app: ReturnType<typeof createApiApp>;
  let cookie: string;

  beforeEach(async () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    store = createStore(db);
    const runtime = new AgentRuntimeService(store, {
      enabled: false,
      primaryModel: "gpt-5.6-sol",
      fallbackModel: "gpt-5.6-terra",
      reasoningEffort: "medium",
      maxTurns: 10,
      tracingDisabled: true,
    });
    app = createApiApp(store, { agentRuntime: runtime });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" })
      .expect(200);
    cookie = login.headers["set-cookie"][0] as string;
  });

  afterEach(() => db.close());

  it("creates and reads organization-scoped Agent sessions", async () => {
    const created = await request(app)
      .post("/api/agent/sessions")
      .set("Cookie", cookie)
      .send({ title: "ASIN investigation" })
      .expect(201);

    const detail = await request(app)
      .get(`/api/agent/sessions/${created.body.id}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(detail.body).toMatchObject({
      title: "ASIN investigation",
      messages: [],
      runs: [],
    });

    const list = await request(app)
      .get("/api/agent/sessions")
      .set("Cookie", cookie)
      .expect(200);
    expect(list.body).toHaveLength(1);
  });

  it("keeps the runtime behind AGENT_SDK_ENABLED", async () => {
    const session = await request(app)
      .post("/api/agent/sessions")
      .set("Cookie", cookie)
      .send({ title: "Patrol" })
      .expect(201);
    const response = await request(app)
      .post(`/api/agent/sessions/${session.body.id}/runs`)
      .set("Cookie", cookie)
      .send({
        input: "Run daily patrol",
        taskType: "patrol",
        freshness: { datasets: ["category"], categoryId: 1 },
      })
      .expect(503);
    expect(response.body.message).toMatch(/disabled/i);
    expect(store.listAgentRuns({ orgId: 1 })).toEqual([]);
  });

  it("enforces server-owned risk levels for model-proposed actions", () => {
    expect(resolveAgentActionRiskLevel("create_task")).toBe("L2");
    expect(resolveAgentActionRiskLevel("recollect")).toBe("L2");
    expect(resolveAgentActionRiskLevel("monitor_asin")).toBe("L2");
    expect(resolveAgentActionRiskLevel("send_feishu_report")).toBe("L3");
    expect(resolveAgentActionRiskLevel("export_report")).toBe("L3");
  });

  it("persists complete SDK session items without exposing them as chat messages", async () => {
    const user = store.listUsers()[0];
    const session = store.createAgentSession({
      orgId: user.orgId,
      userId: user.id,
      title: "Session persistence",
    });
    const sdkSession = new SqliteAgentSession(store, session.id);
    await sdkSession.addItems([{
      role: "user",
      content: "Investigate B000TEST01",
    }]);

    expect(await sdkSession.getItems()).toEqual([{
      role: "user",
      content: "Investigate B000TEST01",
    }]);
    expect(store.listAgentMessages(session.id)[0]?.content).toBe("[sdk session item]");
    expect(await sdkSession.popItem()).toEqual({
      role: "user",
      content: "Investigate B000TEST01",
    });
    expect(await sdkSession.getItems()).toEqual([]);
  });

  it("executes an approved L2 proposal exactly once across repeated clicks", async () => {
    const proposal = createProposal("create_task", "L2", {
      title: "Review price response",
      description: "Validate the Agent recommendation",
      taskType: "price",
      priority: "P1",
      relatedAsin: "B000TEST01",
    });

    const first = await request(app)
      .post(`/api/agent/actions/${proposal.id}/approve`)
      .set("Cookie", cookie)
      .send({ expectedVersion: 1 })
      .expect(200);
    const repeated = await request(app)
      .post(`/api/agent/actions/${proposal.id}/approve`)
      .set("Cookie", cookie)
      .send({ expectedVersion: 1 })
      .expect(200);

    expect(first.body.execution.status).toBe("completed");
    expect(repeated.body.execution.id).toBe(first.body.execution.id);
    expect(store.listTasks({ orgId: 1, sourceType: "agent_run" })).toHaveLength(1);
  });

  it("expires a modified proposal and requires explicit L3 confirmation", async () => {
    const original = createProposal("export_report", "L3", { format: "md" });
    const modified = await request(app)
      .post(`/api/agent/actions/${original.id}/modify`)
      .set("Cookie", cookie)
      .send({
        expectedVersion: 1,
        title: "Export JSON report",
        payload: { format: "json" },
      })
      .expect(201);

    expect(modified.body.previous.status).toBe("expired");
    expect(modified.body.replacement).toMatchObject({
      version: 2,
      status: "pending",
      supersedesProposalId: original.id,
    });
    await request(app)
      .post(`/api/agent/actions/${original.id}/execute`)
      .set("Cookie", cookie)
      .send({ confirmL3: true })
      .expect(409);

    const replacementId = modified.body.replacement.id as number;
    await request(app)
      .post(`/api/agent/actions/${replacementId}/approve`)
      .set("Cookie", cookie)
      .send({ expectedVersion: 1 })
      .expect(200)
      .expect((response) => expect(response.body.execution).toBeNull());
    await request(app)
      .post(`/api/agent/actions/${replacementId}/execute`)
      .set("Cookie", cookie)
      .send({})
      .expect(409);
    const executed = await request(app)
      .post(`/api/agent/actions/${replacementId}/execute`)
      .set("Cookie", cookie)
      .send({ confirmL3: true })
      .expect(200);
    expect(executed.body.status).toBe("completed");
  });

  it("exports organization-scoped evidence, approvals, and executions", async () => {
    const proposal = createProposal("create_task", "L2", {
      title: "Audit task",
      taskType: "other",
      priority: "P2",
    });
    store.appendAgentRunEvent({
      runId: proposal.runId,
      type: "tool.completed",
      payload: { tool: "check_data_freshness" },
    });
    await request(app)
      .post(`/api/agent/actions/${proposal.id}/approve`)
      .set("Cookie", cookie)
      .send({ expectedVersion: 1 })
      .expect(200);

    const audit = await request(app)
      .get(`/api/agent/audit?runId=${proposal.runId}`)
      .set("Cookie", cookie)
      .expect(200);

    expect(audit.body.runs).toHaveLength(1);
    expect(audit.body.runs[0].events[0]).toMatchObject({
      type: "tool.completed",
    });
    expect(audit.body.runs[0].proposals[0].approvals).toHaveLength(1);
    expect(audit.body.runs[0].proposals[0].executions).toHaveLength(1);
  });

  it("creates one linked recovery run for an approved recollection", async () => {
    const proposal = createProposal("recollect", "L2", {
      taskType: "category",
      targetId: 42,
      date: "2026-07-29",
    });

    const approved = await request(app)
      .post(`/api/agent/actions/${proposal.id}/approve`)
      .set("Cookie", cookie)
      .send({ expectedVersion: 1 })
      .expect(200);

    const result = approved.body.execution.result as {
      jobId: number;
      recoveryRunId: number;
    };
    const recovery = store.getAgentRun(result.recoveryRunId, 1);
    expect(recovery).toMatchObject({
      taskType: "recovery",
      recoveryOfRunId: proposal.runId,
      status: "created",
    });
    expect(store.getAgentRecoveryRunForJob(result.jobId)).toMatchObject({
      run: { id: result.recoveryRunId },
      freshnessInput: {
        datasets: ["category", "price", "promotion", "review"],
        categoryId: 42,
      },
    });
  });

  function createProposal(
    actionType: "create_task" | "export_report" | "recollect",
    riskLevel: "L2" | "L3",
    payload: Record<string, unknown>,
  ) {
    const user = store.listUsers()[0];
    const session = store.createAgentSession({
      orgId: user.orgId,
      userId: user.id,
      title: "Action test",
    });
    const run = store.createAgentRun({
      sessionId: session.id,
      orgId: user.orgId,
      userId: user.id,
      taskType: "action",
      input: "Create an action",
      model: "gpt-5.6-sol",
      fallbackModel: "gpt-5.6-terra",
    });
    return store.createActionProposal({
      runId: run.id,
      orgId: user.orgId,
      actionType,
      title: "Agent action",
      payload,
      riskLevel,
      idempotencyKey: `test:${run.id}:${actionType}`,
    });
  }
});
