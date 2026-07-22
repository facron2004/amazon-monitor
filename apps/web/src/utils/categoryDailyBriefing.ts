import type {
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  BsrRankChange,
  CompetitorActivityEvent,
  ProductPriceHistory,
} from "@amazon-monitor/shared";
import type { LaneEvent } from "../types/category-daily-briefing.js";
import {
  changeLabel,
  formatCount,
  formatMoney,
  promoText,
} from "./formatters.js";
import { levelWeight, rankPath } from "./category-intelligence.js";

export function eventScore(event: CompetitorActivityEvent): number {
  const typeScore: Partial<
    Record<CompetitorActivityEvent["eventType"], number>
  > = {
    new_entry_top50: 100,
    rank_surge: 92,
    brand_matrix_push: 86,
    new_entry_top100: 82,
    price_drop: 74,
    coupon_start: 70,
    deal_start: 70,
    review_growth: 64,
    activity_end_rank_drop: 62,
    coupon_increase: 58,
    coupon_end: 48,
    deal_end: 48,
  };

  return (
    (typeScore[event.eventType] ?? 40) +
    levelWeight(event.eventLevel) * 8 -
    (event.rankAfter ?? 120) / 10
  );
}

export function opportunityScore(
  snapshot: BestsellerRankSnapshot,
  hasBreakoutSignal: boolean,
): number {
  const rankScore = Math.max(0, 45 - Math.round(snapshot.rank / 3));
  const reviewScore =
    snapshot.reviewCount === null
      ? 10
      : snapshot.reviewCount < 100
        ? 28
        : snapshot.reviewCount < 500
          ? 14
          : 0;
  const promoScore = promoText(snapshot) !== "-" ? 14 : 0;
  const signalScore = hasBreakoutSignal ? 24 : 0;
  return Math.min(100, rankScore + reviewScore + promoScore + signalScore);
}

export function opportunityReason(
  snapshot: BestsellerRankSnapshot,
  hasBreakoutSignal: boolean,
): string {
  if (hasBreakoutSignal) return "系统已识别为新品爆发信号";
  if (snapshot.reviewCount !== null && snapshot.reviewCount < 100) {
    return `Review 仅 ${formatCount(snapshot.reviewCount)}，但已进入 #${snapshot.rank}`;
  }
  if (promoText(snapshot) !== "-") return "排名靠前且存在 Deal/Coupon 活动";
  return "排名靠前，建议继续观察";
}

export function brandJudgement(brand: BrandMatrixSnapshot): string {
  if (
    brand.rankUpCount + brand.newEntryCount >= 3 &&
    brand.couponCount + brand.dealCount >= 2
  ) {
    return "多 ASIN 上升叠加活动，疑似品牌矩阵推进";
  }
  if (brand.rankDownCount >= 3) return "多个链接下滑，建议复核活动是否结束";
  if (brand.newEntryCount > 0) return "有新链接进入榜单，适合观察是否扩大战线";
  return "占位稳定，继续观察 Top50/Top20 份额";
}

export function rankDeltaValue(
  previousRank: number | null | undefined,
  currentRank: number | null | undefined,
): number | null {
  if (!previousRank || !currentRank) return null;
  return previousRank - currentRank;
}

export function formatRankDelta(value: number | null): string {
  if (value === null) return "-";
  return value > 0
    ? `上升 ${value}`
    : value < 0
      ? `下滑 ${Math.abs(value)}`
      : "持平";
}

export function formatPriceDelta(
  before: number | null,
  after: number | null,
): string {
  if (before === null || after === null) return "-";
  const delta = after - before;
  if (delta === 0) return "持平";
  return `${delta > 0 ? "上涨" : "下降"} ${formatMoney(Math.abs(delta))}`;
}

export function isAtLowPrice(item: ProductPriceHistory): boolean {
  if (item.currentPrice === null) return false;
  return [
    item.t30LowPrice,
    item.t60LowPrice,
    item.t90LowPrice,
    item.monitoringLowPrice,
  ].some(
    (price) =>
      price !== null &&
      item.currentPrice !== null &&
      item.currentPrice <= price,
  );
}

export function toLaneEvent(event: CompetitorActivityEvent): LaneEvent {
  return {
    event,
    asin: event.asin ?? null,
    brand: event.brand ?? "未知品牌",
    rankDelta: rankDeltaValue(event.rankBefore, event.rankAfter),
    changeLabel: changeLabel(event.eventType),
  };
}

export function rankExtremeEntries(items: readonly BsrRankChange[]): {
  maxRise: { item: BsrRankChange; delta: number } | null;
  maxFall: { item: BsrRankChange; delta: number } | null;
} {
  let maxRise: { item: BsrRankChange; delta: number } | null = null;
  let maxFall: { item: BsrRankChange; delta: number } | null = null;
  for (const item of items) {
    const delta = rankDeltaValue(item.previousRank, item.currentRank);
    if (delta === null) continue;
    if (delta > 0 && (maxRise === null || delta > maxRise.delta))
      maxRise = { item, delta };
    if (delta < 0 && (maxFall === null || delta < maxFall.delta))
      maxFall = { item, delta };
  }
  return { maxRise, maxFall };
}

export { rankPath };
