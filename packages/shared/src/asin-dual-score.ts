import type { InsightScoreBreakdown } from "./insight-events.js";

/** Maximum raw points currently produced by scoreInsightEvent sub-scores. */
const OPPORTUNITY_RAW_MAX = 80; // ranking 35 + product 25 + promo 20
const RISK_RAW_MAX = 30; // brand 15 + risk 15

export interface AsinDualScore {
  opportunityScore: number;
  riskScore: number;
  opportunityReasons: string[];
  riskReasons: string[];
}

/**
 * Derive 0-100 Opportunity / Risk scores from the existing insight score breakdown.
 * Keeps the scoring model additive and evidence-backed without inventing new factors.
 */
export function deriveAsinDualScore(breakdown: InsightScoreBreakdown | null | undefined): AsinDualScore {
  const safe = breakdown ?? {
    rankingScore: 0,
    productScore: 0,
    promoScore: 0,
    brandScore: 0,
    riskScore: 0,
    reasons: []
  };

  const opportunityRaw = Math.max(0, safe.rankingScore + safe.productScore + safe.promoScore);
  const riskRaw = Math.max(0, safe.brandScore + safe.riskScore);

  const opportunityScore = Math.min(100, Math.round((opportunityRaw / OPPORTUNITY_RAW_MAX) * 100));
  const riskScore = Math.min(100, Math.round((riskRaw / RISK_RAW_MAX) * 100));

  const opportunityReasons: string[] = [];
  if (safe.rankingScore > 0) opportunityReasons.push(`ranking +${safe.rankingScore}`);
  if (safe.productScore > 0) opportunityReasons.push(`product +${safe.productScore}`);
  if (safe.promoScore > 0) opportunityReasons.push(`promo +${safe.promoScore}`);

  const riskReasons: string[] = [];
  if (safe.brandScore > 0) riskReasons.push(`brand +${safe.brandScore}`);
  if (safe.riskScore > 0) riskReasons.push(`risk +${safe.riskScore}`);

  return {
    opportunityScore,
    riskScore,
    opportunityReasons,
    riskReasons
  };
}