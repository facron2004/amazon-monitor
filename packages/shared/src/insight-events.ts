import type { StrategyTag } from "./strategy-tags.js";

export const insightEventTypes = [
  "NEW_TOP100_ENTRY",
  "NEW_TOP50_ENTRY",
  "NEW_TOP20_ENTRY",
  "RANK_SURGE",
  "RANK_DROP",
  "DROPPED_FROM_TOP100",
  "PRICE_DROP",
  "PRICE_NEW_LOW",
  "COUPON_ADDED",
  "COUPON_REMOVED",
  "DEAL_ADDED",
  "DEAL_REMOVED",
  "REVIEW_SPIKE",
  "NEW_PRODUCT_BREAKOUT",
  "LOW_REVIEW_HIGH_RANK",
  "BRAND_MATRIX_SURGE",
  "BRAND_MATRIX_DROP",
  "CORE_COMPETITOR_RISK"
] as const;

export type InsightEventType = (typeof insightEventTypes)[number];

export const insightEventLevels = ["P0", "P1", "P2"] as const;
export type InsightEventLevel = (typeof insightEventLevels)[number];

export const insightEventStatuses = ["TODO", "WATCHING", "FOLLOWED", "IGNORED", "REVIEW_PENDING", "REVIEWED"] as const;
export type InsightEventStatus = (typeof insightEventStatuses)[number];

export const insightScoreLevels = ["S", "A", "B", "C", "D"] as const;
export type InsightScoreLevel = (typeof insightScoreLevels)[number];

export const attributionTags = [
  "PRICE_DRIVEN",
  "COUPON_DRIVEN",
  "DEAL_DRIVEN",
  "REVIEW_DRIVEN",
  "NEW_PRODUCT_PUSH",
  "BRAND_MATRIX_PUSH",
  "PROMO_END_DROP",
  "ORGANIC_STRENGTH",
  "NO_CLEAR_DRIVER"
] as const;
export type AttributionTag = (typeof attributionTags)[number];

export const insightReviewResults = ["CONFIRMED", "REVERTED", "CONTINUING", "FAILED", "UNCLEAR"] as const;
export type InsightReviewResult = (typeof insightReviewResults)[number];

export const asinWatchLevels = ["CORE", "NORMAL", "POTENTIAL", "IGNORED"] as const;
export type AsinWatchLevel = (typeof asinWatchLevels)[number];

// 中文标签集中维护，避免前后端及不同组件之间出现多份平行副本
// (之前的 eventTypeLabels / attributionLabel 在 4 个文件中重复)。前端消费方:
//   apps/web/src/components/ActionCenterPanel.vue
//   apps/web/src/components/action-center/InsightEventList.vue
//   apps/web/src/components/action-center/AttributionTags.vue
// 后端消费方: apps/api/src/insights/insight-event-builder.ts
export const insightEventTypeLabels: Record<InsightEventType, string> = {
  NEW_TOP100_ENTRY: "新进 Top100",
  NEW_TOP50_ENTRY: "新进 Top50",
  NEW_TOP20_ENTRY: "新进 Top20",
  RANK_SURGE: "排名快速上升",
  RANK_DROP: "排名快速下滑",
  DROPPED_FROM_TOP100: "跌出 Top100",
  PRICE_DROP: "价格下降",
  PRICE_NEW_LOW: "价格新低",
  COUPON_ADDED: "新增 Coupon",
  COUPON_REMOVED: "取消 Coupon",
  DEAL_ADDED: "新增 Deal",
  DEAL_REMOVED: "取消 Deal",
  REVIEW_SPIKE: "Review 增长异常",
  NEW_PRODUCT_BREAKOUT: "新品黑马",
  LOW_REVIEW_HIGH_RANK: "低评论高排名",
  BRAND_MATRIX_SURGE: "品牌矩阵上攻",
  BRAND_MATRIX_DROP: "品牌矩阵下滑",
  CORE_COMPETITOR_RISK: "核心竞品威胁"
};

export const attributionTagLabels: Record<AttributionTag, string> = {
  PRICE_DRIVEN: "价格驱动",
  COUPON_DRIVEN: "Coupon 驱动",
  DEAL_DRIVEN: "Deal 驱动",
  REVIEW_DRIVEN: "Review 增长驱动",
  NEW_PRODUCT_PUSH: "新品强推",
  BRAND_MATRIX_PUSH: "品牌矩阵上攻",
  PROMO_END_DROP: "活动结束回落",
  ORGANIC_STRENGTH: "疑似自然转化增强",
  NO_CLEAR_DRIVER: "暂无明显驱动"
};

export interface InsightEvidence {
  sourceEventKey?: string;
  sourceEventType?: string;
  marketplace: string;
  categoryName?: string | null;
  productUrl?: string | null;
  imageUrl?: string | null;
  title?: string | null;
  currentRank?: number | null;
  previousRank?: number | null;
  rankChange?: number | null;
  priceBefore?: number | null;
  priceAfter?: number | null;
  priceChangeRate?: number | null;
  reviewCountBefore?: number | null;
  reviewCountAfter?: number | null;
  reviewCountChange?: number | null;
  couponBefore?: string | null;
  couponAfter?: string | null;
  dealType?: string | null;
  brandRisingCount?: number | null;
  brandNewEntryCount?: number | null;
  brandTop100Count?: number | null;
  priceLowWindow?: "T30" | "T60" | "T90" | "ALL" | null;
  isCoreCompetitor?: boolean;
  strategyTags?: StrategyTag[];
  evidenceItems: string[];
}

export interface InsightScoreBreakdown {
  rankingScore: number;
  productScore: number;
  promoScore: number;
  brandScore: number;
  riskScore: number;
  reasons: string[];
}

export interface InsightEvent {
  id: string;
  eventDate: string;
  asin: string | null;
  brand: string | null;
  categoryId: number | null;
  keywordId: number | null;
  eventType: InsightEventType;
  eventLevel: InsightEventLevel;
  eventTitle: string;
  eventSummary: string;
  attributionTags: AttributionTag[];
  evidence: InsightEvidence;
  scoreTotal: number;
  scoreLevel: InsightScoreLevel;
  scoreBreakdown: InsightScoreBreakdown;
  suggestedAction: string;
  status: InsightEventStatus;
  reviewDueDate: string | null;
  reviewResult: InsightReviewResult | null;
  userNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InsightEventInput extends Omit<InsightEvent, "createdAt" | "updatedAt"> {
  createdAt?: string;
  updatedAt?: string;
}

export interface InsightEventListParams {
  date?: string;
  status?: InsightEventStatus;
  level?: InsightEventLevel;
  eventType?: InsightEventType;
  categoryId?: number;
  keywordId?: number;
  brand?: string;
  asin?: string;
  limit?: number;
  offset?: number;
}

export interface AsinWatchState {
  asin: string;
  watchLevel: AsinWatchLevel;
  watchReason: string | null;
  firstWatchDate: string;
  lastEventDate: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AsinWatchStateInput extends Omit<AsinWatchState, "createdAt" | "updatedAt"> {
  createdAt?: string;
  updatedAt?: string;
}
