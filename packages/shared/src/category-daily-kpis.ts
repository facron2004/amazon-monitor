import type {
  ActivityEventType,
  CategoryDailyKpiDelta,
  CategoryDailyKpiSnapshot,
  CompetitorActivityEvent,
} from "./types-category.js";

export type CategoryActivityLane =
  "movers" | "promotions" | "fading" | "reviewGrowth" | "other";

const laneByEventType: Partial<
  Record<ActivityEventType, CategoryActivityLane>
> = {
  new_entry_top50: "movers",
  new_entry_top100: "movers",
  rank_surge: "movers",
  brand_matrix_push: "movers",
  brand_matrix_drop: "movers",
  coupon_start: "promotions",
  coupon_increase: "promotions",
  deal_start: "promotions",
  price_drop: "promotions",
  coupon_end: "fading",
  deal_end: "fading",
  activity_end_rank_drop: "fading",
  review_growth: "reviewGrowth",
};

export function categoryActivityLane(
  event: CompetitorActivityEvent,
): CategoryActivityLane {
  if (
    event.eventType === "review_growth" &&
    (event.reviewCountChange ?? 0) <= 0
  ) {
    return "other";
  }
  return laneByEventType[event.eventType] ?? "other";
}

export function buildCategoryDailyKpiSnapshot(
  date: string,
  events: readonly CompetitorActivityEvent[],
): CategoryDailyKpiSnapshot {
  const snapshot: CategoryDailyKpiSnapshot = {
    date,
    movers: 0,
    promotions: 0,
    fading: 0,
    reviewGrowth: 0,
  };

  for (const event of events) {
    const lane = categoryActivityLane(event);
    if (lane !== "other") {
      snapshot[lane] += 1;
    }
  }
  return snapshot;
}

export function diffCategoryDailyKpis(
  current: CategoryDailyKpiSnapshot,
  previous: CategoryDailyKpiSnapshot | null,
): CategoryDailyKpiDelta {
  return {
    movers: previous ? current.movers - previous.movers : null,
    promotions: previous ? current.promotions - previous.promotions : null,
    fading: previous ? current.fading - previous.fading : null,
    reviewGrowth: previous
      ? current.reviewGrowth - previous.reviewGrowth
      : null,
  };
}
