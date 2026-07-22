import { describe, expect, it } from "vitest";
import type { CompetitorPoolItem } from "./types-competitors.js";
import {
  buildCompetitorDailyKpiSnapshot,
  diffCompetitorDailyKpis,
  hasCompetitorPriceActivity,
} from "./competitor-daily-kpis.js";

describe("competitor daily KPI evidence", () => {
  it("uses the same core, new, promotion, and key rules for a daily snapshot", () => {
    const snapshot = buildCompetitorDailyKpiSnapshot(
      "2026-07-22",
      [
        competitor({
          asin: "B0CORE0001",
          competitorTier: "core",
          firstSeenDate: "2026-07-20",
          couponText: "Save $10 with coupon",
        }),
        competitor({
          asin: "B0WATCH001",
          firstSeenDate: "2026-07-01",
          isKeyCompetitor: true,
        }),
      ],
      [{ asin: "B0WATCH001", watchLevel: "CORE" }],
    );

    expect(snapshot).toEqual({
      date: "2026-07-22",
      total: 2,
      core: 2,
      new: 1,
      priceActive: 1,
      key: 1,
    });
  });

  it("keeps a missing previous snapshot unknown", () => {
    const current = buildCompetitorDailyKpiSnapshot("2026-07-22", []);
    expect(diffCompetitorDailyKpis(current, null)).toEqual({
      total: null,
      core: null,
      new: null,
      priceActive: null,
      key: null,
    });
  });

  it("rejects parser noise as price activity", () => {
    expect(
      hasCompetitorPriceActivity(competitor({ couponText: "Ships tomorrow" })),
    ).toBe(false);
    expect(
      hasCompetitorPriceActivity(
        competitor({ dealBadge: "Limited Time Deal" }),
      ),
    ).toBe(true);
  });
});

function competitor(
  overrides: Partial<CompetitorPoolItem> = {},
): CompetitorPoolItem {
  return {
    id: 1,
    orgId: 1,
    asin: "B0TEST0001",
    marketplace: "amazon.com",
    title: "Test competitor",
    brand: null,
    imageUrl: "",
    firstSeenKeyword: "ice maker",
    firstSeenDate: "2026-07-01",
    lastSeenDate: "2026-07-22",
    appearKeywordCount: 1,
    bestRank: null,
    latestRank: null,
    lowestPrice: null,
    latestPrice: null,
    latestProductUrl: "https://amazon.com/dp/B0TEST0001",
    couponText: null,
    dealBadge: null,
    latestBsrRank: null,
    latestBsrCategory: null,
    latestBsrText: null,
    latestBestsellerRanks: [],
    sourceType: "manual",
    firstSeenSource: "manual",
    latestCategoryName: null,
    latestCategoryRank: null,
    competitorTier: "watch",
    competitorReasons: [],
    isKeyCompetitor: false,
    status: "active",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    ...overrides,
  };
}
