import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { BestSellerProductInput, SerpProductInput } from "@amazon-monitor/shared";
import type { AmazonSearchCollector, CollectedSearchPage } from "./amazon-collector.js";
import { runCategoryCollectionForMonitor, type AmazonBestSellerCollector } from "./category-pipeline.js";
import { runCollectionForKeyword } from "./pipeline.js";
import { createStore, initSchema } from "./store.js";

class ControlledAmazonSearchCollector implements AmazonSearchCollector {
  constructor(private readonly productsByDate: Record<string, SerpProductInput[]>) {}

  async collect(_keyword: Parameters<AmazonSearchCollector["collect"]>[0], date: string): Promise<CollectedSearchPage[]> {
    return [
      {
        pageNo: 1,
        products: this.productsByDate[date] ?? [],
        url: "https://www.amazon.com/s?k=cordless+leaf+blower&page=1"
      }
    ];
  }
}

class ControlledBestSellerCollector implements AmazonBestSellerCollector {
  constructor(private readonly productsByDate: Record<string, BestSellerProductInput[]>) {}

  async collect(_category: Parameters<AmazonBestSellerCollector["collect"]>[0], date: string) {
    return [{ pageNo: 1, products: this.productsByDate[date] ?? [], url: "https://www.amazon.com/gp/bestsellers/appliances" }];
  }
}

