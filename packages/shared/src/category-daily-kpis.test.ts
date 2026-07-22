import { describe, expect, it } from "vitest";
import type {
  ActivityEventType,
  CompetitorActivityEvent,
} from "./types-category.js";
import {
  buildCategoryDailyKpiSnapshot,
  categoryActivityLane,
  diffCategoryDailyKpis,
} from "./category-daily-kpis.js";

function event(
  eventType: ActivityEventType,
  reviewCountChange: number | null = null,
): CompetitorActivityEvent {
  return {
    eventKey: `${eventType}-${reviewCountChange ?? "none"}`,
    eventDate: "2026-07-22",
    eventType,
    eventLevel: "medium",
    categoryId: 1,
    categoryName: "Ice Makers",
    marketplace: "amazon.com",
    asin: "B0TEST0001",
    brand: "Acme",
    title: "Acme Ice Maker",
    priceBefore: null,
    priceAfter: null,
    priceChangeRate: null,
    reviewCountChange,
    couponBefore: null,
    couponAfter: null,
    dealType: null,
    rankBefore: null,
    rankAfter: null,
    rankChange: null,
    keywordRankBefore: null,
    keywordRankAfter: null,
    eventSummary: "Evidence summary",
    possibleStrategy: "Observe",
    suggestedAction: "Review",
  };
}

describe("category daily KPIs", () => {
  it("maps every activity family into the operational lanes", () => {
    expect(categoryActivityLane(event("rank_surge"))).toBe("movers");
    expect(categoryActivityLane(event("coupon_start"))).toBe("promotions");
    expect(categoryActivityLane(event("deal_end"))).toBe("fading");
    expect(categoryActivityLane(event("review_growth", 3))).toBe(
      "reviewGrowth",
    );
    expect(categoryActivityLane(event("review_growth", 0))).toBe("other");
  });

  it("counts full event sets without applying UI lane limits", () => {
    const events = [
      ...Array.from({ length: 8 }, () => event("rank_surge")),
      event("coupon_start"),
      event("price_drop"),
      event("coupon_end"),
      event("review_growth", 4),
      event("review_growth", 0),
    ];

    expect(buildCategoryDailyKpiSnapshot("2026-07-22", events)).toEqual({
      date: "2026-07-22",
      movers: 8,
      promotions: 2,
      fading: 1,
      reviewGrowth: 1,
    });
  });

  it("returns nullable deltas when yesterday has no verified snapshot", () => {
    const current = buildCategoryDailyKpiSnapshot("2026-07-22", [
      event("rank_surge"),
      event("coupon_start"),
    ]);
    const previous = buildCategoryDailyKpiSnapshot("2026-07-21", [
      event("coupon_start"),
      event("coupon_end"),
    ]);

    expect(diffCategoryDailyKpis(current, previous)).toEqual({
      movers: 1,
      promotions: 0,
      fading: -1,
      reviewGrowth: 0,
    });
    expect(diffCategoryDailyKpis(current, null)).toEqual({
      movers: null,
      promotions: null,
      fading: null,
      reviewGrowth: null,
    });
  });
});
