import type {
  AlertLog,
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  BsrSnapshotQuality,
  BsrSourceType,
  CategoryMonitor,
  CategorySignalLog,
  NotificationSendLog,
  DailyChange,
  InsightEvent,
  InsightReviewResult,
  KeywordMonitor,
  SerpSnapshot,
  StrategyTag
} from "@amazon-monitor/shared";
import type { CompetitorSourceFilter, CompetitorTierFilter } from "./constants/competitors";

export interface KeywordDetail {
  keyword: KeywordMonitor | null;
  snapshots: SerpSnapshot[];
  changes: DailyChange[];
  alerts: AlertLog[];
}

export interface DailyReportResponse {
  date: string;
  keyword: string | null;
  markdown: string;
}

export interface CategoryDetail {
  category: CategoryMonitor | null;
  snapshots: BestsellerRankSnapshot[];
  brandMatrix: BrandMatrixSnapshot[];
  signals: CategorySignalLog[];
  report: string;
}

export interface CategoryReportResponse {
  date: string;
  categoryId: number | null;
  markdown: string;
}

export type InsightReportPeriod = "weekly" | "monthly";

export interface PeriodInsightReportBrand {
  brand: string;
  eventCount: number;
  topScore: number;
  coreRiskCount: number;
  strategyTags: StrategyTag[];
  representativeEventTitle: string;
  suggestedAction: string;
}

export interface PeriodInsightReportSummary {
  totalEvents: number;
  sLevelCount: number;
  aLevelCount: number;
  coreRiskCount: number;
  newBreakoutCount: number;
  reviewDueCount: number;
  reviewedCount: number;
  confirmedCount: number;
  revertedCount: number;
}

export interface PeriodInsightAiSummary {
  status: "disabled" | "generated" | "failed";
  provider: "openai-responses";
  model: string | null;
  text: string | null;
  error: string | null;
  promptVersion: string;
  generatedAt: string | null;
}

export interface PeriodInsightReportResponse {
  period: InsightReportPeriod;
  startDate: string;
  endDate: string;
  days: number;
  summary: PeriodInsightReportSummary;
  topEvents: InsightEvent[];
  topBrands: PeriodInsightReportBrand[];
  reviewOutcomes: Array<{ result: InsightReviewResult; count: number }>;
  markdown: string;
  aiSummary?: PeriodInsightAiSummary;
}

export interface DatePayload {
  date: string;
}

export interface CategoryPriceHistoryQuery extends DatePayload {
  categoryId?: number | null;
  asin?: string | null;
}

export interface CategoryActivityEventsQuery extends DatePayload {
  categoryId?: number | null;
  asin?: string | null;
  brand?: string | null;
}

export interface BsrScopeQuery {
  date?: string;
  sourceType?: BsrSourceType;
  sourceId?: number | null;
  category?: string | null;
}

export interface BsrHistoryQuery extends BsrScopeQuery {
  limit?: number;
}

export interface BsrQualityQuery extends BsrScopeQuery {
  qualityStatus?: BsrSnapshotQuality["qualityStatus"];
  limit?: number;
}

export interface DatedBsrScopeQuery extends Omit<BsrScopeQuery, "date"> {
  date: string;
}

export interface KeywordCollectPayload extends DatePayload {
  keywordId?: number;
}

export interface CompetitorListQuery {
  keywordId?: number | null;
  sourceType?: CompetitorSourceFilter | null;
  tier?: CompetitorTierFilter | null;
}

export interface ProductActivityCalendarQuery {
  date?: DatePayload["date"];
  marketplace?: string | null;
  limitDays?: number;
}

export type NotificationSendDate = NotificationSendLog["reportDate"];