describe("collection pipeline", () => {
  it("persists real collector output into snapshots, competitors, alerts, task logs, and reports", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const keyword = store.createKeyword({
      keyword: "cordless leaf blower",
      marketplace: "amazon.com",
      zipCode: "97201",
      language: "en_US",
      categoryTag: "yard tools",
      crawlPages: 1,
      status: "enabled"
    });
    const collector = new ControlledAmazonSearchCollector({
      "2026-05-16": [
        product("B0ACME600F", "Acme Cordless Leaf Blower", 109.99, null, false),
        product("B0BREEZE42", "BreezePro Battery Leaf Blower", 79.99, null, false)
      ],
      "2026-05-17": [
        product("B0ACME600F", "Acme Cordless Leaf Blower", 99.99, "Save $10 with coupon", true),
        product("B0VOLTMAX9", "VoltMax Compact Blower", 49.99, null, false)
      ]
    });

    await runCollectionForKeyword(store, keyword.id, "2026-05-16", { collector });
    const result = await runCollectionForKeyword(store, keyword.id, "2026-05-17", { collector });

    expect(result.status).toBe("success");
    expect(result.successCount).toBe(2);
    const snapshots = store.listSnapshots({ date: "2026-05-17", keywordId: keyword.id });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].bsrRank).toBe(12);
    expect(snapshots[0]).toMatchObject({ dataSource: "collector", syncStatus: "success" });
    expect(snapshots[0].lastSyncedAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    expect(snapshots[0].bestsellerRanks[0]).toMatchObject({ rank: 12, category: "Leaf Blowers" });
    expect(snapshots[0].iceType).toBe("unknown");
    expect(snapshots[1].iceType).toBe("bullet");
    const bsrHistory = store.listBsrRankHistory({ date: "2026-05-17", sourceType: "keyword_detail", sourceId: keyword.id });
    expect(bsrHistory).toHaveLength(1);
    expect(bsrHistory[0]).toMatchObject({
      asin: "B0ACME600F",
      category: "Leaf Blowers",
      rank: 12,
      parentRank: 12,
      isSpecificRank: true
    });
    expect(store.listBsrRankChanges({ date: "2026-05-17", sourceType: "keyword_detail", sourceId: keyword.id })[0]).toMatchObject({
      asin: "B0ACME600F",
      changeType: "unchanged",
      currentRank: 12,
      previousRank: 12
    });
    db.exec("DELETE FROM amazon_bsr_rank_history");
    initSchema(db);
    expect(store.listBsrRankHistory({ date: "2026-05-17", sourceType: "keyword_detail", sourceId: keyword.id })).toHaveLength(1);
    expect(store.listCompetitors()).toHaveLength(3);
    expect(store.listCompetitors({ keywordId: keyword.id })).toHaveLength(3);
    expect(store.listCompetitorFolders()[0]).toMatchObject({
      keywordId: keyword.id,
      keyword: "cordless leaf blower",
      competitorCount: 3
    });
    expect(store.getProductLink("B0ACME600F", keyword.id)?.url).toContain("/dp/B0ACME600F");
    expect(store.listCompetitors({ keywordId: keyword.id }).find((item) => item.asin === "B0ACME600F")).toMatchObject({
      latestBsrRank: 12,
      couponText: "Save $10 with coupon",
      dealBadge: null
    });
    expect(store.listAlerts({ date: "2026-05-17" }).map((alert) => alert.alertType)).toEqual(
      expect.arrayContaining(["significant_price_drop", "new_coupon", "new_sponsored", "new_asin_entered", "dropped_from_results"])
    );
    expect(store.listTaskLogs()).toHaveLength(2);
    expect(store.getDailyReport("2026-05-17", "cordless leaf blower")).toContain("Amazon 关键词竞品监控日报");
    expect(store.getDashboardSummary("2026-05-17").activeKeywordCount).toBe(1);
  });

  it("records a failed task log when the real collector cannot return product cards", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const keyword = store.createKeyword({
      keyword: "cordless leaf blower",
      marketplace: "amazon.com",
      crawlPages: 1,
      status: "enabled"
    });
    const collector = new ControlledAmazonSearchCollector({ "2026-05-17": [] });

    const result = await runCollectionForKeyword(store, keyword.id, "2026-05-17", { collector });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("No Amazon search cards collected");
    expect(store.listSnapshots({ date: "2026-05-17" })).toHaveLength(0);
    expect(store.listTaskLogs()[0].status).toBe("failed");
  });

  it("creates idempotent Listing and rating evidence for keyword-only competitors", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const keyword = store.createKeyword({
      keyword: "countertop ice maker",
      marketplace: "amazon.com",
      crawlPages: 1,
      status: "enabled"
    });
    const before = {
      ...product("B0KEYONLY1", "Acme Countertop Ice Maker", 109.99, null, false),
      imageUrl: "https://images.example.com/B0KEYONLY1-old.jpg?size=500",
      rating: 4.7
    };
    const after = {
      ...product("B0KEYONLY1", "Acme Pro Countertop Ice Maker", 109.99, null, false),
      imageUrl: "https://images.example.com/B0KEYONLY1-new.jpg?size=500",
      rating: 4.4
    };
    const collector = new ControlledAmazonSearchCollector({
      "2026-05-16": [before],
      "2026-05-17": [after]
    });

    await runCollectionForKeyword(store, keyword.id, "2026-05-16", { collector });
    await runCollectionForKeyword(store, keyword.id, "2026-05-17", { collector });
    await runCollectionForKeyword(store, keyword.id, "2026-05-17", { collector });

    const listingEvents = store.listInsightEvents({
      orgId: keyword.orgId,
      date: "2026-05-17",
      asin: "B0KEYONLY1",
      eventType: "LISTING_CHANGED"
    });
    const ratingEvents = store.listInsightEvents({
      orgId: keyword.orgId,
      date: "2026-05-17",
      asin: "B0KEYONLY1",
      eventType: "RATING_DROP"
    });

    expect(listingEvents).toHaveLength(1);
    expect(listingEvents[0]).toMatchObject({ keywordId: keyword.id, categoryId: null });
    expect(listingEvents[0].evidence).toMatchObject({
      keyword: "countertop ice maker",
      titleBefore: "Acme Countertop Ice Maker",
      titleAfter: "Acme Pro Countertop Ice Maker",
      imageUrlBefore: "https://images.example.com/B0KEYONLY1-old.jpg?size=500",
      imageUrlAfter: "https://images.example.com/B0KEYONLY1-new.jpg?size=500",
      listingChangedFields: ["title", "mainImage"]
    });
    expect(ratingEvents).toHaveLength(1);
    expect(ratingEvents[0]).toMatchObject({ keywordId: keyword.id, categoryId: null });
    expect(ratingEvents[0].evidence).toMatchObject({ ratingBefore: 4.7, ratingAfter: 4.4, ratingChange: -0.3 });

    db.close();
  });

  it("deduplicates snapshot changes when keyword and category collectors see the same ASIN", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const keyword = store.createKeyword({ keyword: "countertop ice maker", marketplace: "amazon.com", crawlPages: 1, status: "enabled" });
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/gp/bestsellers/appliances",
      crawlTopN: 1,
      status: "enabled"
    });
    const keywordCollector = new ControlledAmazonSearchCollector({
      "2026-05-16": [{ ...product("B0CROSS001", "Acme Ice Maker", 109.99, null, false), rating: 4.7 }],
      "2026-05-17": [{ ...product("B0CROSS001", "Acme Pro Ice Maker", 109.99, null, false), rating: 4.4 }]
    });
    const categoryCollector = new ControlledBestSellerCollector({
      "2026-05-16": [categoryProduct("B0CROSS001", "Acme Ice Maker", 4.7)],
      "2026-05-17": [categoryProduct("B0CROSS001", "Acme Pro Ice Maker", 4.4)]
    });

    await runCollectionForKeyword(store, keyword.id, "2026-05-16", { collector: keywordCollector });
    await runCategoryCollectionForMonitor(store, category.id, "2026-05-16", { collector: categoryCollector });
    await runCollectionForKeyword(store, keyword.id, "2026-05-17", { collector: keywordCollector });
    await runCategoryCollectionForMonitor(store, category.id, "2026-05-17", { collector: categoryCollector });

    const events = store.listInsightEvents({ orgId: keyword.orgId, date: "2026-05-17", asin: "B0CROSS001", limit: 100 });
    expect(events.filter((event) => event.eventType === "LISTING_CHANGED")).toHaveLength(1);
    expect(events.filter((event) => event.eventType === "RATING_DROP")).toHaveLength(1);
    expect(events.find((event) => event.eventType === "LISTING_CHANGED")).toMatchObject({
      categoryId: category.id,
      keywordId: null
    });

    db.close();
  });

  it("passes abort signals to the collector and skips failure writes after abort", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const keyword = store.createKeyword({
      keyword: "cordless leaf blower",
      marketplace: "amazon.com",
      crawlPages: 1,
      status: "enabled"
    });
    const controller = new AbortController();
    const collector: AmazonSearchCollector = {
      async collect(_keyword, _date, options) {
        expect(options?.signal).toBe(controller.signal);
        controller.abort();
        throw new Error("browser closed after abort");
      }
    };

    await expect(
      runCollectionForKeyword(store, keyword.id, "2026-05-17", { collector, signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(store.listTaskLogs()).toHaveLength(0);
    expect(store.listSnapshots({ date: "2026-05-17" })).toHaveLength(0);
  });
});

