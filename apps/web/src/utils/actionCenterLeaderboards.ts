import type { InsightEventType } from "@amazon-monitor/shared";
import type { AsinGroupedView } from "../stores/insightEvents";

export type AsinLeaderboardKind = "opportunity" | "risk" | "newBreakout" | "promoAnomaly";

export interface AsinLeaderboardEntry {
  kind: AsinLeaderboardKind;
  asin: string;
  brand: string;
  score: number;
  reasons: string[];
  topLevel: AsinGroupedView["topLevel"];
  representative: AsinGroupedView["representative"];
}

export interface AsinLeaderboards {
  opportunity: AsinLeaderboardEntry[];
  risk: AsinLeaderboardEntry[];
  newBreakout: AsinLeaderboardEntry[];
  promoAnomaly: AsinLeaderboardEntry[];
}

const NEW_BREAKOUT_TYPES = new Set<InsightEventType>([
  "NEW_PRODUCT_BREAKOUT",
  "LOW_REVIEW_HIGH_RANK",
  "NEW_TOP20_ENTRY",
  "NEW_TOP50_ENTRY",
  "NEW_TOP100_ENTRY"
]);

const PROMO_TYPES = new Set<InsightEventType>([
  "PRICE_DROP",
  "PRICE_NEW_LOW",
  "COUPON_ADDED",
  "DEAL_ADDED"
]);

const PROMO_ATTR_TAGS = new Set([
  "PRICE_DRIVEN",
  "COUPON_DRIVEN",
  "DEAL_DRIVEN"
]);

export const ASIN_LEADERBOARD_LIMIT = 5;

function takeTop(
  groups: AsinGroupedView[],
  scoreOf: (group: AsinGroupedView) => number,
  reasonsOf: (group: AsinGroupedView) => string[],
  kind: AsinLeaderboardKind,
  limit: number
): AsinLeaderboardEntry[] {
  return [...groups]
    .map((group) => ({
      group,
      score: scoreOf(group)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      const byScore = right.score - left.score;
      if (byScore !== 0) return byScore;
      return left.group.asin.localeCompare(right.group.asin);
    })
    .slice(0, limit)
    .map(({ group, score }) => ({
      kind,
      asin: group.asin,
      brand: group.representative.brand || "未知品牌",
      score,
      reasons: reasonsOf(group),
      topLevel: group.topLevel,
      representative: group.representative
    }));
}

function isNewBreakoutGroup(group: AsinGroupedView): boolean {
  return group.events.some((event) => NEW_BREAKOUT_TYPES.has(event.eventType));
}

function isPromoAnomalyGroup(group: AsinGroupedView): boolean {
  if (group.events.some((event) => PROMO_TYPES.has(event.eventType))) return true;
  return group.attributionTags.some((tag) => PROMO_ATTR_TAGS.has(tag));
}

/**
 * Build four PRD leaderboards from ASIN-grouped Action Center cases.
 * Scores reuse existing dual-score / total score fields — no new backend model.
 */
export function buildAsinLeaderboards(
  groups: AsinGroupedView[],
  limit = ASIN_LEADERBOARD_LIMIT
): AsinLeaderboards {
  const opportunity = takeTop(
    groups,
    (group) => group.opportunityScore,
    (group) => group.opportunityReasons,
    "opportunity",
    limit
  );

  const risk = takeTop(
    groups,
    (group) => group.riskScore,
    (group) => group.riskReasons,
    "risk",
    limit
  );

  const newBreakout = takeTop(
    groups.filter(isNewBreakoutGroup),
    (group) => Math.max(group.opportunityScore, group.scoreTotal),
    (group) => {
      const types = group.events
        .filter((event) => NEW_BREAKOUT_TYPES.has(event.eventType))
        .map((event) => event.eventType);
      return types.length > 0 ? types : group.opportunityReasons;
    },
    "newBreakout",
    limit
  );

  const promoAnomaly = takeTop(
    groups.filter(isPromoAnomalyGroup),
    (group) => {
      const promo = group.representative.scoreBreakdown?.promoScore ?? 0;
      return Math.max(group.opportunityScore, promo * 5);
    },
    (group) => {
      const promoReasons = group.opportunityReasons.filter((reason) => reason.startsWith("promo"));
      if (promoReasons.length > 0) return promoReasons;
      const types = group.events
        .filter((event) => PROMO_TYPES.has(event.eventType))
        .map((event) => event.eventType);
      return types.length > 0 ? types : group.opportunityReasons;
    },
    "promoAnomaly",
    limit
  );

  return { opportunity, risk, newBreakout, promoAnomaly };
}

export const asinLeaderboardLabels: Record<AsinLeaderboardKind, string> = {
  opportunity: "机会商品榜",
  risk: "风险竞品榜",
  newBreakout: "新品爆发榜",
  promoAnomaly: "促销异常榜"
};