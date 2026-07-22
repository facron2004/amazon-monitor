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

async function loginAs(username: string, password: string): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ username, password })
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
        searchTerm: "cheap portable ice machine",
        clicks: 65,
        spend: 95,
        sales: 0,
        orders: 0
      })
      .expect(201);
    await request(app)
      .post("/api/ads/metrics")
      .set("x-amazon-monitor-session", token)
      .send({
        productId,
        date: "2026-07-08",
        campaignId: "camp-scale-agent",
        campaignName: "Scale candidate",
        targetText: "nugget ice maker",
        clicks: 100,
        spend: 30,
        sales: 300,
        orders: 12,
        budget: 32,
        budgetUsageRate: 0.95
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
    expect(analysis.body.output.artifacts.adsOptimization).toMatchObject({
      evidenceDate: "2026-07-08",
      wasteCandidates: [
        expect.objectContaining({
          campaign: "Waste campaign",
          target: "cheap portable ice machine",
          spend: 95,
          sales: 0
        })
      ],
      negativeKeywordSuggestions: [
        expect.objectContaining({
          term: "cheap portable ice machine",
          matchType: "exact"
        })
      ],
      bidAdjustments: expect.arrayContaining([
        expect.objectContaining({ campaign: "Waste campaign", direction: "decrease", suggestedChangePercent: 20 }),
        expect.objectContaining({ campaign: "Scale candidate", direction: "increase", suggestedChangePercent: 10 })
      ]),
      budgetAdjustments: expect.arrayContaining([
        expect.objectContaining({ campaign: "Scale candidate", direction: "increase" })
      ]),
      scaleCandidates: [
        expect.objectContaining({ campaign: "Scale candidate", budgetUsageRate: 0.95 })
      ],
      riskNotes: expect.arrayContaining([
        expect.stringContaining("human approval")
      ])
    });
    expect(analysis.body.run).toMatchObject({
      agentType: "ads_analyst",
      status: "success",
      model: "deterministic-ads-analyst-v2"
    });
    expect(analysis.body.summary.riskCount).toBe(1);
    expect(analysis.body.summary.scaleCount).toBe(1);
    const runs = store.listAiRuns({ agentType: "ads_analyst" });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.output?.artifacts?.adsOptimization?.scaleCandidates[0]?.campaign).toBe("Scale candidate");
  });

  it("enforces full, summary, and denied Ads access from the PRD matrix", async () => {
    await request(app)
      .post("/api/ads/metrics")
      .set("x-amazon-monitor-session", token)
      .send({
        productId,
        date: "2026-07-09",
        campaignId: "camp-sensitive",
        campaignName: "Sensitive campaign",
        adGroupName: "Sensitive ad group",
        targetText: "sensitive keyword",
        impressions: 1000,
        clicks: 70,
        spend: 80,
        sales: 200,
        orders: 8,
        budget: 100
      })
      .expect(201);

    store.createUser({ orgId: 1, username: "ads-manager", password: "Manager123!", role: "manager" });
    store.createUser({ orgId: 1, username: "ads-specialist", password: "AdsOperator123!", role: "ads_operator" });
    store.createUser({ orgId: 1, username: "ads-summary", password: "Operator123!", role: "operator" });
    store.createUser({ orgId: 1, username: "ads-researcher", password: "Researcher123!", role: "product_researcher" });
    store.createUser({ orgId: 1, username: "ads-viewer", password: "Viewer123!", role: "viewer" });

    const managerToken = await loginAs("ads-manager", "Manager123!");
    const specialistToken = await loginAs("ads-specialist", "AdsOperator123!");
    const operatorToken = await loginAs("ads-summary", "Operator123!");
    const researcherToken = await loginAs("ads-researcher", "Researcher123!");
    const viewerToken = await loginAs("ads-viewer", "Viewer123!");

    const full = await request(app)
      .get("/api/ads/summary?date=2026-07-09")
      .set("x-amazon-monitor-session", managerToken)
      .expect(200);
    expect(full.body).toMatchObject({ accessLevel: "full", totalSpend: 80, totalSales: 200 });
    expect(full.body.items[0].metric).toMatchObject({ campaignName: "Sensitive campaign", targetText: "sensitive keyword", spend: 80 });

    const partial = await request(app)
      .get("/api/ads/summary?date=2026-07-09")
      .set("x-amazon-monitor-session", operatorToken)
      .expect(200);
    expect(partial.body).toMatchObject({ accessLevel: "summary", totalSpend: null, totalSales: null });
    expect(partial.body.items[0].metric).toMatchObject({ campaignName: "Restricted campaign", targetText: null, spend: null, sales: null, acos: 0.4 });
    expect(partial.body.items[0].insights[0].evidence).toEqual([]);

    await request(app).get("/api/ads/metrics").set("x-amazon-monitor-session", operatorToken).expect(403);
    await request(app).post("/api/ads/metrics").set("x-amazon-monitor-session", operatorToken).send({}).expect(403);
    await request(app).post("/api/ai/analyze-ads").set("x-amazon-monitor-session", operatorToken).send({ date: "2026-07-09" }).expect(403);
    await request(app).get("/api/ads/summary?date=2026-07-09").set("x-amazon-monitor-session", specialistToken).expect(200);
    await request(app).post("/api/ai/analyze-ads").set("x-amazon-monitor-session", specialistToken).send({ date: "2026-07-09" }).expect(201);
    await request(app).get("/api/ads/summary?date=2026-07-09").set("x-amazon-monitor-session", researcherToken).expect(403);
    await request(app).get("/api/ads/summary?date=2026-07-09").set("x-amazon-monitor-session", viewerToken).expect(403);
  });
});