function product(asin: string, title: string, currentPrice: number, couponText: string | null, isSponsored: boolean): SerpProductInput {
  return {
    asin,
    title,
    brand: title.split(" ")[0],
    imageUrl: `https://example.com/${asin}.jpg`,
    productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice,
    originalPrice: null,
    couponText,
    currency: "$",
    rating: 4.4,
    reviewCount: 500,
    iceType: asin === "B0VOLTMAX9" ? "bullet" : "unknown",
    isSponsored,
    isPrime: true,
    dealBadge: null,
    deliveryText: "Tomorrow",
    bsrRank: asin === "B0ACME600F" ? 1234 : null,
    bsrCategory: asin === "B0ACME600F" ? "Patio, Lawn & Garden" : null,
    bsrText: asin === "B0ACME600F" ? "#1,234 in Patio, Lawn & Garden" : null,
    bestsellerRanks: asin === "B0ACME600F" ? [{ rank: 12, category: "Leaf Blowers", url: "https://www.amazon.com/gp/bestsellers/lawn-garden/123" }] : [],
    detailCollectedAt: "2026-05-17T00:00:00.000Z"
  };
}

function categoryProduct(asin: string, title: string, rating: number): BestSellerProductInput {
  return {
    rank: 1,
    asin,
    title,
    brand: "Acme",
    imageUrl: `https://example.com/${asin}-${title.includes("Pro") ? "new" : "old"}.jpg`,
    productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice: 109.99,
    originalPrice: null,
    couponText: null,
    currency: "$",
    rating,
    reviewCount: 500,
    isPrime: true,
    dealBadge: null,
    bsrRank: 1,
    bsrCategory: "Ice Makers"
  };
}
