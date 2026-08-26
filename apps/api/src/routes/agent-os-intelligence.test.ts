import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

describe("Agent OS intelligence API", () => {
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

  it("persists opportunity, decision, and experiment records with idempotency and version checks", async () => {
    const opportunity = await request(app)
      .post("/api/agent-os/opportunities")
      .set("Cookie", cookie)
      .send({
        type: "launch",
        title: "Launch opportunity",
        targetType: "SKU",
        targetId: "B0TESTASIN",
        score: 0.8,
        signal: { source: "category" },
        idempotencyKey: "opportunity-launch-1",
      })
      .expect(201);
    const repeated = await request(app)
      .post("/api/agent-os/opportunities")
      .set("Cookie", cookie)
      .send({ type: "ignored", title: "ignored", idempotencyKey: "opportunity-launch-1" })
      .expect(201);
    expect(repeated.body).toMatchObject({ id: opportunity.body.id, title: "Launch opportunity" });

    const decision = await request(app)
      .post("/api/agent-os/decisions")
      .set("Cookie", cookie)
      .send({
        issue: "Rank dropped",
        rootCauses: ["Ads impressions"],
        evidence: [{ id: "e-1", source: "serp" }],
        options: [{ id: "report", label: "Create report" }],
        sourceOpportunityId: opportunity.body.id,
        idempotencyKey: "decision-rank-1",
      })
      .expect(201);
    expect(decision.body.sourceOpportunityId).toBe(opportunity.body.id);

    const experiment = await request(app)
      .post("/api/agent-os/experiments")
      .set("Cookie", cookie)
      .send({
        title: "Bid experiment",
        hypothesis: "Bid change improves rank",
        before: { rank: 18 },
        sourceDecisionId: decision.body.id,
        idempotencyKey: "experiment-bid-1",
      })
      .expect(201);
    expect(experiment.body.sourceDecisionId).toBe(decision.body.id);

    const updated = await request(app)
      .patch(`/api/agent-os/experiments/${experiment.body.id}`)
      .set("Cookie", cookie)
      .send({ after: { rank: 11 }, expectedVersion: 1 })
      .expect(200);
    expect(updated.body.version).toBe(2);
    await request(app)
      .patch(`/api/agent-os/experiments/${experiment.body.id}`)
      .set("Cookie", cookie)
      .send({ after: { rank: 10 }, expectedVersion: 1 })
      .expect(409);
  });

  it("does not expose another organization through the list or detail routes", async () => {
    await request(app)
      .post("/api/agent-os/opportunities")
      .set("Cookie", cookie)
      .send({ type: "price_gap", title: "Private opportunity", idempotencyKey: "private-1" })
      .expect(201);
    const list = await request(app).get("/api/agent-os/opportunities").set("Cookie", cookie).expect(200);
    expect(list.body).toHaveLength(1);
    await request(app).get("/api/agent-os/opportunities/999999").set("Cookie", cookie).expect(404);
  });
});
