import type {
  AdDailyMetric,
  AdsMetricListFilter,
  AdsWorkflowSummary,
  AlertRule,
  AlertRuleListFilter,
  AlertLog,
  AiRun,
  AiRunListFilter,
  AiActionFeedback,
  AsinWatchState,
  AsinWatchStateInput,
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  BsrRankChange,
  BsrRankHistory,
  BsrSnapshotQuality,
  BsrSourceType,
  CategoryDailyKpiSnapshot,
  CategoryMonitor,
  CategoryMonitorInput,
  CategorySnapshotDiffResponse,
  CategorySignalLog,
  CommerceStore,
  CommerceStoreListFilter,
  CollectJob,
  CollectTaskLog,
  CollectionFreshness,
  WorkerStatus,
  CompetitorActionInsight,
  CompetitorActivityEvent,
  CompetitorFolder,
  CompetitorDailyKpiSnapshot,
  CompetitorKpiComparison,
  CompetitorPoolItem,
  CompetitorSourceType,
  CompetitorTier,
  CreateManualCompetitorInput,
  CreateAiRunInput,
  CreateDataSourceInput,
  CreateDataSourceSyncRunInput,
  CreateCommerceStoreInput,
  CreateSopInput,
  CreateTaskInput,
  DailyReportArchive,
  DailyReportCoverage,
  DailyReportCoverageStatus,
  PeriodReportArchive,
  PeriodReportCoverage,
  WorkflowReportPeriod,
  DailyChange,
  DashboardOperationsSummary,
  DashboardSummary,
  DataSourceConfig,
  DataSourceListFilter,
  DataSourceSyncRun,
  DataSourceSyncRunListFilter,
  FinishDataSourceSyncRunInput,
  InsightEvent,
  InsightEventInput,
  InsightEventListParams,
  InsightEventNote,
  InsightEventTaskLink,
  InsightReviewResult,
  TopInsightFilterOptions,
  TopInsightFilters,
  InventoryPlanListFilter,
  InventoryReplenishmentPlan,
  InventoryReplenishmentSetting,
  KeywordMonitor,
  KeywordMonitorInput,
  KeywordRankMatrixResponse,
  ListingHealthListFilter,
  NotificationSchedule,
  NotificationScheduleInput,
  NotificationSendLog,
  Organization,
  CreateOwnedProductInput,
  ProductActivityCalendar,
  ProductLink,
  ProductListingHealthItem,
  ProductListingSnapshot,
  ProductPriceHistory,
  ProductProfitPlan,
  ProductProfitPlanFilter,
  ProductProfitSetting,
  PromotionPlan,
  PromotionPlanListFilter,
  PromotionTaskKind,
  CreatePromotionPlanInput,
  ProductReview,
  OwnedProduct,
  OwnedProductDailyMetric,
  OwnedProductDetail,
  OwnedProductListItem,
  OwnedProductStatus,
  ProductScore,
  ReviewVocListFilter,
  ReviewVocSummary,
  SerpSnapshot,
  Session,
  Sop,
  Task,
  TaskExecutionInput,
  TaskNote,
  UpdateDataSourceInput,
  UpdateCommerceStoreInput,
  UpdatePromotionPlanInput,
  UpdateOwnedProductInput,
  UpsertAdDailyMetricInput,
  UpsertAiActionFeedbackInput,
  UpsertAlertRuleConfigInput,
  UpsertInventoryReplenishmentSettingInput,
  UpsertProductReviewInput,
  UpsertProductListingSnapshotInput,
  UpsertOwnedProductDailyMetricInput,
  UpsertProductProfitSettingInput,
  User,
  UserRole,
} from "@amazon-monitor/shared";

export type { CollectJob } from "@amazon-monitor/shared";

export type KeywordInput = KeywordMonitorInput;

