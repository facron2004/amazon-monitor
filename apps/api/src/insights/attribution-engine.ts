import type { AttributionTag } from "@amazon-monitor/shared";

export interface AttributionInput {
  currentRank: number | null;
  previousRank: number | null;
  priceChangeRate: number | null;
  couponBefore: string | null;
  couponAfter: string | null;
  dealBefore: string | null;
  dealAfter: string | null;
  reviewCount: number | null;
  reviewCountChange: number | null;
  medianReviewChange: number | null;
  daysListed: number | null;
  brandRisingCount: number | null;
  brandNewTop100Count: number | null;
}

export interface AttributionResult {
  tags: AttributionTag[];
  evidenceItems: string[];
}

export function inferAttribution(input: AttributionInput): AttributionResult {
  const tags: AttributionTag[] = [];
  const evidenceItems: string[] = [];
  const rankChange = rankDelta(input.previousRank, input.currentRank);

  if (rankChange !== null) {
    evidenceItems.push(`BSR ${formatRank(input.previousRank)} -> ${formatRank(input.currentRank)}，变化 ${formatSignedRank(rankChange)}`);
  }
  if (input.priceChangeRate !== null) {
    evidenceItems.push(`价格变化 ${Math.round(input.priceChangeRate * 1000) / 10}%`);
  }
  if (input.couponBefore || input.couponAfter) {
    evidenceItems.push(`Coupon ${input.couponBefore ?? "-"} -> ${input.couponAfter ?? "-"}`);
  }
  if (input.dealBefore || input.dealAfter) {
    evidenceItems.push(`Deal ${input.dealBefore ?? "-"} -> ${input.dealAfter ?? "-"}`);
  }
  if (input.reviewCountChange !== null) {
    evidenceItems.push(`Review 增量 ${input.reviewCountChange}`);
  }

  if (rankChange !== null && rankChange >= 30 && input.priceChangeRate !== null && input.priceChangeRate <= -0.08) {
    tags.push("PRICE_DRIVEN");
  }

  if (!input.couponBefore && Boolean(input.couponAfter) && rankChange !== null && rankChange >= 20) {
    tags.push("COUPON_DRIVEN");
  }

  if (!input.dealBefore && Boolean(input.dealAfter) && (isTopRank(input.currentRank, 50) || (rankChange !== null && rankChange >= 20))) {
    tags.push("DEAL_DRIVEN");
  }

  const reviewThreshold = input.medianReviewChange !== null ? input.medianReviewChange * 2 : null;
  if (
    input.reviewCountChange !== null &&
    input.reviewCountChange > 0 &&
    rankChange !== null &&
    rankChange > 0 &&
    (reviewThreshold === null ? input.reviewCountChange >= 10 : input.reviewCountChange >= reviewThreshold)
  ) {
    tags.push("REVIEW_DRIVEN");
  }

  if (
    input.reviewCount !== null &&
    input.reviewCount < 100 &&
    input.daysListed !== null &&
    input.daysListed <= 30 &&
    isTopRank(input.currentRank, 100)
  ) {
    tags.push("NEW_PRODUCT_PUSH");
  }

  if ((input.brandRisingCount ?? 0) >= 3 || (input.brandNewTop100Count ?? 0) >= 2) {
    tags.push("BRAND_MATRIX_PUSH");
  }

  const promoRemoved = (Boolean(input.couponBefore) && !input.couponAfter) || (Boolean(input.dealBefore) && !input.dealAfter);
  if (promoRemoved && rankChange !== null && rankChange <= -20) {
    tags.push("PROMO_END_DROP");
  }

  if (tags.length === 0 && rankChange !== null && rankChange > 0) {
    tags.push("ORGANIC_STRENGTH");
  }

  if (tags.length === 0) {
    tags.push("NO_CLEAR_DRIVER");
  }

  return { tags: unique(tags), evidenceItems };
}

function rankDelta(previousRank: number | null, currentRank: number | null): number | null {
  if (previousRank === null || currentRank === null) {
    return null;
  }
  return previousRank - currentRank;
}

function isTopRank(rank: number | null, boundary: number): boolean {
  return rank !== null && rank <= boundary;
}

function formatRank(rank: number | null): string {
  return rank === null ? "未上榜" : `#${rank}`;
}

function formatSignedRank(value: number): string {
  return value > 0 ? `上升 ${value}` : value < 0 ? `下滑 ${Math.abs(value)}` : "持平";
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
