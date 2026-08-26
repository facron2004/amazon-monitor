import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

describe("Agent OS API", () => {
  let db: DatabaseSync;
  let app: ReturnType<typeof createApiApp>;
  let cookie: string;

  beforeEach(async () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    app = createApiApp(createStore(db));
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" })
      .expect(200);
    cookie = login.headers["set-cookie"][0] as string;
  });

  afterEach(() => db.close());

  it("builds a Supervisor plan behind the evidence gate", async () => {
    const response = await request(app)
      .post("/api/agent-os/supervisor/plan")
      .set("Cookie", cookie)
      .send({
        request: "分析广告 ACOS",
        checkedAt: "2026-08-13T00:00:00.000Z",
        dataChecks: [{ source: "ads", ageHours: 2, completeness: 1, collectionStatus: "success", mapped: true }],
      })
      .expect(200);

    expect(response.body).toMatchObject({ evidenceGate: { action: "ANALYZE" } });
    expect(response.body.tasks[0]).toMatchObject({ skill: "ads_analyst" });
  });

  it("persists an idempotent Goal and enforces optimistic version updates", async () => {
    const first = await request(app)
      .post("/api/agent-os/goals")
      .set("Cookie", cookie)
      .send({
        type: "sales",
        metric: "revenue",
        targetValue: 1000,
        constraints: { gross_margin: 0.3 },
        idempotencyKey: "goal-sales-1",
      })
      .expect(201);

    const repeated = await request(app)
      .post("/api/agent-os/goals")
      .set("Cookie", cookie)
      .send({
        type: "sales",
        metric: "revenue",
        targetValue: 9999,
        idempotencyKey: "goal-sales-1",
      })
      .expect(201);
    expect(repeated.body).toMatchObject({ id: first.body.id, targetValue: 1000, version: 1 });

    const nullable = await request(app)
      .post("/api/agent-os/goals")
      .set("Cookie", cookie)
      .send({ type: "launch", metric: "rating", targetValue: null, idempotencyKey: "goal-null-1" })
      .expect(201);
    expect(nullable.body.targetValue).toBeNull();

    const updated = await request(app)
      .patch(`/api/agent-os/goals/${first.body.id}`)
      .set("Cookie", cookie)
      .send({ currentValue: 420, expectedVersion: 1 })
      .expect(200);
    expect(updated.body).toMatchObject({ currentValue: 420, version: 2 });

    await request(app)
      .patch(`/api/agent-os/goals/${first.body.id}`)
      .set("Cookie", cookie)
      .send({ currentValue: 421, expectedVersion: 1 })
      .expect(409);
  });

  it("round-trips Memory, Workflow Run, and Action Proposal records", async () => {
    const memory = await request(app)
      .post("/api/agent-os/memory")
      .set("Cookie", cookie)
      .send({
        memoryType: "DECISION",
        title: "Pricing observation",
        content: { summary: "Keep margin above floor" },
        tags: ["pricing"],
        confidence: 0.92,
        idempotencyKey: "memory-pricing-1",
      })
      .expect(201);
    expect(memory.body).toMatchObject({ memoryType: "DECISION", confidence: 0.92 });

    const run = await request(app)
      .post("/api/agent-os/workflows/runs")
      .set("Cookie", cookie)
      .send({
        workflowId: "pricing-review",
        triggerType: "goal",
        status: "COMPLETED",
        context: { asin: "B000TEST01" },
        plan: ["读取销售数据", "生成价格建议"],
        evidence: [{ id: "sales-1", source: "sales", summary: "fresh" }],
        snapshot: { schemaVersion: 1, currentNodeId: "生成价格建议", pending: null },
        idempotencyKey: "workflow-pricing-1",
      })
      .expect(201);
    expect(run.body).toMatchObject({
      workflowId: "pricing-review",
      status: "COMPLETED",
      snapshot: { schemaVersion: 1, currentNodeId: "生成价格建议" },
    });

    const action = await request(app)
      .post("/api/agent-os/actions")
      .set("Cookie", cookie)
      .send({
        workflowRunId: run.body.id,
        type: "CREATE_TASK",
        targetType: "SKU",
        targetId: "B000TEST01",
        proposedValue: { title: "Review price" },
        reason: "Evidence indicates a margin-safe review is needed",
        evidence: [{ id: "sales-1", source: "sales" }],
        riskLevel: "LOW",
        idempotencyKey: "action-pricing-1",
      })
      .expect(201);
    expect(action.body).toMatchObject({ workflowRunId: run.body.id, riskLevel: "LOW", requiresApproval: true });

    const [memoryList, runList, actionList] = await Promise.all([
      request(app).get("/api/agent-os/memory").set("Cookie", cookie).expect(200),
      request(app).get("/api/agent-os/workflows/runs").set("Cookie", cookie).expect(200),
      request(app).get("/api/agent-os/actions").set("Cookie", cookie).expect(200),
    ]);
    expect(memoryList.body).toHaveLength(1);
    expect(runList.body).toHaveLength(1);
    expect(actionList.body).toHaveLength(1);
  });
});
