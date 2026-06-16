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
  KeywordMonitor,
  SerpSnapshot
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
