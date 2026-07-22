import { DatabaseSync } from "node:sqlite";
import type { SerpSnapshot } from "@amazon-monitor/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";
import type { Store } from "../store/types.js";

let db: DatabaseSync;
let store: Store;
let app: ReturnType<typeof createApiApp>;
let token: string;

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
});

afterEach(() => {
  db.close();
});

describe("rule routes", () => {
  it("returns the PRD P0 rule catalog with default configs", async () => {
    const response = await request(app)
      .get("/api/rules")
      .set("x-amazon-monitor-session", token)
      .expect(200);

    expect(response.body).toHaveLength(10);
    expect(response.body.filter((rule: { capability: string }) => rule.capability === "live")).toHaveLength(10);
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: "competitor_price_drop_001",
        category: "competitor",
        config: expect.objectContaining({
          enabled: true,
          severity: "critical",
          source: "default"
        })
      }),
      expect.objectContaining({
        ruleId: "listing_health_low_001",
        category: "listing",
        capability: "live",
        dataRequirements: ["我方 Listing 健康评分"]
      })
    ]));
  });

  it("evaluates enabled owned-operation rules into organization-scoped insight events", async () => {
    const product = store.createProduct({
      orgId: 1,
      marketplace: "amazon.com",
      sku: "RULE-ICE-001",
      asin: "B0RULEICE1",
      brand: "Acme",
      title: "Rule Runtime Ice Maker",
      status: "active"
    });
    store.upsertProductDailyMetric({
      productId: product.id,
      date: "2026-07-16",
      rating: 4.7
    });
    store.upsertProductDailyMetric({
      productId: product.id,
      date: "2026-07-17",
      unitsSold: 10,
      inventoryAvailable: 80,
      inventoryDays: 8,
      rating: 4.4
    });
    const keyword = store.createKeyword({
      keyword: "countertop ice maker",
      marketplace: "amazon.com",
      priority: "S"
    });
    store.insertSnapshots([
      keywordSnapshot(keyword.id, product.asin, "2026-07-16", 42),
      keywordSnapshot(keyword.id, product.asin, "2026-07-17", 55)
    ]);
    store.upsertInventorySetting({
      productId: product.id,
      leadTimeDays: 14,
      safetyStockDays: 14,
      targetStockDays: 45
    });
    store.upsertAdDailyMetric({
      orgId: 1,
      productId: product.id,
      date: "2026-07-17",
      campaignId: "rule-campaign",
      campaignName: "Rule Campaign",
      spend: 60,
      sales: 100,
      acos: 0.6
    });
    store.upsertProductListingSnapshot({
      productId: product.id,
      date: "2026-07-17",
      title: "Ice Maker Ice Maker",
      bulletPoints: ["Makes ice"],
      imageUrls: [],
      coreKeywords: ["nugget ice maker"],
      reviewHighlights: [],
      qaGaps: ["How loud is it?"]
    });
    for (const [index, title] of ["Broken pump", "Stopped working", "Defective unit"].entries()) {
      store.upsertProductReview({
        productId: product.id,
        reviewDate: "2026-07-17",
        externalReviewId: `rule-review-${index}`,
        rating: 1,
        title,
        body: "The pump quality failed and the unit stopped working.",
        topics: ["quality"],
        sentiment: "negative"
      });
    }

    const result = await request(app)
      .post("/api/rules/run")
      .set("x-amazon-monitor-session", token)
      .send({ date: "2026-07-17" })
      .expect(200);

    expect(result.body).toMatchObject({
      orgId: 1,
      date: "2026-07-17",
      evaluatedRuleCount: 6,
      triggeredCount: 6
    });
    expect(result.body.events.map((event: { eventType: string }) => event.eventType)).toEqual(expect.arrayContaining([
      "INVENTORY_STOCKOUT_RISK",
      "ADS_ACOS_SPIKE",
      "KEYWORD_PAGE_DROP",
      "OWNED_RATING_DROP",
      "REVIEW_NEGATIVE_CLUSTER",
      "LISTING_HEALTH_LOW"
    ]));
    expect(result.body.events.find((event: { eventType: string }) => event.eventType === "KEYWORD_PAGE_DROP")).toMatchObject({
      keywordId: keyword.id,
      eventLevel: "P0",
      evidence: {
        keyword: "countertop ice maker",
        keywordPriority: "S",
        previousRank: 42,
        currentRank: 55
      }
    });
    expect(result.body.events.find((event: { eventType: string }) => event.eventType === "OWNED_RATING_DROP")).toMatchObject({
      eventLevel: "P1",
      evidence: {
        ratingBefore: 4.7,
        ratingAfter: 4.4,
        currentMetricDate: "2026-07-17",
        previousMetricDate: "2026-07-16"
      }
    });
    expect(store.listInsightEvents({ orgId: 1, date: "2026-07-17" })).toHaveLength(6);

    await request(app)
      .patch("/api/rules/inventory_low_stock_001")
      .set("x-amazon-monitor-session", token)
      .send({ cooldownHours: 48 })
      .expect(200);
    const cooldownRun = await request(app)
      .post("/api/rules/run")
      .set("x-amazon-monitor-session", token)
      .send({ date: "2026-07-18", ruleIds: ["inventory_low_stock_001"] })
      .expect(200);
    expect(cooldownRun.body).toMatchObject({
      evaluatedRuleCount: 1,
      triggeredCount: 0,
      skipped: [expect.objectContaining({ ruleId: "inventory_low_stock_001", reason: "cooldown" })]
    });

    await request(app)
      .patch("/api/rules/listing_health_low_001")
      .set("x-amazon-monitor-session", token)
      .send({ conditions: [{ metric: "listing_health_score", operator: "<", value: 20 }] })
      .expect(200);
    const rerun = await request(app)
      .post("/api/rules/run")
      .set("x-amazon-monitor-session", token)
      .send({ date: "2026-07-17", ruleIds: ["listing_health_low_001"] })
      .expect(200);
    expect(rerun.body).toMatchObject({ evaluatedRuleCount: 1, triggeredCount: 0 });
  });

  it("persists overrides, filters by enabled state, and resets to defaults", async () => {
    const patch = await request(app)
      .patch("/api/rules/ads_acos_over_target_001")
      .set("x-amazon-monitor-session", token)
      .send({
        enabled: false,
        severity: "medium",
        cooldownHours: 12,
        notes: "Pause while testing imported ads data.",
        conditions: [
          { metric: "acos_over_target_pct", operator: ">=", value: 45, unit: "%" }
        ]
      })
      .expect(200);

    expect(patch.body).toMatchObject({
      ruleId: "ads_acos_over_target_001",
      config: {
        enabled: false,
        severity: "medium",
        cooldownHours: 12,
        notes: "Pause while testing imported ads data.",
        source: "customized"
      }
    });
    expect(patch.body.config.conditions).toEqual([
      { metric: "acos_over_target_pct", operator: ">=", value: 45, unit: "%" }
    ]);

    const disabled = await request(app)
      .get("/api/rules?enabled=false")
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(disabled.body.map((rule: { ruleId: string }) => rule.ruleId)).toEqual(["ads_acos_over_target_001"]);

    const reset = await request(app)
      .delete("/api/rules/ads_acos_over_target_001/config")
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(reset.body.config).toMatchObject({
      enabled: true,
      severity: "high",
      source: "default"
    });
  });

  it("requires authentication for rule catalog access", async () => {
    await request(app).get("/api/rules").expect(401);
  });

  it("allows managers to manage rules and rejects operators without manage_rules", async () => {
    store.createUser({
      orgId: 1,
      username: "rule-manager",
      password: "Manager123!",
      role: "manager",
      displayName: "Rule Manager"
    });
    const managerToken = await loginAs("rule-manager", "Manager123!");

    await request(app)
      .patch("/api/rules/competitor_price_drop_001")
      .set("x-amazon-monitor-session", managerToken)
      .send({ enabled: false, notes: "Manager-approved pause" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.config).toMatchObject({
          enabled: false,
          notes: "Manager-approved pause",
          source: "customized"
        });
      });

    store.createUser({
      orgId: 1,
      username: "rule-operator",
      password: "Operator123!",
      role: "operator",
      displayName: "Rule Operator"
    });
    const operatorToken = await loginAs("rule-operator", "Operator123!");

    await request(app)
      .patch("/api/rules/competitor_price_drop_001")
      .set("x-amazon-monitor-session", operatorToken)
      .send({ enabled: true })
      .expect(403);
    await request(app)
      .post("/api/rules/run")
      .set("x-amazon-monitor-session", operatorToken)
      .send({ date: "2026-07-17" })
      .expect(403);
  });
});

function keywordSnapshot(
  keywordId: number,
  asin: string,
  snapshotDate: string,
  organicRank: number
): SerpSnapshot {
  return {
    keywordId,
    keyword: "countertop ice maker",
    marketplace: "amazon.com",
    snapshotDate,
    pageNo: Math.ceil(organicRank / 48),
    positionInPage: ((organicRank - 1) % 48) + 1,
    absoluteRank: organicRank,
    organicRank,
    sponsoredRank: null,
    asin,
    title: "Rule Runtime Ice Maker",
    brand: "Acme",
    imageUrl: null,
    productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice: 99,
    originalPrice: null,
    couponText: null,
    couponValue: null,
    couponRate: null,
    finalEstimatedPrice: 99,
    currency: "$",
    rating: 4.4,
    reviewCount: 100,
    isSponsored: false,
    isPrime: true,
    dealBadge: null,
    deliveryText: null,
    bsrRank: null,
    bsrCategory: null,
    bsrText: null,
    bestsellerRanks: [],
    detailCollectedAt: null
  };
}
