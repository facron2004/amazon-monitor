import { computed, type Ref } from "vue";
import {
  buildCategoryDailyKpiSnapshot,
  categoryActivityLane,
  diffCategoryDailyKpis,
  type CategoryDailyKpiSnapshot,
  type CompetitorActivityEvent,
} from "@amazon-monitor/shared";
import type {
  LaneEvent,
  ReviewGrowthBrandTotal,
} from "../types/category-daily-briefing.js";
import { eventScore, toLaneEvent } from "../utils/categoryDailyBriefing.js";

export function useCategorySignalLanes(
  activityEvents: Ref<CompetitorActivityEvent[]>,
  categoryDataDate: Ref<string>,
  yesterdayKpiSnapshot: Ref<CategoryDailyKpiSnapshot | null>,
) {
  const currentKpiSnapshot = computed(() =>
    buildCategoryDailyKpiSnapshot(categoryDataDate.value, activityEvents.value),
  );
  const yesterdayKpiDelta = computed(() =>
    diffCategoryDailyKpis(currentKpiSnapshot.value, yesterdayKpiSnapshot.value),
  );

  function laneEvents(lane: "movers" | "promotions" | "fading"): LaneEvent[] {
    return activityEvents.value
      .filter((item) => categoryActivityLane(item) === lane)
      .sort((left, right) => eventScore(right) - eventScore(left))
      .slice(0, 6)
      .map(toLaneEvent);
  }

  const moversEvents = computed(() => laneEvents("movers"));
  const promotionsEvents = computed(() => laneEvents("promotions"));
  const fadingEvents = computed(() => laneEvents("fading"));

  const reviewGrowthTopBrands = computed<ReviewGrowthBrandTotal[]>(() => {
    const buckets = new Map<
      string,
      { totalGrowth: number; asinCount: number }
    >();
    for (const event of activityEvents.value) {
      if (categoryActivityLane(event) !== "reviewGrowth") continue;
      const brand = event.brand?.trim() || "未知品牌";
      const current = buckets.get(brand) ?? { totalGrowth: 0, asinCount: 0 };
      current.totalGrowth += event.reviewCountChange ?? 0;
      current.asinCount += 1;
      buckets.set(brand, current);
    }
    return Array.from(buckets.entries())
      .map(([brand, info]) => ({ brand, ...info }))
      .sort((left, right) => right.totalGrowth - left.totalGrowth)
      .slice(0, 3);
  });

  const couponEndCount = computed(
    () =>
      activityEvents.value.filter((item) => item.eventType === "coupon_end")
        .length,
  );
  const dealEndCount = computed(
    () =>
      activityEvents.value.filter((item) => item.eventType === "deal_end")
        .length,
  );
  const activityEndRankDropCount = computed(
    () =>
      activityEvents.value.filter(
        (item) => item.eventType === "activity_end_rank_drop",
      ).length,
  );
  const priceDropTopItems = computed(() =>
    activityEvents.value
      .filter((item) => item.eventType === "price_drop")
      .sort(
        (left, right) =>
          (right.priceChangeRate ?? 0) - (left.priceChangeRate ?? 0),
      )
      .slice(0, 3)
      .map(toLaneEvent),
  );

  return {
    currentKpiSnapshot,
    yesterdayKpiDelta,
    moversEvents,
    promotionsEvents,
    fadingEvents,
    reviewGrowthTopBrands,
    couponEndCount,
    dealEndCount,
    activityEndRankDropCount,
    priceDropTopItems,
  };
}
