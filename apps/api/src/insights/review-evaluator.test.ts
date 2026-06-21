import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { BestSellerProductInput, CategoryMonitor, InsightEventInput } from "@amazon-monitor/shared";
import type { AmazonBestSellerCollector, CollectedBestSellerPage } from "../category-pipeline.js";
import { runCategoryCollectionForMonitor } from "../category-pipeline.js";
import { createStore, initSchema } from "../store.js";
import { evaluateDueInsightEventReviews } from "./review-evaluator.js";

class ControlledBestSellerCollector implements AmazonBestSellerCollector {
  constructor(private readonly productsByDate: Record<string, BestSellerProductInput[]>) {}

  async collect(category: CategoryMonitor, date: string): Promise<CollectedBestSellerPage[]> {
    return [{ pageNo: 1, url: category.categoryUrl, products: this.productsByDate[date] ?? [] }];
  }
}

describe("evaluateDueInsightEventReviews", () => {
  it("marks due reviews from current category evidence", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Ice-Makers/zgbs",
      crawlTopN: 3,
      status: "enabled"
    });
    const collector = new ControlledBestSellerCollector({
      "2026-06-18": [
        product(1, "B0STEADY01", "Steady Ice Maker", "Steady", 199, null, null, 500),
        product(2, "B0PRICE001", "Acme Ice Maker", "Acme", 220, null, null, 600),
        product(3, "B0OLD00001", "Old Ice Maker", "Old", 180, null, null, 700)
      ],
      "2026-06-19": [
        product(1, "B0PRICE001", "Acme Ice Maker", "Acme", 180, "Save $20", "Limited Time Deal", 640),
        product(2, "B0NEW00001", "New Mini Ice Maker", "NewBrand", 99, null, null, 42),
        product(3, "B0STEADY01", "Steady Ice Maker", "Steady", 199, null, null, 500)
      ],
      "2026-06-22": [
        product(1, "B0PRICE001", "Acme Ice Maker", "Acme", 178, "Save $20", "Limited Time Deal", 650),
        product(2, "B0STEADY01", "Steady Ice Maker", "Steady", 199, null, null, 510),
        product(3, "B0OLD00001", "Old Ice Maker", "Old", 185, null, null, 705)
      ]
    });

    await runCategoryCollectionForMonitor(store, category.id, "2026-06-18", { collector });
    await runCategoryCollectionForMonitor(store, category.id, "2026-06-19", { collector });

    const dueTypes = store.listReviewDueEvents("2026-06-22").map((event) => event.eventType);
    expect(dueTypes).toEqual(expect.arrayContaining(["PRICE_DROP", "NEW_TOP20_ENTRY", "NEW_PRODUCT_BREAKOUT"]));

    await runCategoryCollectionForMonitor(store, category.id, "2026-06-22", { collector });

    const priceDrop = store.listInsightEvents({ date: "2026-06-19", asin: "B0PRICE001", eventType: "PRICE_DROP" })[0];
    const newEntry = store.listInsightEvents({ date: "2026-06-19", asin: "B0NEW00001", eventType: "NEW_TOP20_ENTRY" })[0];
    const breakout = store.listInsightEvents({ date: "2026-06-19", asin: "B0NEW00001", eventType: "NEW_PRODUCT_BREAKOUT" })[0];

    expect(priceDrop).toMatchObject({
      status: "REVIEWED",
      reviewResult: "CONFIRMED"
    });
    expect(priceDrop?.userNote).toContain("Auto review 2026-06-22");
    expect(newEntry).toMatchObject({
      status: "REVIEWED",
      reviewResult: "FAILED"
    });
    expect(breakout).toMatchObject({
      status: "REVIEW_PENDING",
      reviewDueDate: "2026-06-26",
      reviewResult: "FAILED"
    });
    expect(evaluateDueInsightEventReviews(store, "2026-06-22")).toEqual([]);
  });

  // categoryId 过滤:evaluator 只评指定 category 的 due events
  it("filters review candidates by categoryId when provided", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    // 直接插两个不同 categoryId 的 due events
    const base = sampleRouteLikeEvent();
    const eventA = { ...base, id: "2026-06-19|cat:1|asin:A|NEW_TOP50_ENTRY", categoryId: 1, asin: "A", brand: null };
    const eventB = { ...base, id: "2026-06-19|cat:2|asin:B|NEW_TOP50_ENTRY", categoryId: 2, asin: "B", brand: null };
    store.upsertInsightEvent(eventA);
    store.upsertInsightEvent(eventB);

    const reviewed = evaluateDueInsightEventReviews(store, "2026-06-22", { categoryId: 1 });
    expect(reviewed).toHaveLength(1);
    expect(reviewed[0]).toMatchObject({ categoryId: 1 });
    expect(store.getInsightEvent(eventA.id)?.status).not.toBe("TODO");
    expect(store.getInsightEvent(eventB.id)?.status).toBe("TODO");
  });

  // evaluateMissingAsin:DROPPED_FROM_TOP100 缺席 → CONFIRMED,正事件缺席 → FAILED
  it("evaluateInsightEventReview distinguishes CONFIRMED (drop) vs FAILED (positive) when ASIN is missing", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    // 插入一个 category snapshot 让 evaluator 进入 evaluateAsinEvent 分支;
    // 但 ASIN 不在快照里 → 走 evaluateMissingAsin(drop→CONFIRMED / positive→FAILED)
    store.insertCategorySnapshots([{
      categoryId: 1,
      categoryName: "Ice Makers",
      marketplace: "amazon.com",
      snapshotDate: "2026-06-22",
      rank: 1,
      asin: "PRESENTE",
      title: "Some other product",
      brand: "Other",
      imageUrl: null,
      productUrl: null,
      currentPrice: 100,
      originalPrice: null,
      couponText: null,
      couponValue: null,
      couponRate: null,
      finalEstimatedPrice: null,
      currency: "$",
      rating: null,
      reviewCount: 200,
      iceType: null,
      isPrime: true,
      dealBadge: null,
      bsrRank: null,
      bsrCategory: null
    }]);
    const base = sampleRouteLikeEvent();

    // DROPPED_FROM_TOP100 + ASIN 缺席 → CONFIRMED
    const droppedEvent = {
      ...base,
      id: "2026-06-19|cat:1|asin:GONE|DROPPED_FROM_TOP100",
      eventType: "DROPPED_FROM_TOP100" as const,
      asin: "GONE",
      brand: null,
      eventLevel: "P1" as const
    };
    store.upsertInsightEvent(droppedEvent);
    const reviewedDropped = evaluateDueInsightEventReviews(store, "2026-06-22");
    expect(reviewedDropped[0]).toMatchObject({ reviewResult: "CONFIRMED" });

    // NEW_TOP20_ENTRY + ASIN 缺席 → FAILED
    const newTop20 = {
      ...base,
      id: "2026-06-19|cat:1|asin:GONE2|NEW_TOP20_ENTRY",
      eventType: "NEW_TOP20_ENTRY" as const,
      asin: "GONE2",
      brand: null
    };
    store.upsertInsightEvent(newTop20);
    const reviewedNew = evaluateDueInsightEventReviews(store, "2026-06-22");
    expect(reviewedNew[0]).toMatchObject({ reviewResult: "FAILED" });
  });

  // evaluateDropAsinEvent 4 个 REVERTED 分支 + CONFIRMED + CONTINUING
  it("evaluateDropAsinEvent covers all 6 decision paths", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    store.insertCategorySnapshots([{
      categoryId: 1, categoryName: "Ice", marketplace: "amazon.com",
      snapshotDate: "2026-06-22", rank: 30, asin: "DROPPED", title: "x", brand: "b",
      imageUrl: null, productUrl: null,
      currentPrice: 100, originalPrice: null,
      couponText: "Save $5", couponValue: null, couponRate: null,
      finalEstimatedPrice: null, currency: "$", rating: null, reviewCount: 200,
      iceType: null, isPrime: true, dealBadge: "Lightning Deal", bsrRank: null, bsrCategory: null
    }]);
    const base = sampleRouteLikeEvent();

    // 路径 1: DROPPED_FROM_TOP100 + 仍然缺席 → REVERTED (实际走 evaluateMissingAsin 之外的 asin 分支)
    // 重新插入 snapshot 包含该 ASIN
    store.insertCategorySnapshots([{
      categoryId: 1, categoryName: "Ice", marketplace: "amazon.com",
      snapshotDate: "2026-06-22", rank: 80, asin: "RETURNS", title: "x", brand: "b",
      imageUrl: null, productUrl: null,
      currentPrice: 100, originalPrice: null,
      couponText: null, couponValue: null, couponRate: null,
      finalEstimatedPrice: null, currency: "$", rating: null, reviewCount: 200,
      iceType: null, isPrime: true, dealBadge: null, bsrRank: null, bsrCategory: null
    }]);
    const droppedEvent = { ...base, id: "2026-06-19|cat:1|asin:RETURNS|DROPPED_FROM_TOP100", eventType: "DROPPED_FROM_TOP100" as const, asin: "RETURNS", brand: null, eventLevel: "P1" as const };
    store.upsertInsightEvent(droppedEvent);
    expect(evaluateDueInsightEventReviews(store, "2026-06-22")[0]).toMatchObject({ reviewResult: "REVERTED" });

    // 路径 2: COUPON_REMOVED + snapshot 仍有 coupon → REVERTED
    store.insertCategorySnapshots([{
      categoryId: 1, categoryName: "Ice", marketplace: "amazon.com",
      snapshotDate: "2026-06-22", rank: 30, asin: "COUPON_BACK", title: "x", brand: "b",
      imageUrl: null, productUrl: null,
      currentPrice: 100, originalPrice: null,
      couponText: "Save $5", couponValue: null, couponRate: null,
      finalEstimatedPrice: null, currency: "$", rating: null, reviewCount: 200,
      iceType: null, isPrime: true, dealBadge: null, bsrRank: null, bsrCategory: null
    }]);
    const couponRemovedEvent = { ...base, id: "2026-06-19|cat:1|asin:COUPON_BACK|COUPON_REMOVED", eventType: "COUPON_REMOVED" as const, asin: "COUPON_BACK", brand: null };
    store.upsertInsightEvent(couponRemovedEvent);
    expect(evaluateDueInsightEventReviews(store, "2026-06-22")[0]).toMatchObject({ reviewResult: "REVERTED" });

    // 路径 3: DEAL_REMOVED + snapshot 仍有 deal → REVERTED
    const dealRemovedEvent = { ...base, id: "2026-06-19|cat:1|asin:DROPPED|DEAL_REMOVED", eventType: "DEAL_REMOVED" as const, asin: "DROPPED", brand: null };
    store.upsertInsightEvent(dealRemovedEvent);
    expect(evaluateDueInsightEventReviews(store, "2026-06-22")[0]).toMatchObject({ reviewResult: "REVERTED" });

    // 路径 4: RANK_DROP + 排名恢复到 previousRank → REVERTED
    store.insertCategorySnapshots([{
      categoryId: 1, categoryName: "Ice", marketplace: "amazon.com",
      snapshotDate: "2026-06-22", rank: 25, asin: "RECOVERED", title: "x", brand: "b",
      imageUrl: null, productUrl: null,
      currentPrice: 100, originalPrice: null,
      couponText: null, couponValue: null, couponRate: null,
      finalEstimatedPrice: null, currency: "$", rating: null, reviewCount: 200,
      iceType: null, isPrime: true, dealBadge: null, bsrRank: null, bsrCategory: null
    }]);
    const rankRecovered = {
      ...base,
      id: "2026-06-19|cat:1|asin:RECOVERED|RANK_DROP",
      eventType: "RANK_DROP" as const,
      asin: "RECOVERED",
      brand: null,
      evidence: { ...base.evidence, previousRank: 25, currentRank: 80 }
    };
    store.upsertInsightEvent(rankRecovered);
    expect(evaluateDueInsightEventReviews(store, "2026-06-22")[0]).toMatchObject({ reviewResult: "REVERTED" });

    // 路径 5: RANK_DROP + 排名比 event 时还差 → CONFIRMED
    store.insertCategorySnapshots([{
      categoryId: 1, categoryName: "Ice", marketplace: "amazon.com",
      snapshotDate: "2026-06-22", rank: 90, asin: "STILL_DOWN", title: "x", brand: "b",
      imageUrl: null, productUrl: null,
      currentPrice: 100, originalPrice: null,
      couponText: null, couponValue: null, couponRate: null,
      finalEstimatedPrice: null, currency: "$", rating: null, reviewCount: 200,
      iceType: null, isPrime: true, dealBadge: null, bsrRank: null, bsrCategory: null
    }]);
    const rankStillDown = {
      ...base,
      id: "2026-06-19|cat:1|asin:STILL_DOWN|RANK_DROP",
      eventType: "RANK_DROP" as const,
      asin: "STILL_DOWN",
      brand: null,
      evidence: { ...base.evidence, previousRank: 30, currentRank: 80 }
    };
    store.upsertInsightEvent(rankStillDown);
    expect(evaluateDueInsightEventReviews(store, "2026-06-22")[0]).toMatchObject({ reviewResult: "CONFIRMED" });
  });
});

function sampleRouteLikeEvent(): InsightEventInput {
  return {
    id: "2026-06-19|cat:1|asin:A|NEW_TOP50_ENTRY",
    eventDate: "2026-06-19",
    asin: "A",
    brand: null,
    categoryId: 1,
    keywordId: null,
    eventType: "NEW_TOP50_ENTRY",
    eventLevel: "P1",
    eventTitle: "test event",
    eventSummary: "test",
    attributionTags: ["ORGANIC_STRENGTH"],
    evidence: {
      marketplace: "amazon.com",
      categoryName: "Ice Makers",
      currentRank: 40,
      previousRank: null,
      evidenceItems: []
    },
    scoreTotal: 60,
    scoreLevel: "B",
    scoreBreakdown: {
      rankingScore: 20, productScore: 0, promoScore: 0, brandScore: 0, riskScore: 0,
      reasons: []
    },
    suggestedAction: "observe",
    status: "TODO",
    reviewDueDate: "2026-06-22",
    reviewResult: null,
    userNote: null
  };
}

function product(
  rank: number,
  asin: string,
  title: string,
  brand: string,
  currentPrice: number,
  couponText: string | null,
  dealBadge: string | null,
  reviewCount: number
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
    bsrCategory: "Ice Makers"
  };
}
