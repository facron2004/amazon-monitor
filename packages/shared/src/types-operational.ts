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
  orgId?: number;
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
  orgId?: number;
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

export interface DashboardSalesPoint {
  date: string;
  salesAmount: NullableNumber;
}

export interface DashboardMarketplaceOperations {
  marketplace: string;
  /** Present when the underlying operational fact carries a native currency. */
  currency?: string | null;
  metricProductCount: number;
  salesAmount: NullableNumber;
  previousSalesAmount: NullableNumber;
  orders: NullableNumber;
  adSpend: NullableNumber;
  acos: NullableNumber;
  grossMargin: NullableNumber;
  sevenDaySales: DashboardSalesPoint[];
}

export interface DashboardOperationsSummary {
  date: string;
  activeProductCount: number;
  productMetricCount: number;
  inventoryRiskSkuCount: number;
  openTaskCount: number;
  lastSyncedAt: string | null;
  marketplaces: DashboardMarketplaceOperations[];
}

export interface DashboardOverviewResponse extends DashboardSummary {
  operations: DashboardOperationsSummary;
}

export interface CollectTaskLog {
  id: number;
  orgId: number;
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

export interface CollectTaskLogListResponse {
  logs: CollectTaskLog[];
  total: number;
  limit: number;
  offset: number;
}

export interface CollectJob {
  id: number;
  orgId: number;
  taskType: "keyword" | "category" | "data_source_sync";
  targetId: number;
  date: string;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  retryCount: number;
}

/**
 * Aggregated last-known state of the collection queue for a single task type.
 * Powers the dashboard "data freshness" badge.
 */
export interface CollectionFreshness {
  taskType: "keyword" | "category";
  lastCompletedAt: string | null;
  lastStartedAt: string | null;
  lastStatus: "completed" | "failed" | "pending" | "processing" | null;
  dataSource: string | null;
  lastSyncedAt: string | null;
  syncStatus: "pending" | "success" | "partial" | "failed" | "manual" | null;
  syncError: string | null;
  totalJobs: number;
  failedJobs: number;
}

/**
 * Snapshot of the collection queue's health — pending/processing counts and
 * how long the oldest pending job has been waiting. Powers the topbar
 * "待处理 / 处理中 / 最老等待" indicator.
 */
export interface QueueStats {
  pendingCount: number;
  processingCount: number;
  completedRecentCount: number;
  failedRecentCount: number;
  /** Milliseconds since the oldest pending job was queued. 0 when none pending. */
  oldestPendingAgeMs: number;
}

/**
 * Live health snapshot of the background collection Worker process.
 *
 * The Worker writes a heartbeat row every poll iteration; the API reads the
 * most recent row and reports the gap. Powers the topbar "online / stale /
 * offline" indicator so a dead Worker can be spotted at a glance instead of
 * only via the queue stalling.
 *
 * `alive` is computed server-side from `ageMs` against a freshness window —
 * callers should treat it as authoritative and not recompute it.
 */
export interface WorkerStatus {
  /** True when a Worker heart-beated within `liveThresholdMs` (default 15s). */
  alive: boolean;
  /** True when a heart-beat exists but it is older than `liveThresholdMs` but newer than `staleThresholdMs`. */
  stale: boolean;
  /** True when the most recent heart-beat is older than `staleThresholdMs` (default 60s) or no row exists. */
  offline: boolean;
  /** Milliseconds since the last heart-beat. `null` when no Worker has ever reported. */
  ageMs: number | null;
  /** Stable identifier of the Worker instance (changes on each restart). */
  workerId: string | null;
  /** Process ID reported by the Worker. */
  pid: number | null;
  /** Hostname reported by the Worker. */
  host: string | null;
  /** ISO timestamp of the current Worker process start. */
  startedAt: string | null;
  /** ISO timestamp of the last heart-beat. */
  lastBeatAt: string | null;
  /** Application version the Worker is running. */
  version: string | null;
  /** Most recent job ID touched by this Worker (informational). */
  lastJobId: number | null;
  /** Status of `lastJobId` — useful for surfacing "the last job failed". */
  lastStatus: "pending" | "processing" | "completed" | "failed" | null;
}
