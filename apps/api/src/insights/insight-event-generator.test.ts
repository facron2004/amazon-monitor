import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { decorateBestsellerSnapshots, type BestSellerProductInput, type CategoryMonitor } from "@amazon-monitor/shared";
import type { AmazonBestSellerCollector, CollectedBestSellerPage } from "../category-pipeline.js";
import { runCategoryCollectionForMonitor } from "../category-pipeline.js";
import { buildCategoryBsrRankHistory } from "../category-pipeline-helpers.js";
import { createStore, initSchema } from "../store.js";
import { generateInsightEvents } from "./insight-event-generator.js";

class ControlledBestSellerCollector implements AmazonBestSellerCollector {
  constructor(private readonly productsByDate: Record<string, BestSellerProductInput[]>) {}

  async collect(category: CategoryMonitor, date: string): Promise<CollectedBestSellerPage[]> {
    return [{ pageNo: 1, url: category.categoryUrl, products: this.productsByDate[date] ?? [] }];
  }
}

describe("generateInsightEvents", () => {
  it("creates idempotent action-center events from category intelligence evidence", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Ice-Makers/zgbs",
      crawlTopN: 5,
      status: "enabled"
    });
    const collector = new ControlledBestSellerCollector({
      "2026-06-18": [
        product(1, "B0STEADY01", "Steady Ice Maker", "Steady", 199, null, null, 500, {
          rating: 4.7,
          imageUrl: "https://images.example.com/B0STEADY01.jpg?size=500"
        }),
        product(2, "B0PRICE001", "Acme Ice Maker", "Acme", 220, null, null, 600, {
          rating: 4.7,
          imageUrl: "https://images.example.com/B0PRICE001-old.jpg?size=500"
        }),
        product(3, "B0ACME003", "Acme Quiet Ice Maker", "Acme", 160, null, null, 480),
        product(4, "B0OLD00002", "Legacy Ice Maker", "Old", 150, null, null, 360),
        product(5, "B0OLD00001", "Old Ice Maker", "Old", 180, null, null, 700)
      ],
      "2026-06-19": [
        product(1, "B0PRICE001", "Acme Pro Ice Maker", "Acme", 180, "Save $20", "Limited Time Deal", 640, {
          rating: 4.4,
          imageUrl: "https://images.example.com/B0PRICE001-new.jpg?size=500"
        }),
        product(2, "B0NEW00001", "New Mini Ice Maker", "NewBrand", 99, null, null, 42),
        product(3, "B0ACME002", "Acme Compact Ice Maker", "Acme", 130, "Save $10", null, 390),
        product(4, "B0ACME003", "Acme Quiet Ice Maker", "Acme", 160, null, null, 480),
        product(5, "B0STEADY01", " steady   ice maker ", "Steady", 199, null, null, 500, {
          rating: 4.6,
          imageUrl: "https://images.example.com/B0STEADY01.jpg?size=1000"
        })
      ]
    });

    await runCategoryCollectionForMonitor(store, category.id, "2026-06-18", { collector });
    store.upsertAsinWatchState({
      asin: "B0PRICE001",
      watchLevel: "CORE",
      watchReason: "主力价格竞品",
      firstWatchDate: "2026-06-18",
      lastEventDate: "2026-06-18",
      note: null
    });
    await runCategoryCollectionForMonitor(store, category.id, "2026-06-19", { collector });

    const eventTypes = store.listInsightEvents({ date: "2026-06-19", limit: 100 }).map((event) => event.eventType);
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        "NEW_TOP20_ENTRY",
        "PRICE_DROP",
        "COUPON_ADDED",
        "DEAL_ADDED",
        "RATING_DROP",
        "LISTING_CHANGED",
        "PRICE_NEW_LOW",
        "LOW_REVIEW_HIGH_RANK",
        "NEW_PRODUCT_BREAKOUT",
        "BRAND_MATRIX_SURGE",
        "BRAND_MATRIX_DROP"
      ])
    );

    const target = store.listInsightEvents({ date: "2026-06-19", asin: "B0PRICE001", eventType: "PRICE_DROP" })[0];
    expect(target.evidence.priceBefore).toBe(220);
    expect(target.evidence.priceAfter).toBe(180);
    const ratingDrop = store.listInsightEvents({ date: "2026-06-19", asin: "B0PRICE001", eventType: "RATING_DROP" })[0];
    expect(ratingDrop.evidence).toMatchObject({ ratingBefore: 4.7, ratingAfter: 4.4, ratingChange: -0.3 });
    const listingChanged = store.listInsightEvents({ date: "2026-06-19", asin: "B0PRICE001", eventType: "LISTING_CHANGED" })[0];
    expect(listingChanged.evidence).toMatchObject({
      titleBefore: "Acme Ice Maker",
      titleAfter: "Acme Pro Ice Maker",
      imageUrlBefore: "https://images.example.com/B0PRICE001-old.jpg?size=500",
      imageUrlAfter: "https://images.example.com/B0PRICE001-new.jpg?size=500",
      listingChangedFields: ["title", "mainImage"]
    });
    expect(store.listInsightEvents({ date: "2026-06-19", asin: "B0STEADY01", eventType: "RATING_DROP" })).toEqual([]);
    expect(store.listInsightEvents({ date: "2026-06-19", asin: "B0STEADY01", eventType: "LISTING_CHANGED" })).toEqual([]);
    const breakout = store.listInsightEvents({ date: "2026-06-19", asin: "B0NEW00001", eventType: "NEW_PRODUCT_BREAKOUT" })[0];
    expect(breakout).toMatchObject({
      reviewDueDate: "2026-06-22",
      attributionTags: expect.arrayContaining(["NEW_PRODUCT_PUSH"]),
      evidence: {
        sourceEventType: "new_product_breakout",
        currentRank: 2
      }
    });
    const brandSurge = store.listInsightEvents({ date: "2026-06-19", brand: "Acme", eventType: "BRAND_MATRIX_SURGE" })[0];
    expect(brandSurge).toMatchObject({
      asin: null,
      reviewDueDate: "2026-06-26",
      attributionTags: expect.arrayContaining(["BRAND_MATRIX_PUSH"]),
      evidence: {
        sourceEventType: "brand_matrix_push",
        brandRisingCount: 1,
        brandNewEntryCount: 1,
        brandTop100Count: 3,
        brandTop100ShareChange: 0.2
      },
      scoreBreakdown: { brandScore: 8 }
    });
    const brandDrop = store.listInsightEvents({ date: "2026-06-19", brand: "Old", eventType: "BRAND_MATRIX_DROP" })[0];
    expect(brandDrop).toMatchObject({
      asin: null,
      eventTitle: "【品牌矩阵下滑】Old 多 ASIN 同步回落",
      reviewDueDate: "2026-06-26",
      attributionTags: ["NO_CLEAR_DRIVER"],
      evidence: {
        sourceEventType: "brand_matrix_drop",
        brandDroppedCount: 2,
        brandRankDownCount: 0,
        brandTop100Count: 0,
        brandTop100ShareChange: -0.4
      },
      scoreBreakdown: { brandScore: 15 }
    });
    expect(brandDrop.eventSummary).toContain("可能原因：暂无明显驱动");
    const coreRisk = store.listInsightEvents({ date: "2026-06-19", asin: "B0PRICE001", eventType: "CORE_COMPETITOR_RISK" })[0];
    expect(coreRisk).toMatchObject({
      eventLevel: "P0",
      evidence: {
        isCoreCompetitor: true,
        strategyTags: expect.arrayContaining(["HIGH_THREAT_CORE"])
      },
      scoreBreakdown: { riskScore: 15 }
    });
    expect(store.listInsightEvents({ date: "2026-06-19", asin: "B0PRICE001", eventType: "COUPON_ADDED" })[0]).toMatchObject({
      eventLevel: "P0",
      evidence: {
        strategyTags: expect.arrayContaining(["STABLE_HEAD", "HIGH_THREAT_CORE"])
      }
    });
    store.updateInsightEventStatus(target.id, "FOLLOWED");
    generateInsightEvents(store, "2026-06-19", { categoryId: category.id });
    expect(store.listInsightEvents({ date: "2026-06-19", asin: "B0PRICE001", eventType: "PRICE_DROP" })).toHaveLength(1);
    expect(store.listInsightEvents({ date: "2026-06-19", asin: "B0PRICE001", eventType: "RATING_DROP" })).toHaveLength(1);
    expect(store.listInsightEvents({ date: "2026-06-19", asin: "B0PRICE001", eventType: "LISTING_CHANGED" })).toHaveLength(1);
    expect(store.getInsightEvent(target.id)).toMatchObject({ status: "FOLLOWED" });
  });

  it("generates rank-surge insights from BSR history when activity events are absent", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Ice-Makers/zgbs",
      crawlTopN: 50,
      status: "enabled"
    });
    const previous = decorateBestsellerSnapshots({
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      snapshotDate: "2026-06-18",
      products: topProducts(50, [
        product(45, "B0SURGE001", "Surging Ice Maker", "LiftBrand", 189, null, null, 800)
      ])
    });
    const current = decorateBestsellerSnapshots({
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      snapshotDate: "2026-06-19",
      products: topProducts(50, [
        product(20, "B0SURGE001", "Surging Ice Maker", "LiftBrand", 189, null, null, 800)
      ])
    });
    store.insertCategorySnapshots(previous);
    store.insertCategorySnapshots(current);
    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: category.id,
      date: "2026-06-18",
      items: buildCategoryBsrRankHistory(category, previous)
    });
    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: category.id,
      date: "2026-06-19",
      items: buildCategoryBsrRankHistory(category, current)
    });

    generateInsightEvents(store, "2026-06-19", { categoryId: category.id });

    const surge = store.listInsightEvents({ date: "2026-06-19", asin: "B0SURGE001", eventType: "RANK_SURGE" })[0];
    expect(surge).toMatchObject({
      eventType: "RANK_SURGE",
      suggestedAction: "检查同日价格、Coupon、Deal、Review 和关键词排名信号，并观察未来 3 天排名路径。",
      evidence: {
        sourceEventType: "rank_up",
        currentRank: 20,
        previousRank: 45,
        rankChange: 25
      }
    });
  });

  it("adds core-competitor risk when a watched ASIN rises for three consecutive days", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Ice-Makers/zgbs",
      crawlTopN: 50,
      status: "enabled"
    });
    const collector = new ControlledBestSellerCollector({
      "2026-06-17": topProducts(50, [
        product(47, "B0CORE3DAY", "Core Rising Ice Maker", "CoreBrand", 180, null, null, 500)
      ]),
      "2026-06-18": topProducts(50, [
        product(46, "B0CORE3DAY", "Core Rising Ice Maker", "CoreBrand", 190, null, null, 500)
      ]),
      "2026-06-19": topProducts(50, [
        product(45, "B0CORE3DAY", "Core Rising Ice Maker", "CoreBrand", 200, null, null, 500)
      ])
    });

    await runCategoryCollectionForMonitor(store, category.id, "2026-06-17", { collector });
    store.upsertAsinWatchState({
      asin: "B0CORE3DAY",
      watchLevel: "CORE",
      watchReason: "Core competitor with rising BSR path",
      firstWatchDate: "2026-06-17",
      lastEventDate: "2026-06-17",
      note: null
    });
    await runCategoryCollectionForMonitor(store, category.id, "2026-06-18", { collector });
    await runCategoryCollectionForMonitor(store, category.id, "2026-06-19", { collector });

    const coreRisk = store.listInsightEvents({ date: "2026-06-19", asin: "B0CORE3DAY", eventType: "CORE_COMPETITOR_RISK" })[0];
    expect(coreRisk).toMatchObject({
      evidence: {
        currentRank: 45,
        priceLowWindow: null,
        isCoreCompetitor: true,
        coreCompetitorRising3Days: true
      },
      scoreBreakdown: { riskScore: 15 }
    });
  });
});

function product(
  rank: number,
  asin: string,
  title: string,
  brand: string,
  currentPrice: number,
  couponText: string | null,
  dealBadge: string | null,
  reviewCount: number,
  overrides: Partial<BestSellerProductInput> = {}
): BestSellerProductInput {
  return {
    rank,
    asin,
    title,
    brand,
    imageUrl: `https://example.com/${asin}.jpg`,
    productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice,
    originalPrice: null,
    couponText,
    currency: "$",
    rating: 4.5,
    reviewCount,
    isPrime: true,
    dealBadge,
    bsrRank: rank,
    bsrCategory: "Ice Makers",
    ...overrides
  };
}

function topProducts(count: number, overrides: BestSellerProductInput[]): BestSellerProductInput[] {
  const byRank = new Map(overrides.map((item) => [item.rank, item]));
  return Array.from({ length: count }, (_, index) => {
    const rank = index + 1;
    return byRank.get(rank) ?? product(rank, `B0FILL${String(rank).padStart(4, "0")}`, `Filler Ice Maker ${rank}`, "Filler", 199, null, null, 400);
  });
}
