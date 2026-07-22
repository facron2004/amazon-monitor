import { describe, expect, it } from "vitest";
import { buildCategorySnapshotDiff } from "./category-diff.js";
import type { BestsellerRankSnapshot } from "./types-products.js";

describe("buildCategorySnapshotDiff", () => {
  it("reports entry, exit, rank, price, promotion, and review changes", () => {
    const comparison = [
      snapshot("KEEP", "2026-07-06", 40, 120, null, null, 100),
      snapshot("DROP", "2026-07-06", 22, 90, null, null, 80)
    ];
    const current = [
      snapshot("KEEP", "2026-07-13", 12, 99, "Save $10", "Best Deal", 135),
      snapshot("NEW", "2026-07-13", 18, 79, null, null, 15)
    ];

    const result = buildCategorySnapshotDiff({
      categoryId: 1,
      date: "2026-07-13",
      compareDate: "2026-07-06",
      current,
      comparison
    });

    expect(result).toMatchObject({ currentCount: 2, compareCount: 2 });
    expect(result.items.map((item) => item.asin)).toEqual(["NEW", "DROP", "KEEP"]);
    expect(result.items.find((item) => item.asin === "KEEP")).toMatchObject({
      changeTypes: ["rank_up", "price_changed", "coupon_changed", "deal_changed", "review_growth"],
      currentRank: 12,
      previousRank: 40,
      rankChange: 28,
      priceChange: -21,
      reviewCountChange: 35
    });
    expect(result.items.find((item) => item.asin === "NEW")?.changeTypes).toEqual(["new_entry"]);
    expect(result.items.find((item) => item.asin === "DROP")?.changeTypes).toEqual(["dropped"]);
  });

  it("omits retained products when no tracked field changed", () => {
    const item = snapshot("SAME", "2026-07-13", 5, 50, null, null, 20);
    const previous = { ...item, snapshotDate: "2026-07-12" };
    const result = buildCategorySnapshotDiff({
      categoryId: 1,
      date: item.snapshotDate,
      compareDate: previous.snapshotDate,
      current: [item],
      comparison: [previous]
    });
    expect(result.items).toEqual([]);
  });
});

function snapshot(
  asin: string,
  snapshotDate: string,
  rank: number,
  currentPrice: number,
  couponText: string | null,
  dealBadge: string | null,
  reviewCount: number
): BestsellerRankSnapshot {
  return {
    categoryId: 1,
    categoryName: "Ice Makers",
    marketplace: "amazon.com",
    snapshotDate,
    rank,
    asin,
    title: asin,
    brand: "Acme",
    imageUrl: "https://example.com/image.jpg",
    productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice,
    originalPrice: null,
    couponText,
    couponValue: null,
    couponRate: null,
    finalEstimatedPrice: currentPrice,
    currency: "$",
    rating: 4.5,
    reviewCount,
    isPrime: true,
    dealBadge,
    bsrRank: rank,
    bsrCategory: "Ice Makers"
  };
}