export interface MonitorStore {
  createKeyword(input: KeywordInput): KeywordMonitor;
  updateKeyword(
    id: number,
    input: Partial<KeywordInput>,
    orgId?: number,
  ): KeywordMonitor;
  markKeywordCollection(
    id: number,
    status: KeywordMonitor["todayStatus"],
  ): void;
  deleteKeyword(id: number, orgId?: number): void;
  getKeyword(id: number, orgId?: number): KeywordMonitor | null;
  listKeywords(filter?: {
    orgId?: number;
    status?: "enabled" | "disabled";
  }): KeywordMonitor[];
  createCategoryMonitor(input: CategoryMonitorInput): CategoryMonitor;
  updateCategoryMonitor(
    id: number,
    input: Partial<CategoryMonitorInput>,
    orgId?: number,
  ): CategoryMonitor;
  markCategoryCollection(
    id: number,
    status: CategoryMonitor["todayStatus"],
  ): void;
  deleteCategoryMonitor(id: number, orgId?: number): void;
  getCategoryMonitor(id: number, orgId?: number): CategoryMonitor | null;
  listCategoryMonitors(filter?: {
    orgId?: number;
    status?: "enabled" | "disabled";
  }): CategoryMonitor[];
}

export interface CategorySnapshotStore {
  deleteCategorySnapshotsForDate(categoryId: number, date: string): void;
  insertCategorySnapshots(items: BestsellerRankSnapshot[]): void;
  listCategorySnapshots(filter?: {
    orgId?: number;
    date?: string;
    categoryId?: number;
    asin?: string;
    marketplace?: string;
    brand?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): BestsellerRankSnapshot[];
  getPreviousCategorySnapshots(
    categoryId: number,
    beforeDate: string,
    orgId?: number,
  ): BestsellerRankSnapshot[];
  upsertProductMasterFromCategorySnapshots(
    items: BestsellerRankSnapshot[],
  ): void;
  upsertCompetitorsFromCategorySnapshots(
    items: BestsellerRankSnapshot[],
    activityEvents?: CompetitorActivityEvent[],
    orgId?: number,
  ): void;
  replaceBrandMatrix(
    categoryId: number,
    date: string,
    items: BrandMatrixSnapshot[],
  ): void;
  listBrandMatrix(filter?: {
    orgId?: number;
    date?: string;
    categoryId?: number;
    brand?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): BrandMatrixSnapshot[];
  replaceCategorySignals(
    categoryId: number,
    date: string,
    items: CategorySignalLog[],
  ): void;
  listCategorySignals(filter?: {
    orgId?: number;
    date?: string;
    categoryId?: number;
    limit?: number;
    offset?: number;
  }): CategorySignalLog[];
  replaceProductPriceHistoryForDate(
    categoryId: number,
    date: string,
    items: BestsellerRankSnapshot[],
  ): void;
  listProductPriceHistory(filter?: {
    orgId?: number;
    date?: string;
    categoryId?: number;
    asin?: string;
    marketplace?: string;
    brand?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): ProductPriceHistory[];
  replaceCategoryActivityEvents(
    categoryId: number,
    date: string,
    items: CompetitorActivityEvent[],
  ): void;
  listCategoryActivityEvents(filter?: {
    orgId?: number;
    date?: string;
    categoryId?: number;
    asin?: string;
    brand?: string;
    eventType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): CompetitorActivityEvent[];
  saveCategoryReport(date: string, categoryId: number, markdown: string): void;
  getCategoryReport(date: string, categoryId?: number, orgId?: number): string;
  getCategoryProductLink(
    asin: string,
    categoryId?: number,
    orgId?: number,
  ): ProductLink | null;
}

export interface BsrStore {
  replaceBsrRankHistoryForDate(input: {
    sourceType: BsrSourceType;
    sourceId: number;
    date: string;
    items: BsrRankHistory[];
  }): void;
  listBsrRankHistory(filter?: {
    orgId?: number;
    date?: string;
    sourceType?: BsrSourceType;
    sourceId?: number;
    category?: string;
    asin?: string;
    limit?: number;
    offset?: number;
  }): BsrRankHistory[];
  listBsrRankChanges(filter: {
    orgId?: number;
    date: string;
    sourceType?: BsrSourceType;
    sourceId?: number;
    category?: string;
    includeUnchanged?: boolean;
    limit?: number;
    offset?: number;
  }): BsrRankChange[];
  listBsrSnapshotQuality(filter?: {
    orgId?: number;
    date?: string;
    sourceType?: BsrSourceType;
    sourceId?: number;
    category?: string;
    qualityStatus?: string;
    limit?: number;
    offset?: number;
  }): BsrSnapshotQuality[];
  recordBsrSnapshotQuality(
    input: Omit<BsrSnapshotQuality, "id" | "createdAt">,
  ): void;
  replaceCompetitorActionInsights(input: {
    sourceType: BsrSourceType;
    sourceId: number | null;
    date: string;
    items: CompetitorActionInsight[];
  }): void;
  listCompetitorActionInsights(filter?: {
    orgId?: number;
    date?: string;
    sourceType?: BsrSourceType;
    sourceId?: number;
    category?: string;
    asin?: string;
    brand?: string;
    insightType?: string;
    limit?: number;
    offset?: number;
  }): CompetitorActionInsight[];
}

export interface InsightEventStore {
  listInsightEvents(params?: InsightEventListParams): InsightEvent[];
  listTopInsights(
    date: string,
    limit?: number,
    filters?: TopInsightFilters,
    orgId?: number,
  ): InsightEvent[];
  listTopInsightFilterOptions(
    date: string,
    orgId?: number,
  ): TopInsightFilterOptions;
  getInsightEvent(id: string, orgId?: number): InsightEvent | null;
  listInsightEventNotes(eventId: string, orgId?: number): InsightEventNote[];
  upsertInsightEvent(event: InsightEventInput): InsightEvent;
  updateInsightEventStatus(
    id: string,
    status: InsightEvent["status"],
    reviewDueDate?: string | null,
    orgId?: number,
  ): InsightEvent | null;
  updateInsightEventNote(
    id: string,
    note: string,
    orgId?: number,
  ): InsightEvent | null;
  updateInsightEventAssignee(
    id: string,
    assignee: string | null,
    orgId?: number,
  ): InsightEvent | null;
  listReviewDueEvents(
    date: string,
    params?: Omit<InsightEventListParams, "date">,
  ): InsightEvent[];
  claimReviewDueEvents(
    date: string,
    claimId: string,
    options?: { categoryId?: number; orgId?: number; limit?: number },
  ): InsightEvent[];
  releaseReviewClaim(claimId: string): void;
  markInsightEventReviewed(
    id: string,
    result: InsightReviewResult,
    note?: string | null,
    nextReviewDueDate?: string | null,
    orgId?: number,
  ): InsightEvent | null;
  listAsinWatchStates(orgId?: number): AsinWatchState[];
  upsertAsinWatchState(state: AsinWatchStateInput): AsinWatchState;
}

export interface KeywordSnapshotStore {
  deleteSnapshotsForKeywordDate(keywordId: number, date: string): void;
  insertSnapshots(items: SerpSnapshot[]): void;
  listSnapshots(filter?: {
    orgId?: number;
    date?: string;
    keywordId?: number;
    keyword?: string;
    asin?: string;
    marketplace?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): SerpSnapshot[];
  getPreviousSnapshots(keywordId: number, beforeDate: string): SerpSnapshot[];
  getHistoryLowestPrices(
    asins: string[],
    orgId?: number,
  ): Record<string, number | null>;
  upsertCompetitorsFromSnapshots(items: SerpSnapshot[], orgId?: number): void;
}

export interface CompetitorStore {
  listCompetitors(filter?: {
    orgId?: number;
    keywordId?: number;
    keyword?: string;
    sourceType?: CompetitorSourceType;
    tier?: CompetitorTier;
  }): CompetitorPoolItem[];
  getCompetitor(id: number, orgId?: number): CompetitorPoolItem | null;
  createManualCompetitor(
    input: CreateManualCompetitorInput,
    orgId?: number,
  ): CompetitorPoolItem;
  createManualCompetitors(
    inputs: CreateManualCompetitorInput[],
    orgId?: number,
  ): CompetitorPoolItem[];
  addCategoryCompetitor(
    asin: string,
    categoryId: number,
    orgId?: number,
  ): CompetitorPoolItem | null;
  listCompetitorFolders(orgId?: number): CompetitorFolder[];
  captureCompetitorDailyKpiSnapshot(
    orgId: number,
    date: string,
  ): CompetitorDailyKpiSnapshot;
  getCompetitorKpiComparison(
    orgId: number,
    date: string,
  ): CompetitorKpiComparison;
  getProductLink(
    asin: string,
    keywordId?: number,
    orgId?: number,
  ): ProductLink | null;
  getProductActivityCalendar(
    asin: string,
    filter?: {
      orgId?: number;
      marketplace?: string;
      date?: string;
      limitDays?: number;
    },
  ): ProductActivityCalendar | null;
  setKeyCompetitor(
    asin: string,
    isKeyCompetitor: boolean,
    orgId?: number,
  ): CompetitorPoolItem | null;
}

export interface NotificationStore {
  createNotificationSchedule(
    input: NotificationScheduleInput,
    orgId?: number,
  ): NotificationSchedule;
  updateNotificationSchedule(
    id: number,
    input: Partial<NotificationScheduleInput>,
    orgId?: number,
  ): NotificationSchedule;
  deleteNotificationSchedule(id: number, orgId?: number): void;
  getNotificationSchedule(
    id: number,
    orgId?: number,
  ): NotificationSchedule | null;
  listNotificationSchedules(orgId?: number): NotificationSchedule[];
  markNotificationScheduleSent(
    id: number,
    input: {
      sentAt: string;
      sentDate: string;
      status: "success" | "failed";
      errorMessage?: string | null;
    },
    orgId?: number,
  ): void;
  insertNotificationSendLog(
    input: Omit<NotificationSendLog, "id" | "createdAt">,
  ): NotificationSendLog;
  listNotificationSendLogs(
    limit?: number,
    offset?: number,
    orgId?: number,
  ): NotificationSendLog[];
}

export interface OperationalStore {
  deleteDailyChangesForKeywordDate(
    keyword: string,
    date: string,
    orgId?: number,
  ): void;
  insertDailyChanges(items: DailyChange[], orgId?: number): void;
  listDailyChanges(filter?: {
    orgId?: number;
    date?: string;
    keyword?: string;
  }): DailyChange[];
  deleteAlertsForKeywordDate(
    keyword: string,
    date: string,
    orgId?: number,
  ): void;
  insertAlerts(items: AlertLog[], orgId?: number): void;
  listAlerts(filter?: {
    orgId?: number;
    date?: string;
    status?: string;
    keyword?: string;
    limit?: number;
    offset?: number;
  }): AlertLog[];
  updateAlertStatus(
    id: number,
    status: AlertLog["status"],
    orgId?: number,
  ): AlertLog | null;
  insertTaskLog(
    input: Omit<CollectTaskLog, "id" | "createdAt">,
  ): CollectTaskLog;
  listTaskLogs(
    limit?: number,
    offset?: number,
    orgId?: number,
  ): CollectTaskLog[];
  saveDailyReport(
    date: string,
    keyword: string,
    markdown: string,
    orgId?: number,
  ): void;
  getDailyReport(date: string, keyword?: string, orgId?: number): string;
}

export interface DashboardStore {
  getDashboardSummary(date: string, orgId?: number): DashboardSummary;
  getDashboardOperationsSummary(
    orgId: number,
    date: string,
  ): DashboardOperationsSummary;
}

export interface QueueStore {
  pushJob(
    taskType: "keyword" | "category",
    targetId: number,
    date: string,
    orgId?: number,
  ): CollectJob;
  claimNextJob(): CollectJob | null;
  completeJob(id: number): void;
  failJob(id: number, errorMessage: string, maxRetries: number): void;
  listJobs(limit?: number, offset?: number, orgId?: number): CollectJob[];
  getJobStatus(id: number, orgId?: number): CollectJob | null;
  getCollectionFreshness(orgId?: number): CollectionFreshness[];
  getQueueStats(orgId?: number): QueueStats;
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

export interface ProductStore {
  createProduct(input: CreateOwnedProductInput): OwnedProduct;
  updateProduct(id: number, input: UpdateOwnedProductInput): OwnedProduct;
  getProduct(id: number): OwnedProduct | null;
  getProductBySku(
    orgId: number,
    marketplace: string,
    sku: string,
  ): OwnedProduct | null;
  getProductDetail(id: number, date?: string): OwnedProductDetail | null;
  listProducts(filter?: {
    orgId?: number;
    storeId?: number;
    status?: OwnedProductStatus;
    marketplace?: string;
    brand?: string;
    q?: string;
    date?: string;
    limit?: number;
    offset?: number;
  }): OwnedProductListItem[];
  upsertProductDailyMetric(
    input: UpsertOwnedProductDailyMetricInput,
  ): OwnedProductDailyMetric;
  listProductDailyMetrics(
    productId: number,
    filter?: {
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    },
  ): OwnedProductDailyMetric[];
  listOrganizationProductDailyMetrics(
    orgId: number,
    filter?: {
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    },
  ): OwnedProductDailyMetric[];
  getProductRiskScore(id: number, date?: string): ProductScore | null;
  getProductOpportunityScore(id: number, date?: string): ProductScore | null;
}

export interface CommerceStoreStore {
  createCommerceStore(input: CreateCommerceStoreInput): CommerceStore;
  updateCommerceStore(
    id: number,
    input: UpdateCommerceStoreInput,
  ): CommerceStore | null;
  getCommerceStore(id: number): CommerceStore | null;
  listCommerceStores(filter?: CommerceStoreListFilter): CommerceStore[];
}

export interface PromotionStore {
  createPromotionPlan(input: CreatePromotionPlanInput): PromotionPlan;
  updatePromotionPlan(
    id: number,
    input: UpdatePromotionPlanInput,
  ): PromotionPlan | null;
  getPromotionPlan(id: number): PromotionPlan | null;
  listPromotionPlans(filter: PromotionPlanListFilter): PromotionPlan[];
  linkPromotionTask(
    id: number,
    kind: PromotionTaskKind,
    taskId: number,
  ): PromotionPlan;
}

export interface AiRunStore {
  createAiRun(input: CreateAiRunInput): AiRun;
  getAiRun(id: number, orgId: number): AiRun | null;
  listAiRuns(filter?: AiRunListFilter): AiRun[];
  upsertAiActionFeedback(input: UpsertAiActionFeedbackInput): AiActionFeedback;
  listAiActionFeedback(input: {
    orgId: number;
    userId: number;
    runIds: number[];
  }): AiActionFeedback[];
}

export interface ListingHealthStore {
  upsertProductListingSnapshot(
    input: UpsertProductListingSnapshotInput,
  ): ProductListingSnapshot;
  getProductListingHealth(
    productId: number,
    date?: string,
  ): ProductListingHealthItem | null;
  listProductListingHealth(
    filter?: ListingHealthListFilter,
  ): ProductListingHealthItem[];
}

export interface AdsStore {
  upsertAdDailyMetric(input: UpsertAdDailyMetricInput): AdDailyMetric;
  getAdDailyMetricByIdentity(input: {
    orgId: number;
    date: string;
    campaignId: string;
    adGroupName?: string | null;
    targetText?: string | null;
    searchTerm?: string | null;
  }): AdDailyMetric | null;
  listAdDailyMetrics(filter?: AdsMetricListFilter): AdDailyMetric[];
  getAdsWorkflowSummary(filter?: AdsMetricListFilter): AdsWorkflowSummary;
}

export interface ReviewVocStore {
  upsertProductReview(input: UpsertProductReviewInput): ProductReview;
  listProductReviews(filter?: ReviewVocListFilter): ProductReview[];
  getReviewVocSummary(
    productId: number,
    filter?: ReviewVocListFilter,
  ): ReviewVocSummary | null;
  listReviewVocSummaries(filter?: ReviewVocListFilter): ReviewVocSummary[];
}

export interface InventoryStore {
  upsertInventorySetting(
    input: UpsertInventoryReplenishmentSettingInput,
  ): InventoryReplenishmentSetting;
  getInventorySetting(productId: number): InventoryReplenishmentSetting | null;
  getInventoryPlan(
    productId: number,
    filter?: InventoryPlanListFilter,
  ): InventoryReplenishmentPlan | null;
  listInventoryPlans(
    filter?: InventoryPlanListFilter,
  ): InventoryReplenishmentPlan[];
}

export interface ProfitStore {
  upsertProfitSetting(
    input: UpsertProductProfitSettingInput,
  ): ProductProfitSetting;
  getProfitSetting(productId: number): ProductProfitSetting | null;
  getProfitPlan(
    productId: number,
    filter?: ProductProfitPlanFilter,
  ): ProductProfitPlan | null;
  listProfitPlans(filter?: ProductProfitPlanFilter): ProductProfitPlan[];
}

export interface RuleStore {
  listAlertRules(filter: AlertRuleListFilter): AlertRule[];
  getAlertRule(orgId: number, ruleId: string): AlertRule | null;
  upsertAlertRuleConfig(input: UpsertAlertRuleConfigInput): AlertRule;
  resetAlertRuleConfig(orgId: number, ruleId: string): AlertRule;
}

export interface DataSourceStore {
  createDataSource(input: CreateDataSourceInput): DataSourceConfig;
  updateDataSource(
    id: number,
    input: UpdateDataSourceInput,
  ): DataSourceConfig | null;
  getDataSource(id: number): DataSourceConfig | null;
  listDataSources(filter?: DataSourceListFilter): DataSourceConfig[];
  createDataSourceSyncRun(
    input: CreateDataSourceSyncRunInput,
  ): DataSourceSyncRun;
  finishDataSourceSyncRun(
    id: number,
    input: FinishDataSourceSyncRunInput,
  ): DataSourceSyncRun | null;
  listDataSourceSyncRuns(
    filter: DataSourceSyncRunListFilter,
  ): DataSourceSyncRun[];
}

export interface ReportStore {
  saveDailyReportArchive(input: {
    orgId: number;
    reportDate: string;
    markdown: string;
    coverageStatus: DailyReportCoverageStatus;
    coverage: DailyReportCoverage;
    signalCount: number;
    riskCount: number;
    taskCount: number;
    generatedBy: number | null;
  }): DailyReportArchive;
  getDailyReportArchive(
    orgId: number,
    reportDate: string,
  ): DailyReportArchive | null;
  listDailyReportArchives(filter: {
    orgId: number;
    limit?: number;
    offset?: number;
  }): DailyReportArchive[];
  countDailyReportArchives(orgId: number): number;
  savePeriodReportArchive(input: {
    orgId: number;
    period: WorkflowReportPeriod;
    startDate: string;
    endDate: string;
    markdown: string;
    coverageStatus: DailyReportCoverageStatus;
    coverage: PeriodReportCoverage;
    salesMarketplaceCount: number;
    insightCount: number;
    completedTaskCount: number;
    generatedBy: number | null;
  }): PeriodReportArchive;
  getPeriodReportArchive(
    orgId: number,
    period: WorkflowReportPeriod,
    endDate: string,
  ): PeriodReportArchive | null;
  listPeriodReportArchives(filter: {
    orgId: number;
    period?: WorkflowReportPeriod;
    limit?: number;
    offset?: number;
  }): PeriodReportArchive[];
  countPeriodReportArchives(
    orgId: number,
    period?: WorkflowReportPeriod,
  ): number;
}

export interface TaskStore {
  createTask(
    input: Omit<CreateTaskInput, "taskType"> & { taskType: Task["taskType"] },
  ): Task;
  updateTask(
    id: number,
    input: Partial<{
      title: string;
      description: string;
      priority: Task["priority"];
      status: Task["status"];
      assigneeId: number | null;
      dueDate: string | null;
      actionTaken: string | null;
      resultBeforeJson: string | null;
      resultAfterJson: string | null;
      reviewNote: string | null;
      reviewResult: Task["reviewResult"] | null;
    }>,
  ): Task;
  submitTaskForReview(id: number, input: TaskExecutionInput): Task;
  reviewTask(
    id: number,
    input: {
      reviewResult: NonNullable<Task["reviewResult"]>;
      reviewNote?: string | null;
    },
  ): Task;
  getTask(id: number): Task | null;
  listTasks(filter?: {
    orgId?: number;
    sourceType?: Task["sourceType"];
    sourceId?: string;
    status?: Task["status"];
    statusIn?: Task["status"][];
    assigneeId?: number;
    relatedAsin?: string;
    priority?: Task["priority"];
    limit?: number;
    offset?: number;
  }): Task[];
  addTaskNote(input: {
    taskId: number;
    authorId?: number | null;
    body: string;
  }): TaskNote;
  listTaskNotes(taskId: number): TaskNote[];
  transitionTaskStatus(id: number, nextStatus: Task["status"]): Task | null;
  linkEventToTask(eventId: string, taskId: number): InsightEventTaskLink;
  listTasksForEvent(eventId: string, orgId?: number): Task[];
  listEventsForTask(taskId: number): InsightEventTaskLink[];
}

export interface SopStore {
  createSop(input: CreateSopInput): Sop;
  updateSop(
    id: number,
    input: Partial<{
      title: string;
      bodyMd: string;
      category: Sop["category"];
      status: Sop["status"];
      tags: string[];
    }>,
  ): Sop;
  getSop(id: number): Sop | null;
  listSops(filter?: {
    orgId?: number;
    status?: Sop["status"];
    category?: Sop["category"];
    q?: string;
    limit?: number;
    offset?: number;
  }): Sop[];
  publishSop(id: number): Sop;
  archiveSop(id: number): Sop;
}

export interface IdentityStore {
  createOrganization(input: { name: string; plan?: string }): Organization;
  listOrganizations(): Organization[];
  getOrganization(id: number): Organization | null;
  createUser(input: {
    orgId: number;
    username: string;
    password: string;
    role: UserRole;
    displayName?: string | null;
    email?: string | null;
    passwordAlgo?: string;
  }): User;
  replaceBootstrapAdmin(input: {
    userId: number;
    username: string;
    password: string;
    displayName?: string | null;
    email?: string | null;
  }): User;
  listUsers(): User[];
  getUserByUsername(username: string): User | null;
  verifyUserCredentials(username: string, password: string): User | null;
  recordUserLogin(userId: number): void;
  createSession(input: {
    userId: number;
    expiresAt: string;
    ip?: string | null;
    userAgent?: string | null;
  }): { token: string; session: Session };
  findSessionByToken(token: string): Session | null;
  revokeSession(sessionId: string): void;
  purgeExpiredSessions(): number;
}

export interface Store
  extends
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
    ProductActivityStore,
    ProductStore,
    CommerceStoreStore,
    PromotionStore,
    AiRunStore,
    ListingHealthStore,
    AdsStore,
    ReviewVocStore,
    InventoryStore,
    ProfitStore,
    RuleStore,
    DataSourceStore,
    ReportStore,
    TaskStore,
    SopStore,
    IdentityStore {
  reset(): void;
  runInTransaction(work: () => void): void;
  getCategoryDetail(
    categoryId: number,
    date: string,
    orgId?: number,
  ): {
    category: CategoryMonitor | null;
    snapshots: BestsellerRankSnapshot[];
    brandMatrix: BrandMatrixSnapshot[];
    signals: CategorySignalLog[];
    report: string;
    yesterdayKpiSnapshot: CategoryDailyKpiSnapshot | null;
  };
  getCategoryDiff(
    categoryId: number,
    date: string,
    compareDate: string,
    orgId?: number,
  ): CategorySnapshotDiffResponse;
  getKeywordDetail(
    keywordId: number,
    date: string,
    orgId?: number,
  ): {
    keyword: KeywordMonitor | null;
    snapshots: SerpSnapshot[];
    changes: DailyChange[];
    alerts: AlertLog[];
  };
  getKeywordRankMatrix(
    organizationId: number,
    requestedDate: string,
  ): KeywordRankMatrixResponse;
}
