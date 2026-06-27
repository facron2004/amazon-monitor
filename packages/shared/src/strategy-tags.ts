import type { AttributionTag, InsightEvent, InsightEventType, InsightReviewResult } from "./insight-events.js";

export const strategyTags = [
  "LOW_PRICE_RANKING",
  "COUPON_DEPENDENT",
  "DEAL_LIFT",
  "REVIEW_ACCELERATION",
  "NEW_PRODUCT_MATRIX",
  "STABLE_HEAD",
  "SHORT_SURGE_REVERSION",
  "HIGH_THREAT_CORE"
] as const;

export type StrategyTag = (typeof strategyTags)[number];

export const strategyTagLabels: Record<StrategyTag, string> = {
  LOW_PRICE_RANKING: "低价冲榜型",
  COUPON_DEPENDENT: "Coupon 依赖型",
  DEAL_LIFT: "Deal 拉升型",
  REVIEW_ACCELERATION: "Review 快增型",
  NEW_PRODUCT_MATRIX: "新品矩阵型",
  STABLE_HEAD: "稳定头部型",
  SHORT_SURGE_REVERSION: "短期冲榜回落型",
  HIGH_THREAT_CORE: "高威胁核心竞品"
};

export interface StrategyTagInput {
  eventType: InsightEventType;
  attributionTags: AttributionTag[];
  currentRank: number | null;
  previousRank: number | null;
  rankChange: number | null;
  brandRisingCount: number | null;
  brandNewEntryCount: number | null;
  isCoreCompetitor: boolean;
  reviewResult?: InsightReviewResult | null;
}

export function inferStrategyTags(input: StrategyTagInput): StrategyTag[] {
  const tags = new Set<StrategyTag>();
  const rankImproved = (input.rankChange ?? 0) > 0 || input.previousRank === null;

  if (input.attributionTags.includes("PRICE_DRIVEN") && rankImproved && isInsideRank(input.currentRank, 100)) {
    tags.add("LOW_PRICE_RANKING");
  }
  if (input.attributionTags.includes("COUPON_DRIVEN")) {
    tags.add("COUPON_DEPENDENT");
  }
  if (input.attributionTags.includes("DEAL_DRIVEN")) {
    tags.add("DEAL_LIFT");
  }
  if (input.attributionTags.includes("REVIEW_DRIVEN")) {
    tags.add("REVIEW_ACCELERATION");
  }
  if (
    input.attributionTags.includes("NEW_PRODUCT_PUSH") &&
    ((input.brandNewEntryCount ?? 0) >= 2 || (input.brandRisingCount ?? 0) >= 3 || input.attributionTags.includes("BRAND_MATRIX_PUSH"))
  ) {
    tags.add("NEW_PRODUCT_MATRIX");
  }
  if (
    isInsideRank(input.currentRank, 20) &&
    isInsideRank(input.previousRank, 20) &&
    Math.abs(input.rankChange ?? 0) <= 5
  ) {
    tags.add("STABLE_HEAD");
  }
  if (input.attributionTags.includes("PROMO_END_DROP") || input.reviewResult === "REVERTED") {
    tags.add("SHORT_SURGE_REVERSION");
  }
  if (input.isCoreCompetitor && isInsideRank(input.currentRank, 50)) {
    tags.add("HIGH_THREAT_CORE");
  }

  return [...tags];
}

export function inferInsightEventStrategyTags(event: InsightEvent): StrategyTag[] {
  return [...new Set<StrategyTag>([
    ...(event.evidence.strategyTags ?? []),
    ...inferStrategyTags({
      eventType: event.eventType,
      attributionTags: event.attributionTags,
      currentRank: event.evidence.currentRank ?? null,
      previousRank: event.evidence.previousRank ?? null,
      rankChange: event.evidence.rankChange ?? null,
      brandRisingCount: event.evidence.brandRisingCount ?? null,
      brandNewEntryCount: event.evidence.brandNewEntryCount ?? null,
      isCoreCompetitor: event.evidence.isCoreCompetitor === true,
      reviewResult: event.reviewResult
    })
  ])];
}

function isInsideRank(rank: number | null, threshold: number): boolean {
  return rank !== null && rank >= 1 && rank <= threshold;
}