import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AiProductResearchResponse,
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  CategoryMonitor
} from "@amazon-monitor/shared";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

let db: DatabaseSync;
let store: ReturnType<typeof createStore>;
let app: ReturnType<typeof createApiApp>;
let token: string;

beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
  app = createApiApp(store);
  const login = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "admin123" })
    .expect(200);
  token = login.body.token as string;
});

afterEach(() => db.close());

describe("Product Research Agent route", () => {
  it("persists evidence-backed category research and keeps every action approval-gated", async () => {
    const category = createCategory();
    store.insertCategorySnapshots([
      snapshot(category, "B0RESEARCH1", "Alpha", 8, 89.99, 48),
      snapshot(category, "B0RESEARCH2", "Alpha", 22, 109.99, 180),
      snapshot(category, "B0RESEARCH3", "Beta", 46, 159.99, 1200)
    ]);
    store.replaceCategorySignals(category.id, "2026-06-19", [{
      signalDate: "2026-06-19",
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      signalType: "new_product_breakout",
      alertLevel: "P1",
      asin: "B0RESEARCH1",
      brand: "Alpha",
      title: "Alpha research product",
      rank: 8,
      previousRank: null,
      price: 89.99,
      previousPrice: null,
      content: "New product breakout"
    }]);
    store.addCategoryCompetitor("B0RESEARCH2", category.id);
    store.replaceBrandMatrix(category.id, "2026-06-19", [
      brandEvidence(category, "Alpha", 2, 2, 1, 8),
      brandEvidence(category, "Beta", 1, 1, 0, 46)
    ]);

    const response = await request(app)
      .post("/api/ai/research-product")
      .set("x-amazon-monitor-session", token)
      .send({ categoryId: category.id, date: "2026-06-19" })
      .expect(201);
    const body = response.body as AiProductResearchResponse;

    expect(body.context).toMatchObject({
      categoryId: category.id,
      snapshotCount: 3,
      brandCount: 2,
      minimumPrice: 89.99,
      medianPrice: 109.99,
      maximumPrice: 159.99,
      lowReviewTop50Count: 2
    });
    expect(body.context.recommendedCompetitors).toEqual([
      expect.objectContaining({
        asin: "B0RESEARCH1",
        candidateType: "breakout_low_review",
        isInCompetitorPool: false
      }),
      expect.objectContaining({
        asin: "B0RESEARCH2",
        candidateType: "low_review_top50",
        isInCompetitorPool: true
      })
    ]);
    expect(body.output.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining("价格带"),
      expect.stringContaining("Review VOC")
    ]));
    expect(body.output.recommended_actions.every((action) => action.needs_human_approval)).toBe(true);
    expect(body.run).toMatchObject({
      agentType: "product_research",
      model: "deterministic-product-research-v1",
      status: "success"
    });
    expect(store.listAiRuns({ agentType: "product_research" })).toHaveLength(1);
  });

  it("reports the data gap without creating a high-priority recommendation", async () => {
    const category = createCategory();
    const response = await request(app)
      .post("/api/ai/research-product")
      .set("x-amazon-monitor-session", token)
      .send({ categoryId: category.id, date: "2026-06-20" })
      .expect(201);

    expect(response.body.output.confidence).toBeLessThan(0.5);
    expect(response.body.output.summary).toContain("暂无榜单快照");
    expect(response.body.output.recommended_actions).toEqual([
      expect.objectContaining({ priority: "P2", needs_human_approval: true })
    ]);
  });

  it("derives brand evidence from snapshots when the brand matrix is unavailable", async () => {
    const category = createCategory();
    store.insertCategorySnapshots([
      snapshot(category, "B0FALLBACK1", "Northstar", 18, 99.99, 134),
      snapshot(category, "B0FALLBACK2", "Northstar", 31, 119.99, 260),
      snapshot(category, "B0FALLBACK3", "Clearice", 12, 149.99, 480)
    ]);

    const response = await request(app)
      .post("/api/ai/research-product")
      .set("x-amazon-monitor-session", token)
      .send({ categoryId: category.id, date: "2026-06-19" })
      .expect(201);

    expect(response.body.context).toMatchObject({
      brandCount: 2,
      topBrands: [
        { brand: "Northstar", top100Count: 2, top20Count: 1, bestRank: 18 },
        { brand: "Clearice", top100Count: 1, top20Count: 1, bestRank: 12 }
      ]
    });
  });

  it("rejects roles without competitor research capability", async () => {
    const category = createCategory();
    store.createUser({
      orgId: 1,
      username: "ads-only",
      password: "AdsOnly123!",
      role: "ads_operator"
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "ads-only", password: "AdsOnly123!" })
      .expect(200);

    await request(app)
      .post("/api/ai/research-product")
      .set("x-amazon-monitor-session", login.body.token as string)
      .send({ categoryId: category.id, date: "2026-06-20" })
      .expect(403);
  });
});

function createCategory(): CategoryMonitor {
  return store.createCategoryMonitor({
    name: "Ice Makers",
    marketplace: "amazon.com",
    categoryUrl: "https://www.amazon.com/Best-Sellers-Ice-Makers/zgbs",
    categoryPath: "Appliances > Ice Makers",
    crawlTopN: 100,
    status: "enabled"
  });
}

function snapshot(
  category: CategoryMonitor,
  asin: string,
  brand: string,
  rank: number,
  price: number,
  reviewCount: number
): BestsellerRankSnapshot {
  return {
    categoryId: category.id,
    categoryName: category.name,
    marketplace: category.marketplace,
    snapshotDate: "2026-06-19",
    rank,
    asin,
    title: `${brand} research product`,
    brand,
    imageUrl: `https://example.com/${asin}.jpg`,
    productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice: price,
    originalPrice: null,
    couponText: null,
    currency: "USD",
    rating: 4.4,
    reviewCount,
    isPrime: true,
    dealBadge: null,
    couponValue: null,
    couponRate: null,
    finalEstimatedPrice: price,
    bsrRank: rank,
    bsrCategory: category.name
  };
}

function brandEvidence(
  category: CategoryMonitor,
  brand: string,
  top100: number,
  top50: number,
  top20: number,
  bestRank: number
): BrandMatrixSnapshot {
  return {
    categoryId: category.id,
    categoryName: category.name,
    marketplace: category.marketplace,
    snapshotDate: "2026-06-19",
    brand,
    productCountTop100: top100,
    productCountTop50: top50,
    productCountTop20: top20,
    bestRank,
    averageRank: bestRank,
    newEntryCount: 0,
    droppedCount: 0,
    rankUpCount: 0,
    rankDownCount: 0,
    priceDownCount: 0,
    couponCount: 0,
    dealCount: 0,
    topAsins: []
  };
}
