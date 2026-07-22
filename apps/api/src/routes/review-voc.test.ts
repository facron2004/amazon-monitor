import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";
import type { Store } from "../store/types.js";

let db: DatabaseSync;
let store: Store;
let app: ReturnType<typeof createApiApp>;
let token: string;
let productId: number;

async function loginAsAdmin(): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "admin123" })
    .expect(200);
  return response.body.token as string;
}

beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
  app = createApiApp(store);
  token = await loginAsAdmin();
  const org = store.listOrganizations()[0];
  const product = store.createProduct({
    orgId: org.id,
    marketplace: "US",
    sku: "ICE-VOC-001",
    asin: "B0VOCICE01",
    brand: "Acme",
    title: "Acme Nugget Ice Maker",
    status: "active"
  });
  productId = product.id;
});

afterEach(() => {
  db.close();
});

describe("review VOC routes", () => {
  it("stores review evidence and summarizes VOC risks", async () => {
    const empty = await request(app)
      .get("/api/review-voc?date=2026-07-08")
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(empty.body[0]).toMatchObject({
      productId,
      reviewCount: 0,
      level: "watch",
      issues: [{ type: "data_gap" }]
    });

    await saveReview({
      reviewDate: "2026-07-07",
      rating: 1,
      title: "Stopped working",
      body: "The machine stopped working after two days and the quality feels defective.",
      topics: ["quality"]
    });
    await saveReview({
      reviewDate: "2026-07-08",
      rating: 2,
      title: "Too loud",
      body: "It is loud and noisy, much worse than expected.",
      topics: ["noise"]
    });
    await saveReview({
      reviewDate: "2026-07-08",
      rating: 1,
      title: "Bad smell",
      body: "Cleaning is hard and there is an odor after use.",
      topics: ["cleaning"]
    });

    const summary = await request(app)
      .get(`/api/products/${productId}/review-voc?date=2026-07-08`)
      .set("x-amazon-monitor-session", token)
      .expect(200);

    expect(summary.body).toMatchObject({
      productId,
      reviewCount: 3,
      negativeCount: 3,
      level: "risk"
    });
    expect(summary.body.issues[0]).toMatchObject({
      type: "negative_cluster",
      priority: "P0"
    });
    expect(summary.body.topTopics.map((topic: { topic: string }) => topic.topic)).toEqual(
      expect.arrayContaining(["quality", "noise", "cleaning"])
    );

    const reviews = await request(app)
      .get(`/api/products/${productId}/reviews?date=2026-07-08`)
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(reviews.body).toHaveLength(3);
  });

  it("generates approval-gated Review VOC Agent output", async () => {
    await saveReview({
      reviewDate: "2026-07-08",
      rating: 1,
      title: "Defective unit",
      body: "Broken unit, defective pump, and support asked me to return it.",
      topics: ["quality", "support"]
    });
    await saveReview({
      reviewDate: "2026-07-08",
      rating: 1,
      title: "Leaking",
      body: "Water leak from the base and the unit stopped working.",
      topics: ["quality"]
    });
    await saveReview({
      reviewDate: "2026-07-08",
      rating: 2,
      title: "Poor quality",
      body: "Poor quality and very noisy.",
      topics: ["quality", "noise"]
    });

    const analysis = await request(app)
      .post("/api/ai/analyze-review-voc")
      .set("x-amazon-monitor-session", token)
      .send({ productId, date: "2026-07-08" })
      .expect(201);

    expect(analysis.body.output.summary).toContain("ICE-VOC-001");
    expect(analysis.body.output.recommended_actions[0]).toMatchObject({
      priority: "P0",
      needs_human_approval: true
    });
    expect(analysis.body.output.artifacts.reviewVoc).toMatchObject({
      supplierActions: expect.arrayContaining([
        expect.objectContaining({
          topic: "quality",
          action: expect.stringContaining("corrective"),
          evidence: expect.stringContaining("negative")
        })
      ]),
      supportDrafts: expect.arrayContaining([
        expect.objectContaining({ scenario: "quality complaint" })
      ]),
      productOpportunities: expect.arrayContaining([
        expect.objectContaining({ opportunity: expect.stringContaining("failure") })
      ]),
      competitorPainComparison: expect.arrayContaining([
        expect.objectContaining({
          topic: "quality",
          competitorEvidence: null,
          conclusion: expect.stringContaining("unavailable")
        })
      ]),
      riskNotes: expect.arrayContaining([
        expect.stringContaining("Human review")
      ])
    });
    expect(analysis.body.run).toMatchObject({
      agentType: "review_voc",
      status: "success",
      model: "deterministic-review-voc-v2"
    });
    const runs = store.listAiRuns({ agentType: "review_voc" });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.output?.artifacts?.reviewVoc?.supplierActions[0]?.topic).toBe("quality");
  });
});

async function saveReview(input: {
  reviewDate: string;
  rating: number;
  title: string;
  body: string;
  topics: string[];
}): Promise<void> {
  await request(app)
    .post(`/api/products/${productId}/reviews`)
    .set("x-amazon-monitor-session", token)
    .send(input)
    .expect(201);
}
