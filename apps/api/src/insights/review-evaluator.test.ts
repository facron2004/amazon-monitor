import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { BestSellerProductInput, CategoryMonitor } from "@amazon-monitor/shared";
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
