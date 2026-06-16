import type { BestsellerRankSnapshot, CompetitorActivityEvent, CompetitorTier, SerpSnapshot } from "@amazon-monitor/shared";

export function keywordCompetitorTier(item: SerpSnapshot): CompetitorTier {
  if (item.absoluteRank <= 10) {
    return "core";
  }
  if (item.absoluteRank <= 20 || item.bsrRank !== null) {
    return "rising";
  }
  if (item.couponText || item.dealBadge || item.isSponsored) {
    return "activity";
  }
  return "watch";
}

export function keywordCompetitorReasons(item: SerpSnapshot): string[] {
  return [
    `Keyword rank #${item.absoluteRank} for ${item.keyword}`,
    item.organicRank ? `Organic #${item.organicRank}` : null,
    item.sponsoredRank ? `Sponsored #${item.sponsoredRank}` : null,
    item.bsrRank ? `BSR #${item.bsrRank} in ${item.bsrCategory ?? "category"}` : null,
    item.couponText ? `Coupon: ${item.couponText}` : null,
    item.dealBadge ? `Deal: ${item.dealBadge}` : null
  ].filter((item): item is string => Boolean(item));
}

export function categoryCompetitorTier(item: BestsellerRankSnapshot, events: CompetitorActivityEvent[]): CompetitorTier {
  if (item.rank <= 20) {
    return "core";
  }
  if (item.rank <= 50 || events.some((event) => event.eventType === "new_entry_top50" || event.eventType === "rank_surge")) {
    return "rising";
  }
  if (item.couponText || item.dealBadge || events.some((event) => ["price_drop", "coupon_start", "deal_start"].includes(event.eventType))) {
    return "activity";
  }
  return "watch";
}

export function categoryCompetitorReasons(item: BestsellerRankSnapshot, events: CompetitorActivityEvent[]): string[] {
  return [
    `${item.categoryName} Best Sellers #${item.rank}`,
    item.rank <= 50 ? "Category Top50" : null,
    item.couponText ? `Coupon: ${item.couponText}` : null,
    item.dealBadge ? `Deal: ${item.dealBadge}` : null,
    ...events.slice(0, 3).map((event) => `${event.eventType}: ${event.eventSummary}`)
  ].filter((reason): reason is string => Boolean(reason));
}
