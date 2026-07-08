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
    sku: "ICE-ADS-001",
    asin: "B0ADSICE01",
    brand: "Acme",
    title: "Acme Countertop Ice Maker",
    status: "active"
  });
  productId = product.id;
});

afterEach(() => {
  db.close();
});

describe("ads routes", () => {
  it("stores Ads daily metrics and summarizes risk and scale opportunities", async () => {
    await request(app)
      .post("/api/ads/metrics")
      .set("x-amazon-monitor-session", token)
      .send({
        productId,
        date: "2026-07-06",
        campaignId: "camp-risk",
        campaignName: "Risk campaign",
        adGroupName: "Exact",
        targetText: "countertop ice maker",
        clicks: 70,
        spend: 40,
        sales: 60,
        orders: 3
      })
      .expect(201);

    await request(app)
      .post("/api/ads/metrics")
      .set("x-amazon-monitor-session", token)
      .send({
        productId,
        date: "2026-07-07",
        campaignId: "camp-risk",
        campaignName: "Risk campaign",
        adGroupName: "Exact",
        targetText: "countertop ice maker",
        impressions: 1200,
        clicks: 80,
        spend: 80,
        sales: 50,
        orders: 2,
        budget: 100
      })
      .expect(201);

    await request(app)
      .post("/api/ads/metrics")
      .set("x-amazon-monitor-session", token)
      .send({
        productId,
        date: "2026-07-07",
        campaignId: "camp-scale",
        campaignName: "Scale campaign",
        adGroupName: "Phrase",
        targetText: "nugget ice maker",
        impressions: 1800,
        clicks: 100,
        spend: 30,
        sales: 300,
        orders: 12,
        budget: 32,
        budgetUsageRate: 0.95
      })
      .expect(201);

    const summary = await request(app)
      .get("/api/ads/summary?date=2026-07-07")
      .set("x-amazon-monitor-session", token)
      .expect(200);

    expect(summary.body).toMatchObject({
      date: "2026-07-07",
      totalSpend: 110,
      totalSales: 350,
      riskCount: 1,
      scaleCount: 1
    });
    expect(summary.body.items.map((item: { level: string }) => item.level)).toEqual(["risk", "scale"]);
    expect(summary.body.items[0].insights[0]).toMatchObject({
      type: "acos_high",
      priority: "P0"
    });
    expect(summary.body.items[0].insights.map((insight: { type: string }) => insight.type)).toContain("spend_spike");
    expect(summary.body.items[1].insights[0]).toMatchObject({
      type: "scale_opportunity",
      priority: "P1"
    });

    const filtered = await request(app)
      .get("/api/ads/summary?date=2026-07-07&level=scale")
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].level).toBe("scale");
  });

  it("generates approval-gated Ads Analyst Agent output", async () => {
    await request(app)
      .post("/api/ads/metrics")
      .set("x-amazon-monitor-session", token)
      .send({
        productId,
        date: "2026-07-08",
        campaignId: "camp-waste",
        campaignName: "Waste campaign",
        targetText: "portable ice machine",
        clicks: 65,
        spend: 95,
        sales: 0,
        orders: 0
      })
      .expect(201);

    const analysis = await request(app)
      .post("/api/ai/analyze-ads")
      .set("x-amazon-monitor-session", token)
      .send({ date: "2026-07-08" })
      .expect(201);

    expect(analysis.body.output.summary).toContain("Ads targets reviewed");
    expect(analysis.body.output.recommended_actions[0]).toMatchObject({
      priority: "P0",
      needs_human_approval: true
    });
    expect(analysis.body.run).toMatchObject({
      agentType: "ads_analyst",
      status: "success",
      model: "deterministic-ads-analyst-v1"
    });
    expect(analysis.body.summary.riskCount).toBe(1);
    expect(store.listAiRuns({ agentType: "ads_analyst" })).toHaveLength(1);
  });
});
