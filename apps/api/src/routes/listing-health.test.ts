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
    sku: "ICE-001",
    asin: "B0LISTING1",
    brand: "Acme",
    title: "Acme Ice Maker",
    status: "active"
  });
  productId = product.id;
});

afterEach(() => {
  db.close();
});

describe("listing health routes", () => {
  it("lists owned SKUs with evidence-bound health scores and saves snapshots", async () => {
    const emptyList = await request(app)
      .get("/api/listing-health?date=2026-06-19")
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(emptyList.body[0]).toMatchObject({
      productId,
      snapshotId: null,
      health: { level: "risk" }
    });

    const save = await request(app)
      .post(`/api/products/${productId}/listing-snapshots`)
      .set("x-amazon-monitor-session", token)
      .send({
        date: "2026-06-19",
        title: "Nugget Ice Maker Countertop Portable Ice Machine Quiet Self Cleaning Stainless Steel",
        coreKeywords: ["nugget ice maker", "countertop ice maker"],
        bulletPoints: [
          "Quiet countertop nugget ice maker for kitchens and offices",
          "Self cleaning cycle helps reduce cleaning friction",
          "Portable stainless steel body for small spaces",
          "Fast ice production for family gatherings",
          "Clear basket and simple controls for daily use"
        ],
        imageUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg", "https://example.com/3.jpg", "https://example.com/4.jpg", "https://example.com/5.jpg"],
        reviewHighlights: ["quiet", "cleaning"],
        qaGaps: []
      })
      .expect(201);

    expect(save.body.snapshot.productId).toBe(productId);
    expect(save.body.health.health.score).toBeGreaterThanOrEqual(85);

    const list = await request(app)
      .get("/api/listing-health?date=2026-06-19&q=ICE-001")
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].snapshotDate).toBe("2026-06-19");
    expect(list.body[0].health.level).toBe("healthy");
  });

  it("generates approval-gated Listing Optimizer Agent output", async () => {
    await request(app)
      .post(`/api/products/${productId}/listing-snapshots`)
      .set("x-amazon-monitor-session", token)
      .send({
        date: "2026-06-20",
        title: "Ice Maker Ice Maker Ice Maker Ice Maker",
        coreKeywords: ["nugget ice maker", "countertop ice maker"],
        bulletPoints: ["Makes ice"],
        imageUrls: [],
        reviewHighlights: ["cleaning"],
        qaGaps: ["How do I clean it?", "How loud is it?", "Does it make nugget ice?"]
      })
      .expect(201);

    const analysis = await request(app)
      .post("/api/ai/analyze-listing")
      .set("x-amazon-monitor-session", token)
      .send({ productId, date: "2026-06-20" })
      .expect(201);

    expect(analysis.body.output.summary).toContain("Listing health score");
    expect(analysis.body.output.recommended_actions[0]).toMatchObject({
      priority: "P0",
      needs_human_approval: true
    });
    expect(analysis.body.output.artifacts.listingRewrite).toMatchObject({
      proposedTitle: expect.stringContaining("Nugget Ice Maker"),
      bullets: expect.arrayContaining([
        expect.objectContaining({
          copy: expect.stringContaining("cleaning"),
          evidence: ["Review highlight: cleaning"]
        })
      ]),
      imageBriefs: expect.arrayContaining([
        expect.objectContaining({ evidence: "Review highlight: cleaning" })
      ]),
      aPlusModules: expect.arrayContaining([
        expect.objectContaining({ module: "FAQ and operating guidance" })
      ]),
      riskNotes: expect.arrayContaining([
        expect.stringContaining("human approval")
      ])
    });
    expect(analysis.body.run).toMatchObject({
      agentType: "listing_optimizer",
      status: "success",
      model: "deterministic-listing-optimizer-v2"
    });
    const persistedRuns = store.listAiRuns({ agentType: "listing_optimizer" });
    expect(persistedRuns).toHaveLength(1);
    expect(persistedRuns[0]?.output?.artifacts?.listingRewrite?.proposedTitle).toBe(
      analysis.body.output.artifacts.listingRewrite.proposedTitle
    );
  });
});
