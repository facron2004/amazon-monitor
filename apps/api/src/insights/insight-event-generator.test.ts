import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { BestSellerProductInput, CategoryMonitor } from "@amazon-monitor/shared";
import type { AmazonBestSellerCollector, CollectedBestSellerPage } from "../category-pipeline.js";
import { runCategoryCollectionForMonitor } from "../category-pipeline.js";
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
    expect(eventTypes).toEqual(expect.arrayContaining(["NEW_TOP20_ENTRY", "PRICE_DROP", "COUPON_ADDED", "DEAL_ADDED", "PRICE_NEW_LOW", "LOW_REVIEW_HIGH_RANK"]));

    const target = store.listInsightEvents({ date: "2026-06-19", asin: "B0PRICE001", eventType: "PRICE_DROP" })[0];
    expect(target.evidence.priceBefore).toBe(220);
    expect(target.evidence.priceAfter).toBe(180);
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
    expect(store.getInsightEvent(target.id)).toMatchObject({ status: "FOLLOWED" });
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
