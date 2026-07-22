import type { ProductActivityCalendar, ProductActivityCalendarDay } from "@amazon-monitor/shared";
import { describe, expect, it } from "vitest";
import { buildCompetitorTrendChartOption, hasCompetitorTrendData } from "./competitorTrendChartOptions";

function day(date: string, price: number, rank: number, reviewCount: number): ProductActivityCalendarDay {
  return {
    date,
    asin: "B0TREND001",
    marketplace: "www.amazon.com",
    title: "Trend product",
    brand: "Acme",
    imageUrl: null,
    categoryRanks: [{
      categoryId: 1,
      categoryName: "Ice Makers",
      rank,
      price,
      finalEstimatedPrice: price,
      reviewCount,
      couponText: null,
      dealBadge: null,
      productUrl: "https://www.amazon.com/dp/B0TREND001"
    }],
    keywordRanks: [],
    bsrRanks: [],
    priceHistory: null,
    events: [],
    actionInsights: [],
    categorySignals: [],
    keywordChanges: []
  };
}

function calendar(days: ProductActivityCalendarDay[]): ProductActivityCalendar {
  return {
    asin: "B0TREND001",
    marketplace: "www.amazon.com",
    title: "Trend product",
    brand: "Acme",
    imageUrl: null,
    productUrl: "https://www.amazon.com/dp/B0TREND001",
    summary: {
      firstSeenDate: "2026-07-11",
      lastSeenDate: "2026-07-12",
      activeDays: days.length,
      bestCategoryRank: 18,
      latestCategoryRank: 18,
      bestKeywordRank: null,
      latestKeywordRank: null,
      priceLow: 99,
      priceHigh: 109,
      latestReviewCount: 130,
      reviewCountChange: 10,
      eventCount: 0
    },
    days,
    insightEvents: []
  };
}

describe("competitor trend chart options", () => {
  it("sorts snapshots chronologically and preserves missing BSR evidence", () => {
    const option = buildCompetitorTrendChartOption(calendar([
      day("2026-07-12", 99, 18, 130),
      day("2026-07-11", 109, 32, 120)
    ]));

    expect(option.xAxis[1].data).toEqual(["2026-07-11", "2026-07-12"]);
    expect(option.series[0].data).toEqual([109, 99]);
    expect(option.series[1].data).toEqual([120, 130]);
    expect(option.series[2].data).toEqual([32, 18]);
    expect(option.series[3].data).toEqual([null, null]);
  });

  it("distinguishes an evidence gap from a zero value", () => {
    const emptyDay = { ...day("2026-07-12", 0, 1, 0), categoryRanks: [] };
    expect(hasCompetitorTrendData(calendar([emptyDay]))).toBe(false);
    expect(hasCompetitorTrendData(calendar([day("2026-07-12", 0, 1, 0)]))).toBe(true);
  });
});
