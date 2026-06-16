import type { NullableNumber } from "./types-common.js";
import type { SerpSnapshot } from "./types-products.js";

export type ChangeType =
  | "price_drop"
  | "price_rise"
  | "new_coupon"
  | "coupon_disappeared"
  | "coupon_strengthened"
  | "coupon_weakened"
  | "rank_up"
  | "rank_down"
  | "entered_top_10"
  | "entered_top_20"
  | "new_sponsored"
  | "sponsored_disappeared"
  | "new_competitor"
  | "dropped_competitor"
  | "historical_low";

export interface DailyChange {
  asin: string;
  keyword: string;
  marketplace: string;
  snapshotDate: string;
  yesterdayRank: NullableNumber;
  todayRank: NullableNumber;
  rankChange: NullableNumber;
  yesterdayPrice: NullableNumber;
  todayPrice: NullableNumber;
  priceChange: NullableNumber;
  priceChangeRate: NullableNumber;
  yesterdaySponsored: boolean | null;
  todaySponsored: boolean | null;
  changeType: ChangeType;
  title: string;
  brand: string | null;
}

export type AlertLevel = "critical" | "high" | "medium" | "low";

export interface AlertLog {
  id?: number;
  alertDate: string;
  alertType: string;
  alertLevel: AlertLevel;
  keyword: string;
  asin: string;
  title: string;
  brand: string | null;
  alertContent: string;
  oldValue: string | null;
  newValue: string | null;
  status: "pending" | "viewed" | "followed" | "ignored";
  createdAt?: string;
}

export interface AnalyzeDailyChangesInput {
  today: SerpSnapshot[];
  yesterday: SerpSnapshot[];
  historyLowestPrices: Record<string, NullableNumber>;
}

export interface DailyAnalysisResult {
  changes: DailyChange[];
  alerts: AlertLog[];
}

export interface PriceBandSummary {
  count: number;
  minPrice: NullableNumber;
  maxPrice: NullableNumber;
  averagePrice: NullableNumber;
}

export interface DailyReportInput {
  date: string;
  keyword: string;
  analysis: DailyAnalysisResult;
  priceBand: PriceBandSummary;
  failedKeywords?: string[];
}

export interface DashboardSummary {
  keywordCount: number;
  activeKeywordCount: number;
  categoryMonitorCount: number;
  activeCategoryCount: number;
  todaySnapshotCount: number;
  categorySnapshotCount: number;
  competitorCount: number;
  alertCount: number;
  categorySignalCount: number;
  criticalAlertCount: number;
  latestReportDate: string | null;
}

export interface CollectTaskLog {
  id: number;
  taskType: string;
  keywordId: number | null;
  keyword: string | null;
  marketplace: string | null;
  status: "success" | "failed" | "running";
  startTime: string;
  endTime: string | null;
  pageCount: number;
  successCount: number;
  failCount: number;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
}

export interface CollectJob {
  id: number;
  taskType: "keyword" | "category";
  targetId: number;
  date: string;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  retryCount: number;
}
