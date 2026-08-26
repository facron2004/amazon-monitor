import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

describe("Agent OS workflow routes", () => {
  let db: DatabaseSync;
  let store: ReturnType<typeof createStore>;
  let app: ReturnType<typeof createApiApp>;
  let cookie: string;

  beforeEach(async () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    store = createStore(db);
    app = createApiApp(store);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" })
      .expect(200);
    cookie = login.headers["set-cookie"][0] as string;
  });

  afterEach(() => db.close());

  it("runs a roadmap template through persisted approval and memory boundaries", async () => {
    seedFreshCollectionEvidence(store);
    const templates = await request(app)
      .get("/api/agent-os/workflows/templates")
      .set("Cookie", cookie)
      .expect(200);
    expect(templates.body).toHaveLength(7);

    const paused = await request(app)
      .post("/api/agent-os/workflows/execute")
      .set("Cookie", cookie)
      .send({
        workflowId: "competitor-price-drop",
        triggerType: "COMPETITOR_PRICE_DROP",
        input: { dataQualityStatus: "TRUSTED", priceResponse: "defend-margin" },
        idempotencyKey: "route-workflow-1",
      })
      .expect(201);
    expect(paused.body.run).toMatchObject({ status: "PAUSED", workflowId: "competitor-price-drop" });
    expect(paused.body.snapshot.pending.kind).toBe("approval");

    const completed = await request(app)
      .post(`/api/agent-os/workflows/runs/${paused.body.run.id}/resume`)
      .set("Cookie", cookie)
      .send({ approval: "approved" })
      .expect(200);
    expect(completed.body.run.status).toBe("COMPLETED");
    expect(completed.body.actionProposals).toHaveLength(1);
    expect(completed.body.memories).toHaveLength(1);

    const repeated = await request(app)
      .post("/api/agent-os/workflows/execute")
      .set("Cookie", cookie)
      .send({
        workflowId: "competitor-price-drop",
        triggerType: "COMPETITOR_PRICE_DROP",
        input: { dataQualityStatus: "STALE" },
        idempotencyKey: "route-workflow-1",
      })
      .expect(201);
    expect(repeated.body.run.id).toBe(paused.body.run.id);
    expect(repeated.body.actionProposals).toHaveLength(1);
  });

  it("ignores caller-supplied TRUSTED status when the real store has no evidence", async () => {
    const blocked = await request(app)
      .post("/api/agent-os/workflows/execute")
      .set("Cookie", cookie)
      .send({
        workflowId: "rank-drop-investigation",
        triggerType: "RANK_DROP_EVENT",
        input: { dataQualityStatus: "TRUSTED", rankResponse: "investigate" },
        idempotencyKey: "route-workflow-real-gate-1",
      })
      .expect(201);

    expect(blocked.body.run.status).toBe("FAILED");
    expect(blocked.body.snapshot.input.dataQuality.status).toBe("INVALID");
    expect(blocked.body.snapshot.error).toContain("Data quality gate blocked");
  });

  it("rejects an unknown workflow template before starting a run", async () => {
    await request(app)
      .post("/api/agent-os/workflows/execute")
      .set("Cookie", cookie)
      .send({ workflowId: "not-a-roadmap-template", input: {} })
      .expect(404);
  });

  it("blocks approval resume when current evidence is no longer usable", async () => {
    seedFreshCollectionEvidence(store);
    const paused = await request(app)
      .post("/api/agent-os/workflows/execute")
      .set("Cookie", cookie)
      .send({
        workflowId: "rank-drop-investigation",
        triggerType: "RANK_DROP_EVENT",
        input: { rankResponse: "investigate" },
        idempotencyKey: "route-workflow-stale-resume-1",
      })
      .expect(201);
    expect(paused.body.run.status).toBe("PAUSED");

    store.createDataSource({
      orgId: 1,
      name: "Evidence failed during approval",
      sourceType: "manual",
      status: "connected",
      syncStatus: "failed",
      lastSyncedAt: "2020-01-01T00:00:00.000Z",
      lastSuccessAt: "2020-01-01T00:00:00.000Z",
      syncError: "collector unavailable",
    });

    await request(app)
      .post(`/api/agent-os/workflows/runs/${paused.body.run.id}/resume`)
      .set("Cookie", cookie)
      .send({ approval: "approved" })
      .expect(409);
    const run = await request(app)
      .get(`/api/agent-os/workflows/runs/${paused.body.run.id}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(run.body.status).toBe("PAUSED");
  });
});

function seedFreshCollectionEvidence(store: ReturnType<typeof createStore>): void {
  for (const taskType of ["keyword", "category"] as const) {
    const job = store.pushJob(taskType, 1, "2026-08-14", 1);
    const claimed = store.claimNextJob(`workflow-route-test-${taskType}`, 60_000);
    if (!claimed) throw new Error(`Could not claim ${taskType} test job ${job.id}`);
    if (!store.completeJob(claimed.id, claimed.leaseOwner, claimed.leaseToken)) {
      throw new Error(`Could not complete ${taskType} test job ${job.id}`);
    }
  }
}
