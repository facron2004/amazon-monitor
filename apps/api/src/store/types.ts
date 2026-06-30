import type {
  AlertLog,
  AsinWatchState,
  AsinWatchStateInput,
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  BsrRankChange,
  BsrRankHistory,
  BsrSnapshotQuality,
  BsrSourceType,
  CategoryMonitor,
  CategoryMonitorInput,
  CategorySignalLog,
  CollectJob,
  CollectTaskLog,
  WorkerStatus,
  CompetitorActionInsight,
  CompetitorActivityEvent,
  CompetitorFolder,
  CompetitorPoolItem,
  CompetitorTier,
  DailyChange,
  DashboardSummary,
  InsightEvent,
  InsightEventInput,
  InsightEventListParams,
  InsightReviewResult,
  KeywordMonitor,
  KeywordMonitorInput,
  NotificationSchedule,
  NotificationScheduleInput,
  NotificationSendLog,
  ProductActivityCalendar,
  ProductLink,
  ProductPriceHistory,
  SerpSnapshot
} from "@amazon-monitor/shared";

export type { CollectJob } from "@amazon-monitor/shared";

export type KeywordInput = KeywordMonitorInput;

export interface MonitorStore {
  createKeyword(input: KeywordInput): KeywordMonitor;
  updateKeyword(id: number, input: Partial<KeywordInput>): KeywordMonitor;
  markKeywordCollection(id: number, status: KeywordMonitor["todayStatus"]): void;
  deleteKeyword(id: number): void;
  getKeyword(id: number): KeywordMonitor | null;
  listKeywords(filter?: { status?: "enabled" | "disabled" }): KeywordMonitor[];
  createCategoryMonitor(input: CategoryMonitorInput): CategoryMonitor;
  updateCategoryMonitor(id: number, input: Partial<CategoryMonitorInput>): CategoryMonitor;
  markCategoryCollection(id: number, status: CategoryMonitor["todayStatus"]): void;
  deleteCategoryMonitor(id: number): void;
  getCategoryMonitor(id: number): CategoryMonitor | null;
  listCategoryMonitors(): CategoryMonitor[];
}

export interface CategorySnapshotStore {
  deleteCategorySnapshotsForDate(categoryId: number, date: string): void;
  insertCategorySnapshots(items: BestsellerRankSnapshot[]): void;
  listCategorySnapshots(filter?: { date?: string; categoryId?: number; asin?: string; limit?: number; offset?: number }): BestsellerRankSnapshot[];
  getPreviousCategorySnapshots(categoryId: number, beforeDate: string): BestsellerRankSnapshot[];
  upsertProductMasterFromCategorySnapshots(items: BestsellerRankSnapshot[]): void;
  upsertCompetitorsFromCategorySnapshots(items: BestsellerRankSnapshot[], activityEvents?: CompetitorActivityEvent[]): void;
  replaceBrandMatrix(categoryId: number, date: string, items: BrandMatrixSnapshot[]): void;
  listBrandMatrix(filter?: { date?: string; categoryId?: number }): BrandMatrixSnapshot[];
  replaceCategorySignals(categoryId: number, date: string, items: CategorySignalLog[]): void;
  listCategorySignals(filter?: { date?: string; categoryId?: number; limit?: number; offset?: number }): CategorySignalLog[];
  replaceProductPriceHistoryForDate(categoryId: number, date: string, items: BestsellerRankSnapshot[]): void;
  listProductPriceHistory(filter?: {
    date?: string; categoryId?: number; asin?: string; marketplace?: string; limit?: number; offset?: number;
  }): ProductPriceHistory[];
  replaceCategoryActivityEvents(categoryId: number, date: string, items: CompetitorActivityEvent[]): void;
  listCategoryActivityEvents(filter?: {
    date?: string; categoryId?: number; asin?: string; brand?: string; eventType?: string; limit?: number; offset?: number;
  }): CompetitorActivityEvent[];
  saveCategoryReport(date: string, categoryId: number, markdown: string): void;
  getCategoryReport(date: string, categoryId?: number): string;
  getCategoryProductLink(asin: string, categoryId?: number): ProductLink | null;
}

