import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useCategoryStore } from "../stores/category.js";
import type {
  InsightCard,
  OpportunityCard,
} from "../types/category-daily-briefing.js";
import {
  eventScore,
  opportunityReason,
  opportunityScore,
  rankDeltaValue,
} from "../utils/categoryDailyBriefing.js";
import {
  changeLabel,
  localizeGeneratedText,
  promoText,
} from "../utils/formatters.js";

export function useCategoryInsightCards() {
  const store = useCategoryStore();
  const { categoryDetail, categorySignals, activityEvents } =
    storeToRefs(store);
  const snapshots = computed(() => categoryDetail.value?.snapshots ?? []);
  const snapshotByAsin = computed(
    () => new Map(snapshots.value.map((item) => [item.asin, item])),
  );

  const allInsightCards = computed<InsightCard[]>(() =>
    activityEvents.value.map((event) => {
      const snapshot = event.asin
        ? (snapshotByAsin.value.get(event.asin) ?? null)
        : null;
      const rankAfter = event.rankAfter ?? snapshot?.rank ?? null;
      const priceAfter = event.priceAfter ?? snapshot?.currentPrice ?? null;
      return {
        key: event.eventKey,
        event,
        snapshot,
        title:
          event.title ||
          snapshot?.title ||
          localizeGeneratedText(event.eventSummary),
        asin: event.asin,
        brand: event.brand || snapshot?.brand || "未知品牌",
        tag: changeLabel(event.eventType),
        rankBefore: event.rankBefore,
        rankAfter,
        rankDelta: rankDeltaValue(event.rankBefore, rankAfter),
        priceBefore: event.priceBefore,
        priceAfter,
        promo:
          event.couponAfter ||
          event.dealType ||
          (snapshot ? promoText(snapshot) : "-"),
        reviewDelta: event.reviewCountChange ?? null,
        score: eventScore(event),
      };
    }),
  );

  const insightCards = computed(() =>
    [...allInsightCards.value]
      .sort((left, right) => right.score - left.score)
      .slice(0, 6),
  );
  const opportunityCards = computed<OpportunityCard[]>(() => {
    const signalAsins = new Set(
      categorySignals.value
        .filter((item) => item.signalType === "new_product_breakout")
        .map((item) => item.asin),
    );
    return snapshots.value
      .filter((item) => {
        const lowReview = item.reviewCount !== null && item.reviewCount < 100;
        return (
          signalAsins.has(item.asin) ||
          (item.rank <= 100 && lowReview) ||
          (item.rank <= 50 && promoText(item) !== "-")
        );
      })
      .map((snapshot) => ({
        snapshot,
        score: opportunityScore(snapshot, signalAsins.has(snapshot.asin)),
        reason: opportunityReason(snapshot, signalAsins.has(snapshot.asin)),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 4);
  });

  return { snapshots, allInsightCards, insightCards, opportunityCards };
}
