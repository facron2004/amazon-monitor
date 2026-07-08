import type { InsightEventType, InsightScoreBreakdown, InsightScoreLevel } from "@amazon-monitor/shared";

export interface InsightScoringInput {
  eventType: InsightEventType;
  currentRank: number | null;
  previousRank: number | null;
  rankChange: number | null;
  reviewCount: number | null;
  daysListed: number | null;
  couponAdded: boolean;
  dealAdded: boolean;
  priceChangeRate: number | null;
  priceLowWindow: "T30" | "T60" | "T90" | "ALL" | null;
  brandRisingCount: number | null;
  brandNewTop100Count: number | null;
  brandDroppedCount: number | null;
  brandRankDownCount: number | null;
  brandTop100ShareChange: number | null;
  isCoreCompetitor: boolean;
  coreCompetitorRising3Days: boolean;
}

export interface InsightScoreResult {
  total: number;
  level: InsightScoreLevel;
  breakdown: InsightScoreBreakdown;
}

export function scoreInsightEvent(input: InsightScoringInput): InsightScoreResult {
  const reasons: string[] = [];
  const rankingScore = scoreRanking(input, reasons);
  const productScore = scoreProduct(input, reasons);
  const promoScore = scorePromo(input, reasons);
  const brandScore = scoreBrand(input, reasons);
  const riskScore = scoreRisk(input, reasons);
  const total = Math.min(100, rankingScore + productScore + promoScore + brandScore + riskScore);

  return {
    total,
    level: scoreLevel(total),
    breakdown: {
      rankingScore,
      productScore,
      promoScore,
      brandScore,
      riskScore,
      reasons
    }
  };
}

export function scoreLevel(score: number): InsightScoreLevel {
  if (score >= 85) return "S";
  if (score >= 70) return "A";
  if (score >= 55) return "B";
  if (score >= 40) return "C";
  return "D";
}

function scoreRanking(input: InsightScoringInput, reasons: string[]): number {
  const values: number[] = [];
  if (input.currentRank !== null) {
    if (input.currentRank <= 20) values.push(35);
    else if (input.currentRank <= 50) values.push(28);
    else if (input.currentRank <= 100) values.push(20);
  }
  if (input.rankChange !== null) {
    if (input.rankChange >= 80) values.push(30);
    else if (input.rankChange >= 50) values.push(24);
    else if (input.rankChange >= 30) values.push(18);
    else if (input.rankChange >= 15) values.push(10);
  }
  const score = Math.max(0, ...values);
  if (score > 0) {
    reasons.push(`排名分 ${score}`);
  }
  return Math.min(35, score);
}

function scoreProduct(input: InsightScoringInput, reasons: string[]): number {
  const values: number[] = [];
  if (input.reviewCount !== null && input.currentRank !== null) {
    if (input.reviewCount < 50 && input.currentRank <= 100) values.push(25);
    else if (input.reviewCount < 100 && input.currentRank <= 100) values.push(20);
    else if (input.reviewCount < 300 && input.currentRank <= 50) values.push(15);
  }
  if (input.daysListed !== null) {
    if (input.daysListed <= 7) values.push(10);
    else if (input.daysListed <= 30) values.push(6);
  }
  const score = Math.min(25, values.reduce((sum, value) => sum + value, 0));
  if (score > 0) {
    reasons.push(`商品机会分 ${score}`);
  }
  return score;
}

function scorePromo(input: InsightScoringInput, reasons: string[]): number {
  let score = 0;
  if (input.couponAdded) score += 8;
  if (input.dealAdded) score += 10;
  if (input.priceChangeRate !== null) {
    if (input.priceChangeRate <= -0.15) score += 12;
    else if (input.priceChangeRate <= -0.10) score += 8;
  }
  if (input.priceLowWindow === "T90") score += 12;
  else if (input.priceLowWindow === "T60") score += 10;
  else if (input.priceLowWindow === "T30") score += 8;
  const capped = Math.min(20, score);
  if (capped > 0) {
    reasons.push(`活动强度分 ${capped}`);
  }
  return capped;
}

function scoreBrand(input: InsightScoringInput, reasons: string[]): number {
  const rising = input.brandRisingCount ?? 0;
  const newTop100 = input.brandNewTop100Count ?? 0;
  const dropped = input.brandDroppedCount ?? 0;
  const rankDown = input.brandRankDownCount ?? 0;
  const shareChange = input.brandTop100ShareChange ?? 0;
  const values: number[] = [];
  if (rising >= 5) values.push(15);
  else if (rising >= 3) values.push(10);
  if (newTop100 >= 2) values.push(12);
  if (shareChange >= 0.05) values.push(8);
  if (dropped >= 3) values.push(15);
  else if (dropped >= 2) values.push(12);
  if (rankDown >= 5) values.push(15);
  else if (rankDown >= 3) values.push(10);
  if (shareChange <= -0.05) values.push(8);
  const score = Math.min(15, values.reduce((sum, value) => sum + value, 0));
  if (score > 0) {
    reasons.push(`品牌动作分 ${score}`);
  }
  return score;
}

function scoreRisk(input: InsightScoringInput, reasons: string[]): number {
  let score = 0;
  if (input.isCoreCompetitor && input.currentRank !== null) {
    if (input.currentRank <= 20) score += 15;
    else if (input.currentRank <= 50) score += 10;
  }
  if (input.isCoreCompetitor && input.coreCompetitorRising3Days) {
    score += 10;
  }
  if (input.isCoreCompetitor && input.priceLowWindow === "T30") {
    score += 8;
  }
  const capped = Math.min(15, score);
  if (capped > 0) {
    reasons.push(`核心竞品风险分 ${capped}`);
  }
  return capped;
}