export interface BsrStore {
  replaceBsrRankHistoryForDate(input: { sourceType: BsrSourceType; sourceId: number; date: string; items: BsrRankHistory[] }): void;
  listBsrRankHistory(filter?: {
    date?: string; sourceType?: BsrSourceType; sourceId?: number; category?: string; asin?: string; limit?: number; offset?: number;
  }): BsrRankHistory[];
  listBsrRankChanges(filter: {
    date: string; sourceType?: BsrSourceType; sourceId?: number; category?: string; includeUnchanged?: boolean; limit?: number; offset?: number;
  }): BsrRankChange[];
  listBsrSnapshotQuality(filter?: {
    date?: string; sourceType?: BsrSourceType; sourceId?: number; category?: string; qualityStatus?: string; limit?: number; offset?: number;
  }): BsrSnapshotQuality[];
  recordBsrSnapshotQuality(input: Omit<BsrSnapshotQuality, "id" | "createdAt">): void;
  replaceCompetitorActionInsights(input: {
    sourceType: BsrSourceType; sourceId: number | null; date: string; items: CompetitorActionInsight[];
  }): void;
  listCompetitorActionInsights(filter?: {
    date?: string; sourceType?: BsrSourceType; sourceId?: number; category?: string; asin?: string; brand?: string; insightType?: string; limit?: number; offset?: number;
  }): CompetitorActionInsight[];
}

export interface InsightEventStore {
  listInsightEvents(params?: InsightEventListParams): InsightEvent[];
  listTopInsights(date: string, limit?: number): InsightEvent[];
  getInsightEvent(id: string): InsightEvent | null;
  upsertInsightEvent(event: InsightEventInput): InsightEvent;
  updateInsightEventStatus(id: string, status: InsightEvent["status"], reviewDueDate?: string | null): InsightEvent | null;
  updateInsightEventNote(id: string, note: string): InsightEvent | null;
  updateInsightEventAssignee(id: string, assignee: string | null): InsightEvent | null;
  listReviewDueEvents(date: string, params?: Omit<InsightEventListParams, "date">): InsightEvent[];
  claimReviewDueEvents(date: string, claimId: string, options?: { categoryId?: number; limit?: number }): InsightEvent[];
  releaseReviewClaim(claimId: string): void;
  markInsightEventReviewed(id: string, result: InsightReviewResult, note?: string | null, nextReviewDueDate?: string | null): InsightEvent | null;
  listAsinWatchStates(): AsinWatchState[];
  upsertAsinWatchState(state: AsinWatchStateInput): AsinWatchState;
}

export interface KeywordSnapshotStore {
  deleteSnapshotsForKeywordDate(keywordId: number, date: string): void;
  insertSnapshots(items: SerpSnapshot[]): void;
  listSnapshots(filter?: { date?: string; keywordId?: number; keyword?: string; limit?: number; offset?: number }): SerpSnapshot[];
  getPreviousSnapshots(keywordId: number, beforeDate: string): SerpSnapshot[];
  getHistoryLowestPrices(asins: string[]): Record<string, number | null>;
  upsertCompetitorsFromSnapshots(items: SerpSnapshot[]): void;
}

export interface CompetitorStore {
  listCompetitors(filter?: {
    keywordId?: number; keyword?: string; sourceType?: "keyword" | "category" | "hybrid"; tier?: CompetitorTier;
  }): CompetitorPoolItem[];
  listCompetitorFolders(): CompetitorFolder[];
  getProductLink(asin: string, keywordId?: number): ProductLink | null;
  getProductActivityCalendar(asin: string, filter?: { marketplace?: string; date?: string; limitDays?: number }): ProductActivityCalendar | null;
  setKeyCompetitor(asin: string, isKeyCompetitor: boolean): CompetitorPoolItem | null;
}

