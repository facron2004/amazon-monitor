import { describe, expect, it } from "vitest";
import {
  analyzeDailyChanges,
  buildDailyReportMarkdown,
  decorateSnapshotRanks,
  describeRankCoverageGaps,
  inferIceType,
  parseCoupon,
  selectSpecificBestsellerRank,
  summarizePriceBand,
  type SerpProductInput
} from "./index";

const products: SerpProductInput[] = [
  {
    asin: "B0A1111111",
    title: "Acme Cordless Leaf Blower 600 CFM",
    brand: "Acme",
    imageUrl: "https://example.com/a.jpg",
    productUrl: "https://amazon.com/dp/B0A1111111",
    currentPrice: 99.99,
    originalPrice: 129.99,
    couponText: "Save $10 with coupon",
    currency: "$",
    rating: 4.5,
    reviewCount: 1280,
    isSponsored: true,
    isPrime: true,
    dealBadge: "Limited Time Deal",
    deliveryText: "Tomorrow"
  },
  {
    asin: "B0B2222222",
    title: "BreezePro Battery Leaf Blower",
    brand: "BreezePro",
    imageUrl: "https://example.com/b.jpg",
    productUrl: "https://amazon.com/dp/B0B2222222",
    currentPrice: 79.99,
    couponText: "Save 20% with coupon",
    currency: "$",
    rating: 4.2,
    reviewCount: 856,
    isSponsored: false,
    isPrime: true,
    dealBadge: null,
    deliveryText: "Friday"
  },
  {
    asin: "B0C3333333",
    title: "VoltMax Compact Blower",
    brand: "VoltMax",
    imageUrl: "https://example.com/c.jpg",
    productUrl: "https://amazon.com/dp/B0C3333333",
    currentPrice: 49.99,
    couponText: null,
    currency: "$",
    rating: 4,
    reviewCount: 301,
    isSponsored: false,
    isPrime: false,
    dealBadge: null,
    deliveryText: "Next week"
  }
];

describe("Amazon keyword monitor business rules", () => {
  it("decorates search cards with absolute, organic, sponsored ranks and estimated prices", () => {
    const ranked = decorateSnapshotRanks({
      keywordId: 7,
      keyword: "cordless leaf blower",
      marketplace: "amazon.com",
      snapshotDate: "2026-05-17",
      pageNo: 2,
      productsPerPage: 48,
      products
    });

    expect(ranked.map((item) => item.absoluteRank)).toEqual([49, 50, 51]);
    expect(ranked.map((item) => item.organicRank)).toEqual([null, 1, 2]);
    expect(ranked.map((item) => item.sponsoredRank)).toEqual([1, null, null]);
    expect(ranked[0].couponValue).toBe(10);
    expect(ranked[0].finalEstimatedPrice).toBe(89.99);
    expect(ranked[1].couponRate).toBe(0.2);
    expect(ranked[1].finalEstimatedPrice).toBe(63.99);
  });

  it("parses fixed amount and percentage coupon text", () => {
    expect(parseCoupon("Save $12 with coupon")).toEqual({
      couponValue: 12,
      couponRate: null
    });
    expect(parseCoupon("Apply 15% coupon")).toEqual({
      couponValue: null,
      couponRate: 0.15
    });
    expect(parseCoupon(null)).toEqual({
      couponValue: null,
      couponRate: null
    });
  });

  it("uses the most specific Best Sellers category rank as the display BSR", () => {
    expect(
      selectSpecificBestsellerRank([
        { rank: 15, category: "Appliances", url: null },
        { rank: 14, category: "Ice Makers", url: null }
      ])
    ).toEqual({ rank: 14, category: "Ice Makers", url: null });
    expect(selectSpecificBestsellerRank([])).toBeNull();
  });

  it("infers ice type tags from product titles", () => {
    expect(inferIceType("EUHOMY Nugget Ice Maker Countertop")).toBe("nugget");
    expect(inferIceType("Portable Bullet Ice Maker Machine")).toBe("bullet");
    expect(inferIceType("Clear Ice Cube Maker for Home Bar")).toBe("clear");
    expect(inferIceType("Commercial Crescent Ice Machine")).toBe("crescent");
    expect(inferIceType("Countertop Ice Maker, 9 Ice Cubes Ready in 6 Mins")).toBe("bullet");
  });

  it("describes missing and duplicate BSR rank coverage", () => {
    expect(describeRankCoverageGaps([1, 3, 3, 4], 4)).toBe("Missing ranks: #2. Duplicate ranks: #3.");
    expect(describeRankCoverageGaps([1, 2, 3], 3)).toBe("");
  });

  it("detects price, ranking, coupon, ad, new competitor, and dropped competitor changes", () => {
    const yesterday = decorateSnapshotRanks({
      keywordId: 1,
      keyword: "cordless leaf blower",
      marketplace: "amazon.com",
      snapshotDate: "2026-05-16",
      pageNo: 1,
      productsPerPage: 48,
      products: [
        { ...products[0], asin: "B0A1111111", currentPrice: 109.99, couponText: null, isSponsored: false },
        { ...products[1], asin: "B0B2222222", currentPrice: 79.99, couponText: null },
        { ...products[2], asin: "B0D4444444", currentPrice: 69.99 }
      ]
    });
    const today = decorateSnapshotRanks({
      keywordId: 1,
      keyword: "cordless leaf blower",
      marketplace: "amazon.com",
      snapshotDate: "2026-05-17",
      pageNo: 1,
      productsPerPage: 48,
      products: [
        { ...products[2], asin: "B0C3333333", currentPrice: 49.99 },
        { ...products[0], asin: "B0A1111111", currentPrice: 99.99, couponText: "Save $10 with coupon", isSponsored: true },
        { ...products[1], asin: "B0B2222222", currentPrice: 88.99, couponText: null }
      ]
    });

    const result = analyzeDailyChanges({ today, yesterday, historyLowestPrices: { B0A1111111: 104.99 } });

    expect(result.changes.map((change) => change.changeType)).toEqual(
      expect.arrayContaining([
        "price_drop",
        "new_coupon",
        "new_sponsored",
        "price_rise",
        "new_competitor",
        "dropped_competitor"
      ])
    );
    expect(result.alerts.map((alert) => alert.alertType)).toEqual(
      expect.arrayContaining(["significant_price_drop", "new_coupon", "new_sponsored", "new_asin_entered", "dropped_from_results"])
    );
  });

  it("builds a daily markdown report with change highlights and price band metrics", () => {
    const today = decorateSnapshotRanks({
      keywordId: 1,
      keyword: "cordless leaf blower",
      marketplace: "amazon.com",
      snapshotDate: "2026-05-17",
      pageNo: 1,
      productsPerPage: 48,
      products
    });
    const yesterday = today.map((item) => ({ ...item, snapshotDate: "2026-05-16", currentPrice: item.currentPrice + 10 }));
    const analysis = analyzeDailyChanges({ today, yesterday, historyLowestPrices: {} });
    const priceBand = summarizePriceBand(today, 3);
    const report = buildDailyReportMarkdown({
      date: "2026-05-17",
      keyword: "cordless leaf blower",
      analysis,
      priceBand,
      failedKeywords: ["battery leaf blower"]
    });

    expect(priceBand.averagePrice).toBe(76.66);
    expect(report).toContain("# Amazon 关键词竞品监控日报");
    expect(report).toContain("明显降价");
    expect(report).toContain("关键词价格带变化");
    expect(report).toContain("battery leaf blower");
  });
});
