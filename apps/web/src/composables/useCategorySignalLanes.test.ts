import { ref } from "vue";
import { describe, expect, it } from "vitest";
import type {
  ActivityEventType,
  CategoryDailyKpiSnapshot,
  CompetitorActivityEvent,
} from "@amazon-monitor/shared";
import { useCategorySignalLanes } from "./useCategorySignalLanes.js";

function event(
  id: string,
  eventType: ActivityEventType,
  overrides: Partial<CompetitorActivityEvent> = {},
): CompetitorActivityEvent {
  return {
    eventKey: id,
    eventDate: "2026-07-22",
    eventType,
    eventLevel: "medium",
    categoryId: 1,
    categoryName: "Ice Makers",
    marketplace: "amazon.com",
    asin: `B0${id.padStart(8, "0")}`,
    brand: "Acme",
    title: "Acme Ice Maker",
    priceBefore: null,
    priceAfter: null,
    priceChangeRate: null,
    reviewCountChange: null,
    couponBefore: null,
    couponAfter: null,
    dealType: null,
    rankBefore: 20,
    rankAfter: 10,
    rankChange: 10,
    keywordRankBefore: null,
    keywordRankAfter: null,
    eventSummary: "Evidence summary",
    possibleStrategy: "Observe",
    suggestedAction: "Review",
    ...overrides,
  };
}

describe("useCategorySignalLanes", () => {
  it("keeps full KPI counts while limiting operational lane previews", () => {
    const events = ref<CompetitorActivityEvent[]>([
      ...Array.from({ length: 8 }, (_, index) =>
        event(`move-${index}`, "rank_surge"),
      ),
      event("coupon", "coupon_start"),
      event("price", "price_drop", { priceChangeRate: -0.12 }),
      event("fade", "coupon_end"),
      event("review-a", "review_growth", {
        brand: "Acme",
        reviewCountChange: 5,
      }),
      event("review-b", "review_growth", {
        brand: "Acme",
        reviewCountChange: 2,
      }),
      event("review-zero", "review_growth", {
        brand: "Beta",
        reviewCountChange: 0,
      }),
    ]);
    const previous = ref<CategoryDailyKpiSnapshot | null>({
      date: "2026-07-21",
      movers: 3,
      promotions: 1,
      fading: 2,
      reviewGrowth: 1,
    });

    const result = useCategorySignalLanes(events, ref("2026-07-22"), previous);

    expect(result.currentKpiSnapshot.value).toEqual({
      date: "2026-07-22",
      movers: 8,
      promotions: 2,
      fading: 1,
      reviewGrowth: 2,
    });
    expect(result.moversEvents.value).toHaveLength(6);
    expect(result.yesterdayKpiDelta.value).toEqual({
      movers: 5,
      promotions: 1,
      fading: -1,
      reviewGrowth: 1,
    });
    expect(result.reviewGrowthTopBrands.value).toEqual([
      { brand: "Acme", totalGrowth: 7, asinCount: 2 },
    ]);
    expect(result.priceDropTopItems.value[0]?.event.eventKey).toBe("price");
  });

  it("keeps comparison deltas unknown when the API has no verified previous-day snapshot", () => {
    const result = useCategorySignalLanes(
      ref([event("move", "rank_surge")]),
      ref("2026-07-22"),
      ref(null),
    );

    expect(result.yesterdayKpiDelta.value).toEqual({
      movers: null,
      promotions: null,
      fading: null,
      reviewGrowth: null,
    });
  });
});
