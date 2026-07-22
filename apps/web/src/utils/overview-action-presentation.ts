import type { Component } from "vue";
import {
  Boxes,
  FileWarning,
  Flame,
  Info,
  Megaphone,
  MessageSquareWarning,
  ShoppingBag,
  Sparkles,
  TrendingUp
} from "@lucide/vue";
import type { InsightEvent, InsightEventType } from "@amazon-monitor/shared";

const EVENT_ICONS: Partial<Record<InsightEventType, Component>> = {
  RANK_SURGE: TrendingUp,
  RANK_DROP: TrendingUp,
  PRICE_DROP: ShoppingBag,
  COUPON_ADDED: ShoppingBag,
  NEW_PRODUCT_BREAKOUT: Sparkles,
  LOW_REVIEW_HIGH_RANK: Sparkles,
  CORE_COMPETITOR_RISK: Flame,
  BRAND_MATRIX_SURGE: Flame,
  INVENTORY_STOCKOUT_RISK: Boxes,
  ADS_ACOS_SPIKE: Megaphone,
  REVIEW_NEGATIVE_CLUSTER: MessageSquareWarning,
  LISTING_HEALTH_LOW: FileWarning,
  KEYWORD_PAGE_DROP: TrendingUp,
  OWNED_RATING_DROP: MessageSquareWarning
};

export function overviewActionIconFor(type: InsightEventType): Component {
  return EVENT_ICONS[type] ?? Info;
}

export function describeOverviewEvent(event: InsightEvent): string {
  const fragments: string[] = [];
  const { evidence } = event;
  if (typeof evidence.rankChange === "number" && evidence.rankChange !== 0) {
    fragments.push(`排名变化 ${evidence.rankChange > 0 ? "+" : ""}${evidence.rankChange}`);
  }
  if (typeof evidence.priceChangeRate === "number" && evidence.priceChangeRate !== 0) {
    fragments.push(`价格 ${(evidence.priceChangeRate * 100).toFixed(1)}%`);
  }
  if (typeof evidence.inventoryDays === "number") {
    fragments.push(`可售 ${evidence.inventoryDays.toFixed(1)} 天`);
  }
  if (typeof evidence.acos === "number") {
    fragments.push(`ACOS ${(evidence.acos * 100).toFixed(1)}%`);
  }
  if (typeof evidence.negativeReviewCount === "number") {
    fragments.push(`近 7 天差评 ${evidence.negativeReviewCount} 条`);
  }
  if (typeof evidence.listingHealthScore === "number") {
    fragments.push(`Listing 健康度 ${evidence.listingHealthScore.toFixed(0)}`);
  }
  return fragments.join(" · ");
}
