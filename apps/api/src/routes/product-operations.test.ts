import { DatabaseSync } from "node:sqlite";
import type {
  BestsellerRankSnapshot,
  InsightEventInput,
  OwnedProductOperationsDetail,
  UserRole,
} from "@amazon-monitor/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";
import type { Store } from "../store/types.js";

const EVIDENCE_DATE = "2026-07-26";
const ASIN = "B0OWN36001";

let db: DatabaseSync;
let store: Store;
let app: ReturnType<typeof createApiApp>;
let productId: number;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
  app = createApiApp(store);
  productId = seedProductOperations();
});

afterEach(() => {
  db.close();
});

describe("product operations detail", () => {
  it("aggregates the dated SKU evidence into one organization-scoped workflow", async () => {
    const token = await login("admin", "admin123");
    const response = await request(app)
      .get(`/api/products/${productId}/operations?date=${EVIDENCE_DATE}`)
      .set("Cookie", token)
      .expect(200);
    const detail = response.body as OwnedProductOperationsDetail;

    expect(detail).toMatchObject({
      asOfDate: EVIDENCE_DATE,
      access: { ads: "full", profit: "full" },
      product: {
        id: productId,
        latestMetric: {
          salesAmount: 1299,
          adSpend: 120,
          grossMargin: 0.31,
        },
      },
      ads: { totalSpend: 120, accessLevel: "full" },
      inventory: { level: "watch" },
      listingHealth: { snapshotDate: EVIDENCE_DATE },
      reviewVoc: { reviewCount: 1, negativeCount: 1 },
    });
    expect(detail.profit?.setting?.purchaseCost).toBe(310);
    expect(detail.competitors).toEqual([
      expect.objectContaining({
        asin: "B0COMP3601",
        comparisonBasis: "same_category",
      }),
    ]);
    expect(detail.events).toEqual([
      expect.objectContaining({ asin: ASIN, eventType: "OWNED_RATING_DROP" }),
    ]);
    expect(detail.tasks).toEqual([
      expect.objectContaining({ relatedAsin: ASIN, sourceType: "ai_run" }),
    ]);
    expect(detail.agentRuns).toEqual([
      expect.objectContaining({
        agentType: "listing_optimizer",
        summary: "Listing evidence needs one correction.",
      }),
    ]);
  });

  it("preserves Ads and profit field-level access inside the aggregate", async () => {
    const operatorToken = await createAndLogin("product-operator", "operator");
    const operator = (await request(app)
      .get(`/api/products/${productId}/operations?date=${EVIDENCE_DATE}`)
      .set("Cookie", operatorToken)
      .expect(200)).body as OwnedProductOperationsDetail;

    expect(operator.access).toEqual({ ads: "summary", profit: "summary" });
    expect(operator.product.latestMetric).toMatchObject({
      adSpend: null,
      adSales: null,
      acos: 0.24,
      grossMargin: 0.31,
    });
    expect(operator.ads).toMatchObject({
      accessLevel: "summary",
      totalSpend: null,
      averageAcos: 0.24,
    });
    expect(operator.profit?.setting).toBeNull();
    expect(operator.profit?.scenarios[0]?.netProfit).toBeNull();

    const viewerToken = await createAndLogin("product-viewer", "viewer");
    const viewer = (await request(app)
      .get(`/api/products/${productId}/operations?date=${EVIDENCE_DATE}`)
      .set("Cookie", viewerToken)
      .expect(200)).body as OwnedProductOperationsDetail;
    expect(viewer.access).toEqual({ ads: "denied", profit: "denied" });
    expect(viewer.ads).toBeNull();
    expect(viewer.profit).toBeNull();
    expect(viewer.product.latestMetric).toMatchObject({
      adSpend: null,
      acos: null,
      tacos: null,
      grossMargin: null,
    });
  });

  it("does not expose a product from another organization", async () => {
    const otherOrg = store.createOrganization({ name: "Other product team" });
    store.createUser({
      orgId: otherOrg.id,
      username: "other-product-user",
      password: "OtherProduct123!",
      role: "manager",
    });
    const token = await login("other-product-user", "OtherProduct123!");
    await request(app)
      .get(`/api/products/${productId}/operations?date=${EVIDENCE_DATE}`)
      .set("Cookie", token)
      .expect(404);
  });
});

