import type {
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  InsightEvent,
  InsightReviewResult,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { scheduleNextReviewDate } from "./review-scheduler.js";
import { canonicalImageUrl, normalizeListingText } from "./listing-diff.js";

interface ReviewDecision {
  result: InsightReviewResult;
  reason: string;
}

const successRankThresholdByType: Partial<Record<InsightEvent["eventType"], number>> = {
  NEW_TOP20_ENTRY: 20,
  NEW_TOP50_ENTRY: 50,
  NEW_TOP100_ENTRY: 100,
  NEW_PRODUCT_BREAKOUT: 50,
  LOW_REVIEW_HIGH_RANK: 50,
  CORE_COMPETITOR_RISK: 50
};

const positiveAsinEventTypes: ReadonlySet<InsightEvent["eventType"]> = new Set([
  "NEW_TOP100_ENTRY",
  "NEW_TOP50_ENTRY",
  "NEW_TOP20_ENTRY",
  "RANK_SURGE",
  "PRICE_DROP",
  "PRICE_NEW_LOW",
  "COUPON_ADDED",
  "DEAL_ADDED",
  "REVIEW_SPIKE",
  "NEW_PRODUCT_BREAKOUT",
  "LOW_REVIEW_HIGH_RANK",
  "CORE_COMPETITOR_RISK"
]);

const dropAsinEventTypes: ReadonlySet<InsightEvent["eventType"]> = new Set([
  "RANK_DROP",
  "DROPPED_FROM_TOP100",
  "COUPON_REMOVED",
  "DEAL_REMOVED"
]);

export interface EvaluateDueReviewOptions {
  categoryId?: number;
  orgId?: number;
}

export function evaluateDueInsightEventReviews(store: Store, date: string, options: EvaluateDueReviewOptions = {}): InsightEvent[] {
  // 用 store.claimReviewDueEvents 原子认领一批 due events,避免和另一个 evaluator /
  // worker 重启产生竞态——claim 是事务内的 INSERT OR IGNORE,任何并发 evaluator 拿到
  // 的批次不会重叠。claim_id 在 finally 中释放,崩溃则由 claim 表的 stale 清理兜底。
  const claimId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const claimed = store.claimReviewDueEvents(date, claimId, options);
  if (claimed.length === 0) {
    return [];
  }
  const reviewed: InsightEvent[] = [];
  try {
    store.runInTransaction(() => {
      for (const event of claimed) {
        const decision = evaluateInsightEventReview(store, event, date);
        const nextReviewDueDate = scheduleNextReviewDate({
          eventDate: event.eventDate,
          eventType: event.eventType,
          scoreLevel: event.scoreLevel,
          attributionTags: event.attributionTags
        }, date);
        const updated = store.markInsightEventReviewed(
          event.id,
          decision.result,
          decision.reason,
          nextReviewDueDate,
          options.orgId
        );
        if (updated) {
          reviewed.push(updated);
        }
      }
    });
  } finally {
    store.releaseReviewClaim(claimId);
  }
  return reviewed;
}

export function evaluateInsightEventReview(store: Store, event: InsightEvent, date: string): ReviewDecision {
  if (!event.categoryId) {
    return {
      result: "UNCLEAR",
      reason: buildNote(date, event, { result: "UNCLEAR", reason: "event has no categoryId to compare against current BSR data" })
    };
  }

  const snapshots = store.listCategorySnapshots({ orgId: event.orgId, date, categoryId: event.categoryId, limit: 1000 });
  if (snapshots.length === 0) {
    return {
      result: "UNCLEAR",
      reason: buildNote(date, event, { result: "UNCLEAR", reason: "no category snapshot exists for the review date" })
    };
  }

  if (event.asin) {
    const snapshot = snapshots.find((item) => item.asin === event.asin) ?? null;
    const price = store.listProductPriceHistory({ orgId: event.orgId, date, categoryId: event.categoryId, asin: event.asin, limit: 1 })[0] ?? null;
    const decision = evaluateAsinEvent(event, snapshot, price);
    return {
      result: decision.result,
      reason: buildNote(date, event, decision, { snapshot, price })
    };
  }

  if (event.brand) {
    const brand = store.listBrandMatrix({ orgId: event.orgId, date, categoryId: event.categoryId }).find((item) => item.brand === event.brand) ?? null;
    const decision = evaluateBrandEvent(event, brand);
    return {
      result: decision.result,
      reason: buildNote(date, event, decision, { brand })
    };
  }

  return {
    result: "UNCLEAR",
    reason: buildNote(date, event, { result: "UNCLEAR", reason: "event has neither ASIN nor brand for review comparison" })
  };
}

function evaluateAsinEvent(
  event: InsightEvent,
  snapshot: BestsellerRankSnapshot | null,
  price: ProductPriceHistory | null
): ReviewDecision {
  if (!snapshot) {
    return evaluateMissingAsin(event);
  }
  if (event.eventType === "RATING_DROP") {
    return evaluateRatingDrop(event, snapshot);
  }
  if (event.eventType === "LISTING_CHANGED") {
    return evaluateListingChange(event, snapshot);
  }
  if (dropAsinEventTypes.has(event.eventType)) {
    return evaluateDropAsinEvent(event, snapshot);
  }
  if (positiveAsinEventTypes.has(event.eventType)) {
    return evaluatePositiveAsinEvent(event, snapshot, price);
  }
  return {
    result: "UNCLEAR",
    reason: `unsupported ASIN event type ${event.eventType}`
  };
}

function evaluateRatingDrop(event: InsightEvent, snapshot: BestsellerRankSnapshot): ReviewDecision {
  const before = event.evidence.ratingBefore;
  const after = event.evidence.ratingAfter;
  const current = snapshot.rating;
  if (before == null || after == null || current == null) {
    return { result: "UNCLEAR", reason: "rating evidence is incomplete on the review snapshot" };
  }
  if (current >= before) {
    return { result: "REVERTED", reason: `rating recovered to ${current.toFixed(1)} from event level ${after.toFixed(1)}` };
  }
  if (current <= after) {
    return { result: "CONTINUING", reason: `rating remains at or below event level ${after.toFixed(1)}` };
  }
  return { result: "CONTINUING", reason: `rating partially recovered to ${current.toFixed(1)} but remains below ${before.toFixed(1)}` };
}

function evaluateListingChange(event: InsightEvent, snapshot: BestsellerRankSnapshot): ReviewDecision {
  const fields = event.evidence.listingChangedFields ?? [];
  if (fields.length === 0) {
    return { result: "UNCLEAR", reason: "Listing change fields are missing from event evidence" };
  }
  const matchesAfter = fields.every((field) => field === "title"
    ? normalizeListingText(snapshot.title) === normalizeListingText(event.evidence.titleAfter)
    : canonicalImageUrl(snapshot.imageUrl) === canonicalImageUrl(event.evidence.imageUrlAfter));
  if (matchesAfter) {
    return { result: "CONTINUING", reason: `Listing change remains active for ${fields.join(", ")}` };
  }
  const matchesBefore = fields.every((field) => field === "title"
    ? normalizeListingText(snapshot.title) === normalizeListingText(event.evidence.titleBefore)
    : canonicalImageUrl(snapshot.imageUrl) === canonicalImageUrl(event.evidence.imageUrlBefore));
  if (matchesBefore) {
    return { result: "REVERTED", reason: `Listing reverted to the pre-event ${fields.join(", ")}` };
  }
  return { result: "UNCLEAR", reason: `Listing changed again after the original ${fields.join(", ")} event` };
}

function evaluateMissingAsin(event: InsightEvent): ReviewDecision {
  if (dropAsinEventTypes.has(event.eventType)) {
    return {
      result: "CONFIRMED",
      reason: "ASIN is still absent from the current captured BSR snapshot"
    };
  }
  return {
    result: "FAILED",
    reason: "ASIN is absent from the current captured BSR snapshot"
  };
}

function evaluatePositiveAsinEvent(
  event: InsightEvent,
  snapshot: BestsellerRankSnapshot,
  price: ProductPriceHistory | null
): ReviewDecision {
  const currentRank = snapshot.rank;
  const targetRank = successRankThresholdByType[event.eventType];
  if (targetRank !== undefined && currentRank <= targetRank) {
    return {
      result: "CONFIRMED",
      reason: `current BSR #${currentRank} is still inside Top${targetRank}`
    };
  }

  const originalRank = event.evidence.currentRank;
  if (originalRank !== null && originalRank !== undefined && currentRank <= originalRank) {
    return {
      result: "CONFIRMED",
      reason: `current BSR #${currentRank} maintained or improved from original #${originalRank}`
    };
  }

  const evidenceReason = continuingEvidenceReason(event, snapshot, price);
  if (evidenceReason && currentRank <= 100) {
    return {
      result: "CONFIRMED",
      reason: evidenceReason
    };
  }

  if (currentRank <= 100) {
    return {
      result: "CONTINUING",
      reason: `current BSR #${currentRank} remains in the captured Top100 range`
    };
  }

  return {
    result: "REVERTED",
    reason: `current BSR #${currentRank} moved outside the original opportunity band`
  };
}

function evaluateDropAsinEvent(event: InsightEvent, snapshot: BestsellerRankSnapshot): ReviewDecision {
  if (event.eventType === "DROPPED_FROM_TOP100") {
    return {
      result: "REVERTED",
      reason: `ASIN returned to captured BSR at #${snapshot.rank}`
    };
  }

  if (event.eventType === "COUPON_REMOVED" && snapshot.couponText) {
    return {
      result: "REVERTED",
      reason: "coupon is present again on the review snapshot"
    };
  }
  if (event.eventType === "DEAL_REMOVED" && snapshot.dealBadge) {
    return {
      result: "REVERTED",
      reason: "deal badge is present again on the review snapshot"
    };
  }

  const previousRank = event.evidence.previousRank;
  if (previousRank !== null && previousRank !== undefined && snapshot.rank <= previousRank) {
    return {
      result: "REVERTED",
      reason: `current BSR #${snapshot.rank} recovered to the pre-event band #${previousRank}`
    };
  }

  const originalRank = event.evidence.currentRank;
  if (originalRank !== null && originalRank !== undefined && snapshot.rank >= originalRank) {
    return {
      result: "CONFIRMED",
      reason: `rank drop persisted at BSR #${snapshot.rank}, versus event BSR #${originalRank}`
    };
  }

  return {
    result: "CONTINUING",
    reason: `current BSR #${snapshot.rank} improved, but not enough to confirm recovery`
  };
}

function evaluateBrandEvent(event: InsightEvent, brand: BrandMatrixSnapshot | null): ReviewDecision {
  if (!brand) {
    return {
      result: event.eventType === "BRAND_MATRIX_DROP" ? "CONFIRMED" : "FAILED",
      reason: "brand is absent from the current brand matrix"
    };
  }

  const originalTop100 = event.evidence.brandTop100Count ?? 0;
  if (event.eventType === "BRAND_MATRIX_SURGE") {
    if (brand.productCountTop100 >= originalTop100 || brand.rankUpCount > 0 || brand.newEntryCount > 0) {
      return {
        result: "CONFIRMED",
        reason: `brand matrix still shows ${brand.productCountTop100} Top100 ASINs`
      };
    }
    if (brand.productCountTop100 > 0) {
      return {
        result: "CONTINUING",
        reason: `brand remains visible with ${brand.productCountTop100} Top100 ASINs`
      };
    }
    return {
      result: "FAILED",
      reason: "brand surge disappeared from the current brand matrix"
    };
  }

  if (event.eventType === "BRAND_MATRIX_DROP") {
    if (brand.productCountTop100 < originalTop100 || brand.droppedCount > 0) {
      return {
        result: "CONFIRMED",
        reason: `brand matrix weakness persisted with ${brand.productCountTop100} Top100 ASINs`
      };
    }
    return {
      result: "REVERTED",
      reason: `brand recovered to ${brand.productCountTop100} Top100 ASINs`
    };
  }

  return {
    result: brand.productCountTop100 > 0 ? "CONTINUING" : "UNCLEAR",
    reason: `brand matrix has ${brand.productCountTop100} current Top100 ASINs`
  };
}

function continuingEvidenceReason(
  event: InsightEvent,
  snapshot: BestsellerRankSnapshot,
  price: ProductPriceHistory | null
): string | null {
  const eventPrice = event.evidence.priceAfter ?? null;
  const currentPrice = price?.currentPrice ?? snapshot.currentPrice ?? null;
  if ((event.eventType === "PRICE_DROP" || event.eventType === "PRICE_NEW_LOW") && eventPrice !== null && currentPrice !== null && currentPrice <= eventPrice) {
    return `price is still at or below event price ${formatMoney(eventPrice)}`;
  }
  if (event.eventType === "COUPON_ADDED" && snapshot.couponText) {
    return "coupon is still present on the review snapshot";
  }
  if (event.eventType === "DEAL_ADDED" && snapshot.dealBadge) {
    return "deal badge is still present on the review snapshot";
  }
  const reviewCountAfter = event.evidence.reviewCountAfter ?? null;
  const currentReviewCount = snapshot.reviewCount ?? null;
  if (event.eventType === "REVIEW_SPIKE" && currentReviewCount !== null && reviewCountAfter !== null && currentReviewCount >= reviewCountAfter) {
    return `review count is still at or above event level ${reviewCountAfter}`;
  }
  return null;
}

function buildNote(
  date: string,
  event: InsightEvent,
  decision: ReviewDecision,
  context: { snapshot?: BestsellerRankSnapshot | null; price?: ProductPriceHistory | null; brand?: BrandMatrixSnapshot | null } = {}
): string {
  const target = event.asin ? `ASIN ${event.asin}` : event.brand ? `brand ${event.brand}` : "event target";
  const details = [
    `Auto review ${date}: ${decision.result}.`,
    `${target}; ${decision.reason}.`,
    `Original BSR ${formatRank(event.evidence.currentRank ?? null)}; current BSR ${formatRank(context.snapshot?.rank ?? null)}.`,
    context.price ? `Current price ${formatMoney(context.price.currentPrice ?? null)}.` : null,
    context.brand ? `Brand Top100 count ${context.brand.productCountTop100}.` : null
  ].filter((item): item is string => Boolean(item));
  return details.join(" ");
}

function formatRank(rank: number | null): string {
  return rank === null ? "n/a" : `#${rank}`;
}

function formatMoney(value: number | null): string {
  return value === null ? "n/a" : `$${Math.round(value * 100) / 100}`;
}
