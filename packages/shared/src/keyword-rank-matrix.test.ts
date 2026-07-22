import { describe, expect, it } from "vitest";
import { buildKeywordRankMatrix } from "./keyword-rank-matrix.js";
import type { KeywordMonitor } from "./types-monitors.js";
import type { SerpSnapshot } from "./types-products.js";

describe("buildKeywordRankMatrix", () => {
  it("builds owned and competitor columns with exact-day rank and promotion signals", () => {
    const keywords = [keyword(1, "ice maker"), keyword(2, "nugget ice maker")];
    const result = buildKeywordRankMatrix({
      requestedDate: "2026-07-13",
      date: "2026-07-12",
      previousDate: "2026-07-11",
      sevenDayDate: "2026-07-05",
      keywords,
      monitoredProducts: [
        { asin: "OWNED00001", marketplace: "amazon.com", kind: "owned" },
        { asin: "OWNED00001", marketplace: "amazon.com", kind: "competitor", isKeyCompetitor: true },
        { asin: "COMPETE001", marketplace: "amazon.com", kind: "competitor", isKeyCompetitor: true }
      ],
      current: [
        snapshot(1, "OWNED00001", "2026-07-12", 8, null, { couponText: "Save $10", bsrRank: 18 }),
        snapshot(1, "OWNED00001", "2026-07-12", null, 2, { isSponsored: true }),
        snapshot(1, "COMPETE001", "2026-07-12", 3, null, { dealBadge: "Limited time deal" }),
        snapshot(1, "IGNORED001", "2026-07-12", 1, null)
      ],
      previous: [snapshot(1, "OWNED00001", "2026-07-11", 11, null)],
      sevenDay: [snapshot(1, "OWNED00001", "2026-07-05", 20, null)]
    });

    expect(result).toMatchObject({
      requestedDate: "2026-07-13",
      date: "2026-07-12",
      isFallback: true
    });
    expect(result.products.map((item) => [item.asin, item.kind])).toEqual([
      ["OWNED00001", "owned"],
      ["COMPETE001", "competitor"]
    ]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.cells[0]).toMatchObject({
      currentOrganicRank: 8,
      previousOrganicRank: 11,
      sevenDayOrganicRank: 20,
      sevenDayRankChange: 12,
      sponsoredRank: 2,
      isSponsored: true,
      isAmazonChoice: null,
      isBestSeller: null,
      hasBestsellerRank: true,
      hasCoupon: true,
      hasDeal: false
    });
    expect(result.rows[0]?.cells[1]).toMatchObject({ currentOrganicRank: 3, hasDeal: true });
    expect(result.rows[1]?.cells).toEqual([]);
  });
});

function keyword(id: number, value: string): KeywordMonitor {
  return {
    id,
    keyword: value,
    marketplace: "amazon.com",
    priority: "S",
    zipCode: "97201",
    language: "en_US",
    categoryTag: "Ice Makers",
    crawlPages: 3,
    status: "enabled",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    lastCollectedAt: "2026-07-12T00:00:00.000Z",
    todayStatus: "success"
  };
}

function snapshot(
  keywordId: number,
  asin: string,
  snapshotDate: string,
  organicRank: number | null,
  sponsoredRank: number | null,
  overrides: Partial<SerpSnapshot> = {}
): SerpSnapshot {
  return {
    keywordId,
    keyword: keywordId === 1 ? "ice maker" : "nugget ice maker",
    marketplace: "amazon.com",
    snapshotDate,
    pageNo: 1,
    positionInPage: organicRank ?? sponsoredRank ?? 1,
    absoluteRank: organicRank ?? sponsoredRank ?? 1,
    organicRank,
    sponsoredRank,
    asin,
    title: `${asin} title`,
    brand: "Acme",
    imageUrl: "https://example.com/product.jpg",
    productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice: 99,
    originalPrice: null,
    couponText: null,
    couponValue: null,
    couponRate: null,
    finalEstimatedPrice: 99,
    currency: "$",
    rating: 4.5,
    reviewCount: 100,
    isSponsored: false,
    isPrime: true,
    dealBadge: null,
    deliveryText: null,
    bsrRank: null,
    bsrCategory: null,
    bsrText: null,
    bestsellerRanks: [],
    detailCollectedAt: null,
    ...overrides
  };
}