function seedProductOperations(): number {
  const product = store.createProduct({
    orgId: 1,
    marketplace: "amazon.com",
    sku: "ICE-360",
    asin: ASIN,
    brand: "Northstar",
    title: "Northstar Countertop Ice Maker",
    category: "Ice Makers",
    status: "active",
  });
  store.upsertProductDailyMetric({
    productId: product.id,
    date: EVIDENCE_DATE,
    salesAmount: 1299,
    orders: 8,
    unitsSold: 9,
    inventoryAvailable: 18,
    inventoryDays: 18,
    adSpend: 120,
    adSales: 500,
    acos: 0.24,
    tacos: 0.092,
    grossMargin: 0.31,
    bsrRank: 42,
    keywordRank: 9,
    rating: 4.1,
    reviewCount: 128,
  });
  store.upsertProductListingSnapshot({
    productId: product.id,
    date: EVIDENCE_DATE,
    title: product.title,
    bulletPoints: ["Fast ice", "Simple cleaning"],
    imageUrls: ["https://example.com/own.jpg"],
    coreKeywords: ["countertop ice maker"],
  });
  store.upsertProductReview({
    productId: product.id,
    reviewDate: EVIDENCE_DATE,
    rating: 2,
    title: "Difficult cleaning",
    body: "The cleaning process takes too long.",
    sentiment: "negative",
    topics: ["cleaning"],
  });
  store.upsertInventorySetting({
    productId: product.id,
    leadTimeDays: 20,
    safetyStockDays: 7,
    targetStockDays: 35,
  });
  store.upsertProfitSetting({
    productId: product.id,
    purchaseCost: 310,
    inboundFreight: 25,
    fbaFee: 42,
    targetMarginRate: 0.25,
    minimumMarginRate: 0.18,
  });
  store.upsertAdDailyMetric({
    orgId: 1,
    productId: product.id,
    date: EVIDENCE_DATE,
    campaignId: "campaign-360",
    campaignName: "Core exact",
    spend: 120,
    sales: 500,
    acos: 0.24,
  });

  const run = store.createAiRun({
    orgId: 1,
    agentType: "listing_optimizer",
    inputContextJson: JSON.stringify({ productId: product.id, date: EVIDENCE_DATE }),
    output: {
      summary: "Listing evidence needs one correction.",
      evidence: ["Cleaning objection is not covered."],
      impact: "Conversion may be constrained.",
      recommended_actions: [{
        action: "Review cleaning copy",
        priority: "P1",
        reason: "Review evidence",
        risk: "Claims require verification",
        needs_human_approval: true,
      }],
      confidence: 0.72,
    },
    model: "deterministic-listing-optimizer-test",
    status: "success",
  });
  store.createTask({
    orgId: 1,
    sourceType: "ai_run",
    sourceId: String(run.id),
    title: "Review cleaning copy",
    taskType: "listing",
    priority: "P1",
    relatedAsin: ASIN,
  });
  store.upsertInsightEvent(sampleOwnedEvent());

  const category = store.createCategoryMonitor({
    orgId: 1,
    name: "Ice Makers",
    marketplace: "amazon.com",
    categoryUrl: "https://www.amazon.com/Best-Sellers-Ice-Makers/zgbs",
    categoryPath: "Appliances > Ice Makers",
    crawlTopN: 100,
    status: "enabled",
  });
  store.insertCategorySnapshots([competitorSnapshot(category.id)]);
  store.addCategoryCompetitor("B0COMP3601", category.id, 1);
  return product.id;
}

function competitorSnapshot(categoryId: number): BestsellerRankSnapshot {
  return {
    categoryId,
    categoryName: "Ice Makers",
    marketplace: "amazon.com",
    snapshotDate: EVIDENCE_DATE,
    rank: 12,
    asin: "B0COMP3601",
    title: "Competitor Ice Maker",
    brand: "Rival",
    imageUrl: "https://example.com/competitor.jpg",
    productUrl: "https://www.amazon.com/dp/B0COMP3601",
    currentPrice: 189.99,
    originalPrice: null,
    couponText: "10% off",
    currency: "USD",
    rating: 4.5,
    reviewCount: 840,
    isPrime: true,
    dealBadge: null,
    couponValue: null,
    couponRate: 0.1,
    finalEstimatedPrice: 170.99,
    bsrRank: 12,
    bsrCategory: "Ice Makers",
  };
}

function sampleOwnedEvent(): InsightEventInput {
  return {
    id: `${EVIDENCE_DATE}|product:${productId}|asin:${ASIN}|OWNED_RATING_DROP`,
    orgId: 1,
    eventDate: EVIDENCE_DATE,
    asin: ASIN,
    brand: "Northstar",
    categoryId: null,
    keywordId: null,
    eventType: "OWNED_RATING_DROP",
    eventLevel: "P1",
    eventTitle: "自营 SKU 评分下降",
    eventSummary: "评分下降至 4.1。",
    attributionTags: ["REVIEW_DRIVEN"],
    evidence: {
      marketplace: "amazon.com",
      productId,
      ratingBefore: 4.4,
      ratingAfter: 4.1,
      evidenceItems: ["Rating 4.4 -> 4.1"],
    },
    scoreTotal: 72,
    scoreLevel: "A",
    scoreBreakdown: {
      rankingScore: 0,
      productScore: 30,
      promoScore: 0,
      brandScore: 0,
      riskScore: 20,
      reasons: ["评分下降"],
    },
    suggestedAction: "检查近期差评主题",
    status: "TODO",
    reviewDueDate: null,
    reviewResult: null,
    userNote: null,
  };
}

async function createAndLogin(username: string, role: UserRole): Promise<string> {
  const password = "RolePassword123!";
  store.createUser({ orgId: 1, username, password, role });
  return login(username, password);
}

async function login(username: string, password: string): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ username, password })
    .expect(200);
  return response.headers["set-cookie"][0] as string;
}