export interface NotificationStore {
  createNotificationSchedule(input: NotificationScheduleInput): NotificationSchedule;
  updateNotificationSchedule(id: number, input: Partial<NotificationScheduleInput>): NotificationSchedule;
  deleteNotificationSchedule(id: number): void;
  getNotificationSchedule(id: number): NotificationSchedule | null;
  listNotificationSchedules(): NotificationSchedule[];
  markNotificationScheduleSent(
    id: number,
    input: { sentAt: string; sentDate: string; status: "success" | "failed"; errorMessage?: string | null }
  ): void;
  insertNotificationSendLog(input: Omit<NotificationSendLog, "id" | "createdAt">): NotificationSendLog;
  listNotificationSendLogs(limit?: number, offset?: number): NotificationSendLog[];
}

export interface OperationalStore {
  insertDailyChanges(items: DailyChange[]): void;
  listDailyChanges(filter?: { date?: string; keyword?: string }): DailyChange[];
  insertAlerts(items: AlertLog[]): void;
  listAlerts(filter?: { date?: string; status?: string; keyword?: string; limit?: number; offset?: number }): AlertLog[];
  updateAlertStatus(id: number, status: AlertLog["status"]): AlertLog | null;
  insertTaskLog(input: Omit<CollectTaskLog, "id" | "createdAt">): CollectTaskLog;
  listTaskLogs(limit?: number, offset?: number): CollectTaskLog[];
  saveDailyReport(date: string, keyword: string, markdown: string): void;
  getDailyReport(date: string, keyword?: string): string;
}

export interface DashboardStore {
  getDashboardSummary(date: string): DashboardSummary;
}

export interface QueueStore {
  pushJob(taskType: "keyword" | "category", targetId: number, date: string): CollectJob;
  claimNextJob(): CollectJob | null;
  completeJob(id: number): void;
  failJob(id: number, errorMessage: string, maxRetries: number): void;
  listJobs(limit?: number, offset?: number): CollectJob[];
  getJobStatus(id: number): CollectJob | null;
  getCollectionFreshness(): CollectionFreshness[];
  getQueueStats(): QueueStats;
  recoverStuckJobs(reason: string): number[];
  resetQueue(): void;
}

/**
 * Input for `recordWorkerHeartbeat`. `workerId` is a stable per-process
 * identifier (random UUID at startup) — used as the primary key so the table
 * always reflects the currently-running Worker even after restarts.
 */
export interface WorkerHeartbeatInput {
  workerId: string;
  pid: number;
  host: string;
  startedAt: string;
  version: string;
  lastJobId?: number | null;
  lastStatus?: "pending" | "processing" | "completed" | "failed" | null;
}

export interface WorkerStore {
  recordWorkerHeartbeat(input: WorkerHeartbeatInput): void;
  getWorkerStatus(): WorkerStatus;
}

export interface CollectionFreshness {
  taskType: "keyword" | "category";
  lastCompletedAt: string | null;
  lastStartedAt: string | null;
  lastStatus: "completed" | "failed" | "pending" | "processing" | null;
  totalJobs: number;
  failedJobs: number;
}

export interface QueueStats {
  pendingCount: number;
  processingCount: number;
  completedRecentCount: number;
  failedRecentCount: number;
  /** Milliseconds since the oldest pending job was queued. 0 when none pending. */
  oldestPendingAgeMs: number;
}

export interface ProductActivityStore {
  // Re-exported from product-activity-store module
  // Methods are spread into Store via createProductActivityStore
}

export interface Store extends
  MonitorStore,
  CategorySnapshotStore,
  BsrStore,
  InsightEventStore,
  KeywordSnapshotStore,
  CompetitorStore,
  NotificationStore,
  OperationalStore,
  DashboardStore,
  QueueStore,
  WorkerStore,
  ProductActivityStore {
  reset(): void;
  runInTransaction(work: () => void): void;
  getCategoryDetail(categoryId: number, date: string): {
    category: CategoryMonitor | null;
    snapshots: BestsellerRankSnapshot[];
    brandMatrix: BrandMatrixSnapshot[];
    signals: CategorySignalLog[];
    report: string;
  };
  getKeywordDetail(keywordId: number, date: string): {
    keyword: KeywordMonitor | null;
    snapshots: SerpSnapshot[];
    changes: DailyChange[];
    alerts: AlertLog[];
  };
}
