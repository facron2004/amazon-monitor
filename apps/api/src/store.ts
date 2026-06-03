import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { buildCompetitorActionInsights, describeRankCoverageGaps, selectSpecificBestsellerRank } from "@amazon-monitor/shared";
import type {
  AlertLog,
  AlertLevel,
  BsrRankChange,
  BsrRankHistory,
  BsrSnapshotQuality,
  BsrSourceType,
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  CategoryMonitor,
  CategoryMonitorInput,
  CategorySignalLog,
  ChangeType,
  CollectTaskLog,
  CompetitorActionInsight,
  CompetitorActivityEvent,
  CompetitorFolder,
  CompetitorPoolItem,
  CompetitorTier,
  DailyChange,
  DashboardSummary,
  KeywordMonitor,
  KeywordStatus,
  NotificationSchedule,
  NotificationScheduleInput,
  NotificationSendLog,
  ProductLink,
  ProductActivityCalendar,
  ProductActivityCalendarDay,
  ProductPriceHistory,
  ProductRanking,
  SerpSnapshot
} from "@amazon-monitor/shared";

export interface KeywordInput {
  keyword: string;
  marketplace: string;
  zipCode?: string | null;
  language?: string | null;
  categoryTag?: string | null;
  crawlPages?: number;
  status?: KeywordStatus;
}

export interface Store {
  reset(): void;
  createKeyword(input: KeywordInput): KeywordMonitor;
  updateKeyword(id: number, input: Partial<KeywordInput>): KeywordMonitor;
  markKeywordCollection(id: number, status: KeywordMonitor["todayStatus"]): void;
  deleteKeyword(id: number): void;
  getKeyword(id: number): KeywordMonitor | null;
  listKeywords(): KeywordMonitor[];
  createCategoryMonitor(input: CategoryMonitorInput): CategoryMonitor;
  updateCategoryMonitor(id: number, input: Partial<CategoryMonitorInput>): CategoryMonitor;
  markCategoryCollection(id: number, status: CategoryMonitor["todayStatus"]): void;
  deleteCategoryMonitor(id: number): void;
  getCategoryMonitor(id: number): CategoryMonitor | null;
  listCategoryMonitors(): CategoryMonitor[];
  deleteCategorySnapshotsForDate(categoryId: number, date: string): void;
  insertCategorySnapshots(items: BestsellerRankSnapshot[]): void;
  listCategorySnapshots(filter?: { date?: string; categoryId?: number; asin?: string; limit?: number }): BestsellerRankSnapshot[];
  getPreviousCategorySnapshots(categoryId: number, beforeDate: string): BestsellerRankSnapshot[];
  upsertProductMasterFromCategorySnapshots(items: BestsellerRankSnapshot[]): void;
  upsertCompetitorsFromCategorySnapshots(items: BestsellerRankSnapshot[], activityEvents?: CompetitorActivityEvent[]): void;
  replaceBrandMatrix(categoryId: number, date: string, items: BrandMatrixSnapshot[]): void;
  listBrandMatrix(filter?: { date?: string; categoryId?: number }): BrandMatrixSnapshot[];
  replaceCategorySignals(categoryId: number, date: string, items: CategorySignalLog[]): void;
  listCategorySignals(filter?: { date?: string; categoryId?: number; limit?: number }): CategorySignalLog[];
  replaceProductPriceHistoryForDate(categoryId: number, date: string, items: BestsellerRankSnapshot[]): void;
  listProductPriceHistory(filter?: { date?: string; categoryId?: number; asin?: string; marketplace?: string; limit?: number }): ProductPriceHistory[];
  replaceCategoryActivityEvents(categoryId: number, date: string, items: CompetitorActivityEvent[]): void;
  listCategoryActivityEvents(filter?: { date?: string; categoryId?: number; asin?: string; brand?: string; eventType?: string; limit?: number }): CompetitorActivityEvent[];
  saveCategoryReport(date: string, categoryId: number, markdown: string): void;
  getCategoryReport(date: string, categoryId?: number): string;
  getCategoryProductLink(asin: string, categoryId?: number): ProductLink | null;
  replaceBsrRankHistoryForDate(input: { sourceType: BsrSourceType; sourceId: number; date: string; items: BsrRankHistory[] }): void;
  listBsrRankHistory(filter?: { date?: string; sourceType?: BsrSourceType; sourceId?: number; category?: string; asin?: string; limit?: number }): BsrRankHistory[];
  listBsrRankChanges(filter: {
    date: string;
    sourceType?: BsrSourceType;
    sourceId?: number;
    category?: string;
    includeUnchanged?: boolean;
    limit?: number;
  }): BsrRankChange[];
  listBsrSnapshotQuality(filter?: {
    date?: string;
    sourceType?: BsrSourceType;
    sourceId?: number;
    category?: string;
    qualityStatus?: string;
    limit?: number;
  }): BsrSnapshotQuality[];
  recordBsrSnapshotQuality(input: Omit<BsrSnapshotQuality, "id" | "createdAt">): void;
  replaceCompetitorActionInsights(input: { sourceType: BsrSourceType; sourceId: number | null; date: string; items: CompetitorActionInsight[] }): void;
  listCompetitorActionInsights(filter?: {
    date?: string;
    sourceType?: BsrSourceType;
    sourceId?: number;
    category?: string;
    asin?: string;
    brand?: string;
    insightType?: string;
    limit?: number;
  }): CompetitorActionInsight[];
  getCategoryDetail(categoryId: number, date: string): {
    category: CategoryMonitor | null;
    snapshots: BestsellerRankSnapshot[];
    brandMatrix: BrandMatrixSnapshot[];
    signals: CategorySignalLog[];
    report: string;
  };
  deleteSnapshotsForKeywordDate(keywordId: number, date: string): void;
  insertSnapshots(items: SerpSnapshot[]): void;
  listSnapshots(filter?: { date?: string; keywordId?: number; keyword?: string; limit?: number }): SerpSnapshot[];
  getPreviousSnapshots(keywordId: number, beforeDate: string): SerpSnapshot[];
  getHistoryLowestPrices(asins: string[]): Record<string, number | null>;
  upsertCompetitorsFromSnapshots(items: SerpSnapshot[]): void;
  listCompetitors(filter?: { keywordId?: number; keyword?: string; sourceType?: "keyword" | "category" | "hybrid"; tier?: CompetitorTier }): CompetitorPoolItem[];
  listCompetitorFolders(): CompetitorFolder[];
  getProductLink(asin: string, keywordId?: number): ProductLink | null;
  getProductActivityCalendar(asin: string, filter?: { marketplace?: string; date?: string; limitDays?: number }): ProductActivityCalendar | null;
  setKeyCompetitor(asin: string, isKeyCompetitor: boolean): CompetitorPoolItem | null;
  insertDailyChanges(items: DailyChange[]): void;
  listDailyChanges(filter?: { date?: string; keyword?: string }): DailyChange[];
  insertAlerts(items: AlertLog[]): void;
  listAlerts(filter?: { date?: string; status?: string; limit?: number }): AlertLog[];
  updateAlertStatus(id: number, status: AlertLog["status"]): AlertLog | null;
  insertTaskLog(input: Omit<CollectTaskLog, "id" | "createdAt">): CollectTaskLog;
  listTaskLogs(limit?: number): CollectTaskLog[];
  saveDailyReport(date: string, keyword: string, markdown: string): void;
  getDailyReport(date: string, keyword?: string): string;
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
  listNotificationSendLogs(limit?: number): NotificationSendLog[];
  getDashboardSummary(date: string): DashboardSummary;
  getKeywordDetail(keywordId: number, date: string): {
    keyword: KeywordMonitor | null;
    snapshots: SerpSnapshot[];
    changes: DailyChange[];
    alerts: AlertLog[];
  };
}

export function openAppStore(dbPath = "data/amazon-monitor.sqlite"): Store {
  const directory = dirname(dbPath);
  if (directory && directory !== "." && !existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  configureDatabase(db);
  initSchema(db);
  return createStore(db);
}

function configureDatabase(db: DatabaseSync): void {
  db.exec(`
    PRAGMA busy_timeout = ${sqliteBusyTimeoutMs()};
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `);
}

export function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS amazon_keyword_monitor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      zip_code TEXT,
      language TEXT,
      category_tag TEXT,
      crawl_pages INTEGER DEFAULT 3,
      status INTEGER DEFAULT 1,
      last_collected_at TEXT,
      today_status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS amazon_bestseller_category_monitor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      category_url TEXT NOT NULL,
      category_path TEXT,
      crawl_top_n INTEGER DEFAULT 100,
      status INTEGER DEFAULT 1,
      last_collected_at TEXT,
      today_status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS amazon_bestseller_rank_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      category_name TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,
      rank_no INTEGER NOT NULL,
      asin TEXT NOT NULL,
      title TEXT NOT NULL,
      brand TEXT,
      image_url TEXT,
      product_url TEXT,
      current_price REAL,
      original_price REAL,
      coupon_text TEXT,
      coupon_value REAL,
      coupon_rate REAL,
      final_estimated_price REAL,
      currency TEXT,
      rating REAL,
      review_count INTEGER,
      is_prime INTEGER DEFAULT 0,
      deal_badge TEXT,
      bsr_rank INTEGER,
      bsr_category TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_bestseller_category_date ON amazon_bestseller_rank_snapshot(category_id, snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_bestseller_asin_date ON amazon_bestseller_rank_snapshot(asin, snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_bestseller_activity_calendar ON amazon_bestseller_rank_snapshot(asin, marketplace, snapshot_date, rank_no);
    CREATE INDEX IF NOT EXISTS idx_bestseller_rank ON amazon_bestseller_rank_snapshot(category_id, rank_no);
    CREATE INDEX IF NOT EXISTS idx_bestseller_category_date_rank ON amazon_bestseller_rank_snapshot(category_id, snapshot_date, rank_no);

    CREATE TABLE IF NOT EXISTS amazon_bsr_rank_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER,
      source_name TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      asin TEXT NOT NULL,
      title TEXT NOT NULL,
      brand TEXT,
      category TEXT NOT NULL,
      rank_no INTEGER NOT NULL,
      rank_url TEXT,
      product_url TEXT,
      current_price REAL,
      parent_rank INTEGER,
      is_specific_rank INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(snapshot_date, source_type, source_id, asin, category)
    );
    CREATE INDEX IF NOT EXISTS idx_bsr_history_date ON amazon_bsr_rank_history(snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_bsr_history_scope ON amazon_bsr_rank_history(source_type, source_id, snapshot_date, category);
    CREATE INDEX IF NOT EXISTS idx_bsr_history_asin ON amazon_bsr_rank_history(asin, marketplace, category, snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_bsr_history_scope_rank ON amazon_bsr_rank_history(source_type, source_id, snapshot_date DESC, category, rank_no);

    CREATE TABLE IF NOT EXISTS amazon_bsr_snapshot_quality (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER,
      source_name TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      category TEXT NOT NULL,
      expected_count INTEGER,
      actual_count INTEGER NOT NULL,
      unique_asin_count INTEGER NOT NULL,
      unique_rank_count INTEGER NOT NULL DEFAULT 0,
      min_rank INTEGER,
      max_rank INTEGER,
      quality_status TEXT NOT NULL,
      issue TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(snapshot_date, source_type, source_id, category)
    );
    CREATE INDEX IF NOT EXISTS idx_bsr_quality_date ON amazon_bsr_snapshot_quality(snapshot_date, source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_bsr_quality_status ON amazon_bsr_snapshot_quality(quality_status, snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_bsr_quality_scope_status ON amazon_bsr_snapshot_quality(snapshot_date, source_type, source_id, category, quality_status);

    CREATE TABLE IF NOT EXISTS amazon_product_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asin TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      title TEXT,
      brand TEXT,
      image_url TEXT,
      product_url TEXT,
      first_seen_date TEXT,
      first_seen_category TEXT,
      last_seen_date TEXT,
      latest_category_name TEXT,
      latest_rank INTEGER,
      latest_price REAL,
      rating REAL,
      review_count INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(asin, marketplace)
    );

    CREATE TABLE IF NOT EXISTS amazon_product_price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      category_name TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      asin TEXT NOT NULL,
      brand TEXT,
      title TEXT NOT NULL,
      current_price REAL,
      coupon_value REAL,
      coupon_rate REAL,
      final_estimated_price REAL,
      t30_low_price REAL,
      t60_low_price REAL,
      t90_low_price REAL,
      monitoring_low_price REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(snapshot_date, category_id, asin, marketplace)
    );
    CREATE INDEX IF NOT EXISTS idx_product_price_history_date ON amazon_product_price_history(snapshot_date, category_id);
    CREATE INDEX IF NOT EXISTS idx_product_price_history_asin ON amazon_product_price_history(asin, marketplace, snapshot_date);

    CREATE TABLE IF NOT EXISTS amazon_brand_matrix_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      category_name TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,
      brand TEXT NOT NULL,
      product_count_top100 INTEGER DEFAULT 0,
      product_count_top50 INTEGER DEFAULT 0,
      product_count_top20 INTEGER DEFAULT 0,
      best_rank INTEGER,
      average_rank REAL,
      new_entry_count INTEGER DEFAULT 0,
      dropped_count INTEGER DEFAULT 0,
      rank_up_count INTEGER DEFAULT 0,
      rank_down_count INTEGER DEFAULT 0,
      price_down_count INTEGER DEFAULT 0,
      coupon_count INTEGER DEFAULT 0,
      deal_count INTEGER DEFAULT 0,
      top_asins_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(category_id, snapshot_date, brand)
    );
    CREATE INDEX IF NOT EXISTS idx_brand_matrix_category_date ON amazon_brand_matrix_snapshot(category_id, snapshot_date);

    CREATE TABLE IF NOT EXISTS amazon_competitor_signal_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_date TEXT NOT NULL,
      source_type TEXT DEFAULT 'category',
      category_id INTEGER,
      category_name TEXT,
      marketplace TEXT,
      signal_type TEXT NOT NULL,
      alert_level TEXT,
      asin TEXT,
      brand TEXT,
      title TEXT,
      rank_no INTEGER,
      previous_rank INTEGER,
      price REAL,
      previous_price REAL,
      content TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_signal_date ON amazon_competitor_signal_log(signal_date);
    CREATE INDEX IF NOT EXISTS idx_signal_category ON amazon_competitor_signal_log(category_id, signal_date);
    CREATE INDEX IF NOT EXISTS idx_signal_asin_date ON amazon_competitor_signal_log(asin, marketplace, signal_date);

    CREATE TABLE IF NOT EXISTS amazon_competitor_activity_event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_key TEXT NOT NULL,
      event_date TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_level TEXT,
      category_id INTEGER NOT NULL,
      category_name TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      asin TEXT,
      brand TEXT,
      title TEXT,
      price_before REAL,
      price_after REAL,
      price_change_rate REAL,
      coupon_before TEXT,
      coupon_after TEXT,
      deal_type TEXT,
      rank_before INTEGER,
      rank_after INTEGER,
      rank_change INTEGER,
      keyword_rank_before INTEGER,
      keyword_rank_after INTEGER,
      event_summary TEXT NOT NULL,
      possible_strategy TEXT NOT NULL,
      suggested_action TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_date, category_id, event_key)
    );
    CREATE INDEX IF NOT EXISTS idx_activity_event_date ON amazon_competitor_activity_event(event_date, category_id);
    CREATE INDEX IF NOT EXISTS idx_activity_event_asin ON amazon_competitor_activity_event(asin, event_date);
    CREATE INDEX IF NOT EXISTS idx_activity_event_brand ON amazon_competitor_activity_event(brand, event_date);

    CREATE TABLE IF NOT EXISTS amazon_competitor_action_insight (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      insight_date TEXT NOT NULL,
      previous_date TEXT,
      source_type TEXT NOT NULL,
      source_id INTEGER,
      source_name TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      category TEXT NOT NULL,
      asin TEXT,
      brand TEXT,
      title TEXT,
      insight_type TEXT NOT NULL,
      confidence TEXT NOT NULL,
      current_rank INTEGER,
      previous_rank INTEGER,
      rank_change INTEGER,
      price REAL,
      product_url TEXT,
      evidence TEXT NOT NULL,
      inferred_action TEXT NOT NULL,
      suggested_response TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(insight_date, source_type, source_id, category, asin, insight_type)
    );
    CREATE INDEX IF NOT EXISTS idx_action_insight_date ON amazon_competitor_action_insight(insight_date, source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_action_insight_asin ON amazon_competitor_action_insight(asin, insight_date);
    CREATE INDEX IF NOT EXISTS idx_action_insight_type ON amazon_competitor_action_insight(insight_type, confidence);

    CREATE TABLE IF NOT EXISTS amazon_keyword_serp_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword_id INTEGER NOT NULL,
      keyword TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,
      page_no INTEGER,
      position_in_page INTEGER,
      absolute_rank INTEGER,
      organic_rank INTEGER,
      sponsored_rank INTEGER,
      asin TEXT,
      title TEXT,
      brand TEXT,
      image_url TEXT,
      product_url TEXT,
      current_price REAL,
      original_price REAL,
      coupon_text TEXT,
      coupon_value REAL,
      coupon_rate REAL,
      final_estimated_price REAL,
      currency TEXT,
      rating REAL,
      review_count INTEGER,
      is_sponsored INTEGER DEFAULT 0,
      is_prime INTEGER DEFAULT 0,
      deal_badge TEXT,
      delivery_text TEXT,
      bsr_rank INTEGER,
      bsr_category TEXT,
      bsr_text TEXT,
      bestseller_ranks_json TEXT,
      detail_collected_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_keyword_date ON amazon_keyword_serp_snapshot(keyword_id, snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_asin_date ON amazon_keyword_serp_snapshot(asin, snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_keyword_activity_calendar ON amazon_keyword_serp_snapshot(asin, marketplace, snapshot_date, absolute_rank);
    CREATE INDEX IF NOT EXISTS idx_keyword_competitor_lookup ON amazon_keyword_serp_snapshot(asin, marketplace, keyword_id, keyword);
    CREATE INDEX IF NOT EXISTS idx_keyword_rank ON amazon_keyword_serp_snapshot(keyword_id, absolute_rank);

    CREATE TABLE IF NOT EXISTS amazon_competitor_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asin TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      title TEXT,
      brand TEXT,
      image_url TEXT,
      first_seen_keyword TEXT,
      first_seen_date TEXT,
      last_seen_date TEXT,
      appear_keyword_count INTEGER DEFAULT 0,
      best_rank INTEGER,
      latest_rank INTEGER,
      lowest_price REAL,
      latest_price REAL,
      latest_product_url TEXT,
      latest_bsr_rank INTEGER,
      latest_bsr_category TEXT,
      latest_bsr_text TEXT,
      latest_bestseller_ranks_json TEXT,
      source_type TEXT DEFAULT 'keyword',
      first_seen_source TEXT,
      latest_category_name TEXT,
      latest_category_rank INTEGER,
      competitor_tier TEXT DEFAULT 'watch',
      competitor_reasons_json TEXT,
      is_key_competitor INTEGER DEFAULT 0,
      status INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(asin, marketplace)
    );
    CREATE INDEX IF NOT EXISTS idx_competitor_pool_source_tier ON amazon_competitor_pool(source_type, competitor_tier, latest_category_rank);
    CREATE INDEX IF NOT EXISTS idx_competitor_pool_rank ON amazon_competitor_pool(status, is_key_competitor, latest_category_rank, latest_bsr_rank, latest_rank);

    CREATE TABLE IF NOT EXISTS amazon_competitor_daily_change (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asin TEXT NOT NULL,
      keyword TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,
      yesterday_rank INTEGER,
      today_rank INTEGER,
      rank_change INTEGER,
      yesterday_price REAL,
      today_price REAL,
      price_change REAL,
      price_change_rate REAL,
      yesterday_sponsored INTEGER,
      today_sponsored INTEGER,
      change_type TEXT,
      title TEXT,
      brand TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_asin_keyword_date ON amazon_competitor_daily_change(asin, keyword, snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_daily_change_activity_calendar ON amazon_competitor_daily_change(asin, marketplace, snapshot_date);

    CREATE TABLE IF NOT EXISTS amazon_alert_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_date TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      alert_level TEXT,
      keyword TEXT,
      asin TEXT,
      title TEXT,
      brand TEXT,
      alert_content TEXT,
      old_value TEXT,
      new_value TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_alert_date ON amazon_alert_log(alert_date);
    CREATE INDEX IF NOT EXISTS idx_alert_asin ON amazon_alert_log(asin);
    CREATE INDEX IF NOT EXISTS idx_alert_type ON amazon_alert_log(alert_type);

    CREATE TABLE IF NOT EXISTS amazon_collect_task_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_type TEXT,
      keyword_id INTEGER,
      keyword TEXT,
      marketplace TEXT,
      status TEXT,
      start_time TEXT,
      end_time TEXT,
      page_count INTEGER,
      success_count INTEGER,
      fail_count INTEGER,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS amazon_daily_report (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_date TEXT NOT NULL,
      keyword TEXT NOT NULL,
      markdown TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(report_date, keyword)
    );

    CREATE TABLE IF NOT EXISTS amazon_category_daily_report (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_date TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      markdown TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(report_date, category_id)
    );

    CREATE TABLE IF NOT EXISTS amazon_notification_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      channel TEXT NOT NULL,
      target TEXT NOT NULL,
      send_time TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      status TEXT NOT NULL DEFAULT 'enabled',
      last_sent_at TEXT,
      last_sent_date TEXT,
      last_status TEXT,
      last_error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_notification_schedule_due ON amazon_notification_schedule(status, send_time);

    CREATE TABLE IF NOT EXISTS amazon_notification_send_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL,
      schedule_name TEXT NOT NULL,
      channel TEXT NOT NULL,
      target TEXT NOT NULL,
      report_date TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      error_message TEXT,
      sent_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_notification_send_log_schedule ON amazon_notification_send_log(schedule_id, report_date);

    CREATE TABLE IF NOT EXISTS amazon_schema_metadata (
      metadata_key TEXT PRIMARY KEY,
      metadata_value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  ensureColumn(db, "amazon_keyword_serp_snapshot", "bsr_rank", "INTEGER");
  ensureColumn(db, "amazon_keyword_serp_snapshot", "bsr_category", "TEXT");
  ensureColumn(db, "amazon_keyword_serp_snapshot", "bsr_text", "TEXT");
  ensureColumn(db, "amazon_keyword_serp_snapshot", "bestseller_ranks_json", "TEXT");
  ensureColumn(db, "amazon_keyword_serp_snapshot", "detail_collected_at", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "latest_product_url", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "latest_bsr_rank", "INTEGER");
  ensureColumn(db, "amazon_competitor_pool", "latest_bsr_category", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "latest_bsr_text", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "latest_bestseller_ranks_json", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "source_type", "TEXT DEFAULT 'keyword'");
  ensureColumn(db, "amazon_competitor_pool", "first_seen_source", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "latest_category_name", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "latest_category_rank", "INTEGER");
  ensureColumn(db, "amazon_competitor_pool", "competitor_tier", "TEXT DEFAULT 'watch'");
  ensureColumn(db, "amazon_competitor_pool", "competitor_reasons_json", "TEXT");
  ensureColumn(db, "amazon_competitor_action_insight", "previous_date", "TEXT");
  ensureColumn(db, "amazon_bsr_snapshot_quality", "unique_rank_count", "INTEGER DEFAULT 0");
  dedupeActionInsightTargets(db);
  ensureActionInsightTargetIndex(db);
  backfillBsrRankHistory(db);
  backfillBsrSnapshotQuality(db);
  pruneLowQualityCategoryActionInsights(db);
  backfillCompetitorActionInsights(db);
  runStoreMigrationOnce(db, "refresh_category_action_insights_quality_rules_v2", () => refreshCategoryActionInsightsForQualityRules(db));
  runStoreMigrationOnce(db, "refresh_action_insight_traceability_previous_date_v1", () => refreshActionInsightsForTraceability(db));
  runStoreMigrationOnce(db, "refresh_bsr_quality_unique_rank_coverage_v1", () => {
    refreshBsrSnapshotQuality(db);
    pruneLowQualityCategoryActionInsights(db);
    refreshCategoryActionInsightsForQualityRules(db);
  });
  runStoreMigrationOnce(db, "refresh_bsr_quality_unique_rank_count_column_v1", () => {
    refreshBsrSnapshotQuality(db);
  });
  runStoreMigrationOnce(db, "refresh_bsr_quality_rank_issue_details_v1", () => {
    refreshBsrSnapshotQuality(db);
  });
  runStoreMigrationOnce(db, "refresh_bsr_quality_rank_issue_details_v2", () => {
    refreshBsrSnapshotQuality(db);
  });
}

export function createStore(db: DatabaseSync): Store {
  return {
    reset() {
      db.exec(`
        DELETE FROM amazon_category_daily_report;
        DELETE FROM amazon_daily_report;
        DELETE FROM amazon_notification_send_log;
        DELETE FROM amazon_notification_schedule;
        DELETE FROM amazon_competitor_action_insight;
        DELETE FROM amazon_competitor_activity_event;
        DELETE FROM amazon_competitor_signal_log;
        DELETE FROM amazon_bsr_snapshot_quality;
        DELETE FROM amazon_bsr_rank_history;
        DELETE FROM amazon_product_price_history;
        DELETE FROM amazon_brand_matrix_snapshot;
        DELETE FROM amazon_product_master;
        DELETE FROM amazon_bestseller_rank_snapshot;
        DELETE FROM amazon_bestseller_category_monitor;
        DELETE FROM amazon_collect_task_log;
        DELETE FROM amazon_alert_log;
        DELETE FROM amazon_competitor_daily_change;
        DELETE FROM amazon_competitor_pool;
        DELETE FROM amazon_keyword_serp_snapshot;
        DELETE FROM amazon_keyword_monitor;
      `);
    },

    createKeyword(input) {
      const now = nowIso();
      const result = db
        .prepare(
          `INSERT INTO amazon_keyword_monitor
          (keyword, marketplace, zip_code, language, category_tag, crawl_pages, status, today_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
        )
        .run(
          input.keyword,
          input.marketplace,
          input.zipCode ?? null,
          input.language ?? "en_US",
          input.categoryTag ?? null,
          input.crawlPages ?? 3,
          input.status === "disabled" ? 0 : 1,
          now,
          now
        );
      return this.getKeyword(Number(result.lastInsertRowid))!;
    },

    updateKeyword(id, input) {
      const current = this.getKeyword(id);
      if (!current) {
        throw new Error(`Keyword ${id} not found`);
      }
      const next = {
        keyword: input.keyword ?? current.keyword,
        marketplace: input.marketplace ?? current.marketplace,
        zipCode: input.zipCode ?? current.zipCode,
        language: input.language ?? current.language,
        categoryTag: input.categoryTag ?? current.categoryTag,
        crawlPages: input.crawlPages ?? current.crawlPages,
        status: input.status ?? current.status
      };
      db.prepare(
        `UPDATE amazon_keyword_monitor
         SET keyword = ?, marketplace = ?, zip_code = ?, language = ?, category_tag = ?, crawl_pages = ?, status = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        next.keyword,
        next.marketplace,
        next.zipCode,
        next.language,
        next.categoryTag,
        next.crawlPages,
        next.status === "enabled" ? 1 : 0,
        nowIso(),
        id
      );
      return this.getKeyword(id)!;
    },

    markKeywordCollection(id, status) {
      db.prepare("UPDATE amazon_keyword_monitor SET today_status = ?, last_collected_at = ?, updated_at = ? WHERE id = ?").run(
        status,
        nowIso(),
        nowIso(),
        id
      );
    },

    deleteKeyword(id) {
      db.prepare("DELETE FROM amazon_keyword_monitor WHERE id = ?").run(id);
    },

    getKeyword(id) {
      const row = db.prepare("SELECT * FROM amazon_keyword_monitor WHERE id = ?").get(id) as KeywordRow | undefined;
      return row ? mapKeyword(row) : null;
    },

    listKeywords() {
      return (db.prepare("SELECT * FROM amazon_keyword_monitor ORDER BY id").all() as unknown as KeywordRow[]).map(mapKeyword);
    },

    createCategoryMonitor(input) {
      validateCategoryInput(input);
      const now = nowIso();
      const result = db
        .prepare(
          `INSERT INTO amazon_bestseller_category_monitor
          (name, marketplace, category_url, category_path, crawl_top_n, status, today_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
        )
        .run(
          input.name.trim(),
          input.marketplace.trim(),
          input.categoryUrl.trim(),
          input.categoryPath?.trim() || null,
          normalizeTopN(input.crawlTopN),
          input.status === "disabled" ? 0 : 1,
          now,
          now
        );
      return this.getCategoryMonitor(Number(result.lastInsertRowid))!;
    },

    updateCategoryMonitor(id, input) {
      const current = this.getCategoryMonitor(id);
      if (!current) {
        throw new Error(`Category monitor ${id} not found`);
      }
      const next: CategoryMonitorInput = {
        name: input.name ?? current.name,
        marketplace: input.marketplace ?? current.marketplace,
        categoryUrl: input.categoryUrl ?? current.categoryUrl,
        categoryPath: input.categoryPath ?? current.categoryPath,
        crawlTopN: input.crawlTopN ?? current.crawlTopN,
        status: input.status ?? current.status
      };
      validateCategoryInput(next);
      db.prepare(
        `UPDATE amazon_bestseller_category_monitor
         SET name = ?, marketplace = ?, category_url = ?, category_path = ?, crawl_top_n = ?, status = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        next.name.trim(),
        next.marketplace.trim(),
        next.categoryUrl.trim(),
        next.categoryPath?.trim() || null,
        normalizeTopN(next.crawlTopN),
        next.status === "disabled" ? 0 : 1,
        nowIso(),
        id
      );
      return this.getCategoryMonitor(id)!;
    },

    markCategoryCollection(id, status) {
      db.prepare("UPDATE amazon_bestseller_category_monitor SET today_status = ?, last_collected_at = ?, updated_at = ? WHERE id = ?").run(
        status,
        nowIso(),
        nowIso(),
        id
      );
    },

    deleteCategoryMonitor(id) {
      db.prepare("DELETE FROM amazon_bestseller_category_monitor WHERE id = ?").run(id);
    },

    getCategoryMonitor(id) {
      const row = db.prepare("SELECT * FROM amazon_bestseller_category_monitor WHERE id = ?").get(id) as CategoryMonitorRow | undefined;
      return row ? mapCategoryMonitor(row) : null;
    },

    listCategoryMonitors() {
      return (db.prepare("SELECT * FROM amazon_bestseller_category_monitor ORDER BY id").all() as unknown as CategoryMonitorRow[]).map(
        mapCategoryMonitor
      );
    },

    deleteCategorySnapshotsForDate(categoryId, date) {
      withTransaction(db, () => {
        db.prepare("DELETE FROM amazon_bestseller_rank_snapshot WHERE category_id = ? AND snapshot_date = ?").run(categoryId, date);
        db.prepare("DELETE FROM amazon_bsr_rank_history WHERE source_type = 'category_bestseller' AND source_id = ? AND snapshot_date = ?").run(
          categoryId,
          date
        );
        db.prepare("DELETE FROM amazon_bsr_snapshot_quality WHERE source_type = 'category_bestseller' AND source_id = ? AND snapshot_date = ?").run(
          categoryId,
          date
        );
        db.prepare("DELETE FROM amazon_product_price_history WHERE category_id = ? AND snapshot_date = ?").run(categoryId, date);
        db.prepare("DELETE FROM amazon_brand_matrix_snapshot WHERE category_id = ? AND snapshot_date = ?").run(categoryId, date);
        db.prepare("DELETE FROM amazon_competitor_signal_log WHERE source_type = 'category' AND category_id = ? AND signal_date = ?").run(
          categoryId,
          date
        );
        db.prepare("DELETE FROM amazon_competitor_activity_event WHERE category_id = ? AND event_date = ?").run(categoryId, date);
        db.prepare("DELETE FROM amazon_competitor_action_insight WHERE source_type = 'category_bestseller' AND source_id = ? AND insight_date = ?").run(
          categoryId,
          date
        );
        db.prepare("DELETE FROM amazon_category_daily_report WHERE category_id = ? AND report_date = ?").run(categoryId, date);
      });
    },

    insertCategorySnapshots(items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_bestseller_rank_snapshot
        (category_id, category_name, marketplace, snapshot_date, rank_no, asin, title, brand, image_url, product_url,
         current_price, original_price, coupon_text, coupon_value, coupon_rate, final_estimated_price, currency,
         rating, review_count, is_prime, deal_badge, bsr_rank, bsr_category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      withTransaction(db, () => {
        for (const item of items) {
          stmt.run(
            item.categoryId,
            item.categoryName,
            item.marketplace,
            item.snapshotDate,
            item.rank,
            item.asin,
            item.title,
            item.brand,
            item.imageUrl,
            item.productUrl,
            item.currentPrice,
            item.originalPrice ?? null,
            item.couponText,
            item.couponValue,
            item.couponRate,
            item.finalEstimatedPrice,
            item.currency,
            item.rating,
            item.reviewCount,
            item.isPrime ? 1 : 0,
            item.dealBadge,
            item.bsrRank,
            item.bsrCategory
          );
        }
      });
    },

    listCategorySnapshots(filter = {}) {
      const { sql: where, params } = buildWhere(whereEq("snapshot_date", filter.date), whereEq("category_id", filter.categoryId), whereEq("asin", filter.asin));
      const limit = filter.limit ? `LIMIT ${Number(filter.limit)}` : "";
      return (
        db.prepare(`SELECT * FROM amazon_bestseller_rank_snapshot ${where} ORDER BY snapshot_date DESC, category_id, rank_no ${limit}`).all(
          ...params
        ) as unknown as BestsellerSnapshotRow[]
      ).map(mapBestsellerSnapshot);
    },

    getPreviousCategorySnapshots(categoryId, beforeDate) {
      const row = db
        .prepare(
          `SELECT snapshot_date FROM amazon_bestseller_rank_snapshot
           WHERE category_id = ? AND snapshot_date < ?
           GROUP BY snapshot_date
           ORDER BY snapshot_date DESC
           LIMIT 1`
        )
        .get(categoryId, beforeDate) as { snapshot_date: string } | undefined;
      return row ? this.listCategorySnapshots({ categoryId, date: row.snapshot_date }) : [];
    },

    upsertProductMasterFromCategorySnapshots(items) {
      const unique = new Map<string, BestsellerRankSnapshot>();
      for (const item of items) {
        unique.set(`${item.marketplace}:${item.asin}`, item);
      }
      const stmt = db.prepare(
        `INSERT INTO amazon_product_master
         (asin, marketplace, title, brand, image_url, product_url, first_seen_date, first_seen_category,
          last_seen_date, latest_category_name, latest_rank, latest_price, rating, review_count, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(asin, marketplace) DO UPDATE SET
          title = excluded.title,
          brand = COALESCE(excluded.brand, amazon_product_master.brand),
          image_url = excluded.image_url,
          product_url = excluded.product_url,
          last_seen_date = excluded.last_seen_date,
          latest_category_name = excluded.latest_category_name,
          latest_rank = excluded.latest_rank,
          latest_price = excluded.latest_price,
          rating = excluded.rating,
          review_count = excluded.review_count,
          updated_at = excluded.updated_at`
      );
      withTransaction(db, () => {
        for (const item of unique.values()) {
          stmt.run(
            item.asin,
            item.marketplace,
            item.title,
            item.brand,
            item.imageUrl,
            item.productUrl,
            item.snapshotDate,
            item.categoryName,
            item.snapshotDate,
            item.categoryName,
            item.rank,
            item.currentPrice,
            item.rating,
            item.reviewCount,
            nowIso()
          );
        }
      });
    },

    upsertCompetitorsFromCategorySnapshots(items, activityEvents = []) {
      const unique = new Map<string, BestsellerRankSnapshot>();
      for (const item of items) {
        unique.set(`${item.marketplace}:${item.asin}`, item);
      }
      const eventsByAsin = new Map<string, CompetitorActivityEvent[]>();
      for (const event of activityEvents) {
        if (!event.asin) {
          continue;
        }
        const key = `${event.marketplace}:${event.asin}`;
        const events = eventsByAsin.get(key);
        if (events) {
          events.push(event);
        } else {
          eventsByAsin.set(key, [event]);
        }
      }
      const keywordCounts = keywordCountsByAsinMarketplace(db, unique.values());
      const stmt = db.prepare(
        `INSERT INTO amazon_competitor_pool
         (asin, marketplace, title, brand, image_url, first_seen_keyword, first_seen_date, last_seen_date,
          appear_keyword_count, best_rank, latest_rank, lowest_price, latest_price, latest_product_url,
          latest_bsr_rank, latest_bsr_category, latest_bsr_text, latest_bestseller_ranks_json,
          source_type, first_seen_source, latest_category_name, latest_category_rank, competitor_tier, competitor_reasons_json,
          is_key_competitor, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'category', ?, ?, ?, ?, ?, 0, 1, ?)
         ON CONFLICT(asin, marketplace) DO UPDATE SET
          title = excluded.title,
          brand = COALESCE(excluded.brand, amazon_competitor_pool.brand),
          image_url = excluded.image_url,
          last_seen_date = excluded.last_seen_date,
          appear_keyword_count = excluded.appear_keyword_count,
          best_rank = CASE
            WHEN amazon_competitor_pool.best_rank IS NULL THEN excluded.best_rank
            WHEN excluded.best_rank IS NULL THEN amazon_competitor_pool.best_rank
            ELSE MIN(amazon_competitor_pool.best_rank, excluded.best_rank)
          END,
          latest_rank = CASE
            WHEN amazon_competitor_pool.source_type IN ('category', 'hybrid') THEN excluded.latest_rank
            ELSE amazon_competitor_pool.latest_rank
          END,
          lowest_price = CASE
            WHEN amazon_competitor_pool.lowest_price IS NULL THEN excluded.lowest_price
            WHEN excluded.lowest_price IS NULL THEN amazon_competitor_pool.lowest_price
            ELSE MIN(amazon_competitor_pool.lowest_price, excluded.lowest_price)
          END,
          latest_price = excluded.latest_price,
          latest_product_url = excluded.latest_product_url,
          latest_bsr_rank = excluded.latest_bsr_rank,
          latest_bsr_category = excluded.latest_bsr_category,
          source_type = CASE
            WHEN amazon_competitor_pool.source_type = 'keyword' THEN 'hybrid'
            WHEN amazon_competitor_pool.source_type = 'hybrid' THEN 'hybrid'
            ELSE 'category'
          END,
          first_seen_source = COALESCE(amazon_competitor_pool.first_seen_source, excluded.first_seen_source),
          latest_category_name = excluded.latest_category_name,
          latest_category_rank = excluded.latest_category_rank,
          competitor_tier = CASE
            WHEN amazon_competitor_pool.competitor_tier = 'core' OR excluded.competitor_tier = 'core' THEN 'core'
            WHEN amazon_competitor_pool.competitor_tier = 'rising' OR excluded.competitor_tier = 'rising' THEN 'rising'
            WHEN amazon_competitor_pool.competitor_tier = 'activity' OR excluded.competitor_tier = 'activity' THEN 'activity'
            ELSE 'watch'
          END,
          competitor_reasons_json = excluded.competitor_reasons_json,
          updated_at = excluded.updated_at`
      );
      withTransaction(db, () => {
        for (const item of unique.values()) {
          const events = eventsByAsin.get(`${item.marketplace}:${item.asin}`) ?? [];
          const tier = categoryCompetitorTier(item, events);
          stmt.run(
            item.asin,
            item.marketplace,
            item.title,
            item.brand,
            item.imageUrl,
            `[Category] ${item.categoryName}`,
            item.snapshotDate,
            item.snapshotDate,
            keywordCounts.get(`${item.marketplace}:${item.asin}`) ?? 0,
            item.rank,
            item.rank,
            item.currentPrice,
            item.currentPrice,
            item.productUrl,
            item.bsrRank,
            item.bsrCategory,
            null,
            JSON.stringify([{ rank: item.bsrRank ?? item.rank, category: item.bsrCategory ?? item.categoryName, url: null }]),
            `category:${item.categoryName}`,
            item.categoryName,
            item.rank,
            tier,
            JSON.stringify(categoryCompetitorReasons(item, events)),
            nowIso()
          );
        }
      });
    },

    replaceBrandMatrix(categoryId, date, items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_brand_matrix_snapshot
         (category_id, category_name, marketplace, snapshot_date, brand, product_count_top100, product_count_top50,
          product_count_top20, best_rank, average_rank, new_entry_count, dropped_count, rank_up_count,
          rank_down_count, price_down_count, coupon_count, deal_count, top_asins_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      withTransaction(db, () => {
        db.prepare("DELETE FROM amazon_brand_matrix_snapshot WHERE category_id = ? AND snapshot_date = ?").run(categoryId, date);
        for (const item of items) {
          stmt.run(
            item.categoryId,
            item.categoryName,
            item.marketplace,
            item.snapshotDate,
            item.brand,
            item.productCountTop100,
            item.productCountTop50,
            item.productCountTop20,
            item.bestRank,
            item.averageRank,
            item.newEntryCount,
            item.droppedCount,
            item.rankUpCount,
            item.rankDownCount,
            item.priceDownCount,
            item.couponCount,
            item.dealCount,
            JSON.stringify(item.topAsins)
          );
        }
      });
    },

    listBrandMatrix(filter = {}) {
      const { sql: where, params } = buildWhere(whereEq("snapshot_date", filter.date), whereEq("category_id", filter.categoryId));
      return (
        db
          .prepare(
            `SELECT * FROM amazon_brand_matrix_snapshot ${where}
             ORDER BY product_count_top20 DESC, product_count_top50 DESC, product_count_top100 DESC, COALESCE(best_rank, 9999) ASC`
          )
          .all(...params) as unknown as BrandMatrixRow[]
      ).map(mapBrandMatrix);
    },

    replaceCategorySignals(categoryId, date, items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_competitor_signal_log
         (signal_date, source_type, category_id, category_name, marketplace, signal_type, alert_level, asin, brand,
          title, rank_no, previous_rank, price, previous_price, content)
         VALUES (?, 'category', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      withTransaction(db, () => {
        db.prepare("DELETE FROM amazon_competitor_signal_log WHERE source_type = 'category' AND category_id = ? AND signal_date = ?").run(categoryId, date);
        for (const item of items) {
          stmt.run(
            item.signalDate,
            item.categoryId,
            item.categoryName,
            item.marketplace,
            item.signalType,
            item.alertLevel,
            item.asin,
            item.brand,
            item.title,
            item.rank,
            item.previousRank,
            item.price,
            item.previousPrice,
            item.content
          );
        }
      });
    },

    listCategorySignals(filter = {}) {
      const { sql: where, params } = buildWhere(
        { clause: "source_type = 'category'" },
        whereEq("signal_date", filter.date),
        whereEq("category_id", filter.categoryId)
      );
      const limit = filter.limit ? `LIMIT ${Number(filter.limit)}` : "";
      return (
        db
          .prepare(
            `SELECT * FROM amazon_competitor_signal_log
             ${where}
             ORDER BY
              CASE alert_level WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
              COALESCE(rank_no, 9999) ASC,
              id ASC
             ${limit}`
          )
          .all(...params) as unknown as CategorySignalRow[]
      ).map(mapCategorySignal);
    },

    replaceProductPriceHistoryForDate(categoryId, date, items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_product_price_history
         (snapshot_date, category_id, category_name, marketplace, asin, brand, title, current_price,
          coupon_value, coupon_rate, final_estimated_price, t30_low_price, t60_low_price, t90_low_price, monitoring_low_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(snapshot_date, category_id, asin, marketplace) DO UPDATE SET
          category_name = excluded.category_name,
          brand = excluded.brand,
          title = excluded.title,
          current_price = excluded.current_price,
          coupon_value = excluded.coupon_value,
          coupon_rate = excluded.coupon_rate,
          final_estimated_price = excluded.final_estimated_price,
          t30_low_price = excluded.t30_low_price,
          t60_low_price = excluded.t60_low_price,
          t90_low_price = excluded.t90_low_price,
          monitoring_low_price = excluded.monitoring_low_price`
      );
      withTransaction(db, () => {
        db.prepare("DELETE FROM amazon_product_price_history WHERE category_id = ? AND snapshot_date = ?").run(categoryId, date);
        for (const item of items) {
          stmt.run(
            item.snapshotDate,
            item.categoryId,
            item.categoryName,
            item.marketplace,
            item.asin,
            item.brand,
            item.title,
            item.currentPrice,
            item.couponValue,
            item.couponRate,
            item.finalEstimatedPrice,
            categoryPriceLow(db, item, 30),
            categoryPriceLow(db, item, 60),
            categoryPriceLow(db, item, 90),
            categoryPriceLow(db, item, null)
          );
        }
      });
    },

    listProductPriceHistory(filter = {}) {
      const { sql: where, params } = buildWhere(
        whereEq("snapshot_date", filter.date),
        whereEq("category_id", filter.categoryId),
        whereEq("asin", filter.asin),
        whereEq("marketplace", filter.marketplace)
      );
      const limit = filter.limit ? `LIMIT ${Number(filter.limit)}` : "";
      return (
        db
          .prepare(
            `SELECT * FROM amazon_product_price_history ${where}
             ORDER BY snapshot_date DESC, category_id, current_price IS NULL, COALESCE(t30_low_price, current_price) ASC, asin
             ${limit}`
          )
          .all(...params) as unknown as ProductPriceHistoryRow[]
      ).map(mapProductPriceHistory);
    },

    replaceCategoryActivityEvents(categoryId, date, items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_competitor_activity_event
         (event_key, event_date, event_type, event_level, category_id, category_name, marketplace, asin, brand,
          title, price_before, price_after, price_change_rate, coupon_before, coupon_after, deal_type,
          rank_before, rank_after, rank_change, keyword_rank_before, keyword_rank_after, event_summary,
          possible_strategy, suggested_action)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(event_date, category_id, event_key) DO UPDATE SET
          event_type = excluded.event_type,
          event_level = excluded.event_level,
          category_name = excluded.category_name,
          marketplace = excluded.marketplace,
          asin = excluded.asin,
          brand = excluded.brand,
          title = excluded.title,
          price_before = excluded.price_before,
          price_after = excluded.price_after,
          price_change_rate = excluded.price_change_rate,
          coupon_before = excluded.coupon_before,
          coupon_after = excluded.coupon_after,
          deal_type = excluded.deal_type,
          rank_before = excluded.rank_before,
          rank_after = excluded.rank_after,
          rank_change = excluded.rank_change,
          keyword_rank_before = excluded.keyword_rank_before,
          keyword_rank_after = excluded.keyword_rank_after,
          event_summary = excluded.event_summary,
          possible_strategy = excluded.possible_strategy,
          suggested_action = excluded.suggested_action`
      );
      withTransaction(db, () => {
        db.prepare("DELETE FROM amazon_competitor_activity_event WHERE category_id = ? AND event_date = ?").run(categoryId, date);
        for (const item of items) {
          stmt.run(
            item.eventKey,
            item.eventDate,
            item.eventType,
            item.eventLevel,
            item.categoryId,
            item.categoryName,
            item.marketplace,
            item.asin,
            item.brand,
            item.title,
            item.priceBefore,
            item.priceAfter,
            item.priceChangeRate,
            item.couponBefore,
            item.couponAfter,
            item.dealType,
            item.rankBefore,
            item.rankAfter,
            item.rankChange,
            item.keywordRankBefore,
            item.keywordRankAfter,
            item.eventSummary,
            item.possibleStrategy,
            item.suggestedAction
          );
        }
      });
    },

    listCategoryActivityEvents(filter = {}) {
      const { sql: where, params } = buildWhere(
        whereEq("event_date", filter.date),
        whereEq("category_id", filter.categoryId),
        whereEq("asin", filter.asin),
        whereEq("brand", filter.brand),
        whereEq("event_type", filter.eventType)
      );
      const limit = filter.limit ? `LIMIT ${Number(filter.limit)}` : "";
      return (
        db
          .prepare(
            `SELECT * FROM amazon_competitor_activity_event ${where}
             ORDER BY event_date DESC,
              CASE event_level WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
              COALESCE(rank_after, 999999) ASC,
              event_type,
              COALESCE(asin, brand, '')
             ${limit}`
          )
          .all(...params) as unknown as ActivityEventRow[]
      ).map(mapActivityEvent);
    },

    saveCategoryReport(date, categoryId, markdown) {
      db.prepare(
        `INSERT INTO amazon_category_daily_report (report_date, category_id, markdown, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(report_date, category_id) DO UPDATE SET markdown = excluded.markdown, updated_at = excluded.updated_at`
      ).run(date, categoryId, markdown, nowIso());
    },

    getCategoryReport(date, categoryId) {
      if (categoryId) {
        const row = db
          .prepare("SELECT markdown FROM amazon_category_daily_report WHERE report_date = ? AND category_id = ?")
          .get(date, categoryId) as { markdown: string } | undefined;
        return row?.markdown ?? "";
      }
      const rows = db.prepare("SELECT markdown FROM amazon_category_daily_report WHERE report_date = ? ORDER BY category_id").all(date) as {
        markdown: string;
      }[];
      return rows.map((row) => row.markdown).join("\n\n---\n\n");
    },

    getCategoryProductLink(asin, categoryId) {
      const params: SQLInputValue[] = [asin];
      const categoryClause = categoryId ? "AND category_id = ?" : "";
      if (categoryId) {
        params.push(categoryId);
      }
      const snapshot = db
        .prepare(
          `SELECT asin, marketplace, product_url FROM amazon_bestseller_rank_snapshot
           WHERE asin = ? ${categoryClause}
           ORDER BY snapshot_date DESC, rank_no ASC
           LIMIT 1`
        )
        .get(...params) as { asin: string; marketplace: string; product_url: string | null } | undefined;
      if (snapshot?.product_url) {
        return { asin: snapshot.asin, marketplace: snapshot.marketplace, url: snapshot.product_url };
      }
      const master = db.prepare("SELECT asin, marketplace, product_url FROM amazon_product_master WHERE asin = ? LIMIT 1").get(asin) as
        | { asin: string; marketplace: string; product_url: string | null }
        | undefined;
      return master?.product_url ? { asin: master.asin, marketplace: master.marketplace, url: master.product_url } : null;
    },

    replaceBsrRankHistoryForDate(input) {
      const stmt = db.prepare(
        `INSERT INTO amazon_bsr_rank_history
         (snapshot_date, source_type, source_id, source_name, marketplace, asin, title, brand, category,
          rank_no, rank_url, product_url, current_price, parent_rank, is_specific_rank)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(snapshot_date, source_type, source_id, asin, category) DO UPDATE SET
          source_name = excluded.source_name,
          marketplace = excluded.marketplace,
          title = excluded.title,
          brand = excluded.brand,
          rank_no = excluded.rank_no,
          rank_url = excluded.rank_url,
          product_url = excluded.product_url,
          current_price = excluded.current_price,
          parent_rank = excluded.parent_rank,
          is_specific_rank = excluded.is_specific_rank`
      );
      withTransaction(db, () => {
        db.prepare("DELETE FROM amazon_bsr_rank_history WHERE source_type = ? AND source_id = ? AND snapshot_date = ?").run(
          input.sourceType,
          input.sourceId,
          input.date
        );
        for (const item of input.items) {
          stmt.run(
            item.snapshotDate,
            item.sourceType,
            item.sourceId,
            item.sourceName,
            item.marketplace,
            item.asin,
            item.title,
            item.brand,
            item.category,
            item.rank,
            item.rankUrl,
            item.productUrl,
            item.currentPrice,
            item.parentRank,
            item.isSpecificRank ? 1 : 0
          );
        }
        upsertBsrSnapshotQualityForScope(db, input.sourceType, input.sourceId, input.date);
      });
    },

    listBsrRankHistory(filter = {}) {
      const { sql: where, params } = buildWhere(
        whereEq("snapshot_date", filter.date),
        whereEq("source_type", filter.sourceType),
        whereEq("source_id", filter.sourceId),
        whereEq("category", filter.category),
        whereEq("asin", filter.asin)
      );
      const limit = filter.limit ? `LIMIT ${Number(filter.limit)}` : "";
      return (
        db
          .prepare(
            `SELECT * FROM amazon_bsr_rank_history ${where}
             ORDER BY snapshot_date DESC, source_type, source_id, category, rank_no
             ${limit}`
          )
          .all(...params) as unknown as BsrRankHistoryRow[]
      ).map(mapBsrRankHistory);
    },

    listBsrRankChanges(filter) {
      const today = listUsableBsrRankHistoryRows(db, {
        date: filter.date,
        sourceType: filter.sourceType,
        sourceId: filter.sourceId,
        category: filter.category
      });
      if (today.length === 0) {
        return [];
      }
      const changes = Array.from(groupBsrHistoryByScope(today).values()).flatMap((currentScopeItems) => {
        const scope = currentScopeItems[0];
        const scopeFilter = {
          sourceType: scope.sourceType,
          sourceId: scope.sourceId ?? undefined,
          category: scope.category
        };
        const previousDate = previousUsableBsrDate(db, {
          beforeDate: filter.date,
          ...scopeFilter
        });
        if (
          !previousDate &&
          hasEarlierBsrHistory(db, {
            beforeDate: filter.date,
            ...scopeFilter
          })
        ) {
          return [];
        }
        const yesterday = previousDate ? listUsableBsrRankHistoryRows(db, { date: previousDate, ...scopeFilter }) : [];
        return buildBsrRankChanges(filter.date, previousDate, currentScopeItems, yesterday);
      });
      changes.sort(compareBsrRankChanges);
      const visibleChanges = filter.includeUnchanged === false ? changes.filter((item) => item.changeType !== "unchanged") : changes;
      return filter.limit ? visibleChanges.slice(0, filter.limit) : visibleChanges;
    },

    listBsrSnapshotQuality(filter = {}) {
      const { sql: where, params } = buildWhere(
        whereEq("snapshot_date", filter.date),
        whereEq("source_type", filter.sourceType),
        whereEq("source_id", filter.sourceId),
        whereEq("category", filter.category),
        whereEq("quality_status", filter.qualityStatus)
      );
      const limit = filter.limit ? `LIMIT ${Number(filter.limit)}` : "";
      return (
        db
          .prepare(
            `SELECT * FROM amazon_bsr_snapshot_quality ${where}
             ORDER BY snapshot_date DESC,
              CASE quality_status WHEN 'partial' THEN 1 WHEN 'empty' THEN 2 ELSE 3 END,
              source_type,
              source_id,
              category
             ${limit}`
          )
          .all(...params) as unknown as BsrSnapshotQualityRow[]
      ).map(mapBsrSnapshotQuality);
    },

    recordBsrSnapshotQuality(input) {
      upsertBsrSnapshotQuality(db, input, { preserveExistingOk: true });
    },

    replaceCompetitorActionInsights(input) {
      replaceCompetitorActionInsightsForScope(db, input);
    },

    listCompetitorActionInsights(filter = {}) {
      const { sql: where, params } = buildWhere(
        whereEq("insight_date", filter.date),
        whereEq("source_type", filter.sourceType),
        whereEq("source_id", filter.sourceId),
        whereEq("category", filter.category),
        whereEq("asin", filter.asin),
        whereEq("brand", filter.brand),
        whereEq("insight_type", filter.insightType)
      );
      const limit = filter.limit ? `LIMIT ${Number(filter.limit)}` : "";
      return (
        db
          .prepare(
            `SELECT * FROM amazon_competitor_action_insight ${where}
             ORDER BY insight_date DESC,
              CASE confidence WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
              COALESCE(current_rank, previous_rank, 999999) ASC,
              insight_type,
              COALESCE(asin, brand, '')
             ${limit}`
          )
          .all(...params) as unknown as ActionInsightRow[]
      ).map(mapActionInsight);
    },

    getCategoryDetail(categoryId, date) {
      return {
        category: this.getCategoryMonitor(categoryId),
        snapshots: this.listCategorySnapshots({ categoryId, date }),
        brandMatrix: this.listBrandMatrix({ categoryId, date }),
        signals: this.listCategorySignals({ categoryId, date, limit: 200 }),
        report: this.getCategoryReport(date, categoryId)
      };
    },

    deleteSnapshotsForKeywordDate(keywordId, date) {
      db.prepare("DELETE FROM amazon_keyword_serp_snapshot WHERE keyword_id = ? AND snapshot_date = ?").run(keywordId, date);
      db.prepare("DELETE FROM amazon_bsr_rank_history WHERE source_type = 'keyword_detail' AND source_id = ? AND snapshot_date = ?").run(keywordId, date);
      db.prepare("DELETE FROM amazon_bsr_snapshot_quality WHERE source_type = 'keyword_detail' AND source_id = ? AND snapshot_date = ?").run(keywordId, date);
      db.prepare("DELETE FROM amazon_competitor_action_insight WHERE source_type = 'keyword_detail' AND source_id = ? AND insight_date = ?").run(
        keywordId,
        date
      );
      db.prepare("DELETE FROM amazon_competitor_daily_change WHERE snapshot_date = ? AND keyword IN (SELECT keyword FROM amazon_keyword_monitor WHERE id = ?)").run(date, keywordId);
      db.prepare("DELETE FROM amazon_alert_log WHERE alert_date = ? AND keyword IN (SELECT keyword FROM amazon_keyword_monitor WHERE id = ?)").run(date, keywordId);
    },

    insertSnapshots(items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_keyword_serp_snapshot
        (keyword_id, keyword, marketplace, snapshot_date, page_no, position_in_page, absolute_rank, organic_rank,
         sponsored_rank, asin, title, brand, image_url, product_url, current_price, original_price, coupon_text,
         coupon_value, coupon_rate, final_estimated_price, currency, rating, review_count, is_sponsored, is_prime,
         deal_badge, delivery_text, bsr_rank, bsr_category, bsr_text, bestseller_ranks_json, detail_collected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      withTransaction(db, () => {
        for (const item of items) {
          stmt.run(
            item.keywordId,
            item.keyword,
            item.marketplace,
            item.snapshotDate,
            item.pageNo,
            item.positionInPage,
            item.absoluteRank,
            item.organicRank,
            item.sponsoredRank,
            item.asin,
            item.title,
            item.brand,
            item.imageUrl,
            item.productUrl,
            item.currentPrice,
            item.originalPrice ?? null,
            item.couponText,
            item.couponValue,
            item.couponRate,
            item.finalEstimatedPrice,
            item.currency,
            item.rating,
            item.reviewCount,
            item.isSponsored ? 1 : 0,
            item.isPrime ? 1 : 0,
            item.dealBadge,
            item.deliveryText,
            item.bsrRank,
            item.bsrCategory,
            item.bsrText,
            JSON.stringify(item.bestsellerRanks ?? []),
            item.detailCollectedAt
          );
        }
      });
    },

    listSnapshots(filter = {}) {
      const { sql: where, params } = buildWhere(
        whereEq("snapshot_date", filter.date),
        whereEq("keyword_id", filter.keywordId),
        whereEq("keyword", filter.keyword)
      );
      const limit = filter.limit ? `LIMIT ${Number(filter.limit)}` : "";
      return (
        db
          .prepare(`SELECT * FROM amazon_keyword_serp_snapshot ${where} ORDER BY snapshot_date DESC, keyword_id, absolute_rank ${limit}`)
          .all(...params) as unknown as SnapshotRow[]
      ).map(mapSnapshot);
    },

    getPreviousSnapshots(keywordId, beforeDate) {
      const row = db
        .prepare(
          `SELECT snapshot_date FROM amazon_keyword_serp_snapshot
           WHERE keyword_id = ? AND snapshot_date < ?
           GROUP BY snapshot_date
           ORDER BY snapshot_date DESC
           LIMIT 1`
        )
        .get(keywordId, beforeDate) as { snapshot_date: string } | undefined;
      return row ? this.listSnapshots({ keywordId, date: row.snapshot_date }) : [];
    },

    getHistoryLowestPrices(asins) {
      const result: Record<string, number | null> = {};
      const stmt = db.prepare("SELECT MIN(current_price) AS lowest_price FROM amazon_keyword_serp_snapshot WHERE asin = ? AND current_price IS NOT NULL");
      for (const asin of asins) {
        const row = stmt.get(asin) as { lowest_price: number | null } | undefined;
        result[asin] = row?.lowest_price ?? null;
      }
      return result;
    },

    upsertCompetitorsFromSnapshots(items) {
      const unique = new Map<string, SerpSnapshot>();
      for (const item of items) {
        unique.set(`${item.marketplace}:${item.asin}`, item);
      }
      const stmt = db.prepare(
        `INSERT INTO amazon_competitor_pool
         (asin, marketplace, title, brand, image_url, first_seen_keyword, first_seen_date, last_seen_date,
           appear_keyword_count, best_rank, latest_rank, lowest_price, latest_price, latest_product_url,
           latest_bsr_rank, latest_bsr_category, latest_bsr_text, latest_bestseller_ranks_json,
           source_type, first_seen_source, latest_category_name, latest_category_rank, competitor_tier, competitor_reasons_json,
           is_key_competitor, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'keyword', ?, NULL, NULL, ?, ?, 0, 1, ?)
         ON CONFLICT(asin, marketplace) DO UPDATE SET
           title = excluded.title,
           brand = COALESCE(excluded.brand, amazon_competitor_pool.brand),
           image_url = excluded.image_url,
           last_seen_date = excluded.last_seen_date,
          appear_keyword_count = (
            SELECT COUNT(DISTINCT keyword) FROM amazon_keyword_serp_snapshot
            WHERE asin = excluded.asin AND marketplace = excluded.marketplace
          ),
          best_rank = MIN(amazon_competitor_pool.best_rank, excluded.best_rank),
          latest_rank = excluded.latest_rank,
          lowest_price = CASE
            WHEN amazon_competitor_pool.lowest_price IS NULL THEN excluded.lowest_price
            WHEN excluded.lowest_price IS NULL THEN amazon_competitor_pool.lowest_price
            ELSE MIN(amazon_competitor_pool.lowest_price, excluded.lowest_price)
          END,
          latest_price = excluded.latest_price,
          latest_product_url = excluded.latest_product_url,
           latest_bsr_rank = excluded.latest_bsr_rank,
           latest_bsr_category = excluded.latest_bsr_category,
           latest_bsr_text = excluded.latest_bsr_text,
           latest_bestseller_ranks_json = excluded.latest_bestseller_ranks_json,
           source_type = CASE
             WHEN amazon_competitor_pool.source_type = 'category' THEN 'hybrid'
             WHEN amazon_competitor_pool.source_type = 'hybrid' THEN 'hybrid'
             ELSE 'keyword'
           END,
           first_seen_source = COALESCE(amazon_competitor_pool.first_seen_source, excluded.first_seen_source),
           competitor_tier = CASE
             WHEN amazon_competitor_pool.competitor_tier = 'core' THEN 'core'
             ELSE excluded.competitor_tier
           END,
           competitor_reasons_json = excluded.competitor_reasons_json,
           updated_at = excluded.updated_at`
      );
      withTransaction(db, () => {
        for (const item of unique.values()) {
          stmt.run(
            item.asin,
            item.marketplace,
            item.title,
            item.brand,
            item.imageUrl,
            item.keyword,
            item.snapshotDate,
            item.snapshotDate,
            item.absoluteRank,
            item.absoluteRank,
            item.currentPrice,
            item.currentPrice,
            item.productUrl,
            item.bsrRank,
            item.bsrCategory,
            item.bsrText,
            JSON.stringify(item.bestsellerRanks ?? []),
            `keyword:${item.keyword}`,
            keywordCompetitorTier(item),
            JSON.stringify(keywordCompetitorReasons(item)),
            nowIso()
          );
        }
      });
    },

    listCompetitors(filter = {}) {
      const clauses = ["cp.status = 1"];
      const params: SQLInputValue[] = [];
      if (filter.keywordId) {
        clauses.push("EXISTS (SELECT 1 FROM amazon_keyword_serp_snapshot s WHERE s.asin = cp.asin AND s.marketplace = cp.marketplace AND s.keyword_id = ?)");
        params.push(filter.keywordId);
      }
      if (filter.keyword) {
        clauses.push("EXISTS (SELECT 1 FROM amazon_keyword_serp_snapshot s WHERE s.asin = cp.asin AND s.marketplace = cp.marketplace AND s.keyword = ?)");
        params.push(filter.keyword);
      }
      if (filter.sourceType) {
        clauses.push("cp.source_type = ?");
        params.push(filter.sourceType);
      }
      if (filter.tier) {
        clauses.push("cp.competitor_tier = ?");
        params.push(filter.tier);
      }
      return (
        db
          .prepare(
            `SELECT cp.* FROM amazon_competitor_pool cp
             WHERE ${clauses.join(" AND ")}
             ORDER BY cp.is_key_competitor DESC,
              CASE cp.competitor_tier
                WHEN 'core' THEN 1
                WHEN 'rising' THEN 2
                WHEN 'activity' THEN 3
                ELSE 4
              END,
              COALESCE(cp.latest_category_rank, cp.latest_bsr_rank, cp.latest_rank, 999999),
              cp.asin`
          )
          .all(...params) as unknown as CompetitorRow[]
      ).map(mapCompetitor);
    },

    listCompetitorFolders() {
      return (
        db
          .prepare(
            `SELECT
              k.id AS keyword_id,
              k.keyword,
              k.marketplace,
              COUNT(DISTINCT s.asin) AS competitor_count,
              MAX(s.snapshot_date) AS latest_snapshot_date
            FROM amazon_keyword_monitor k
            LEFT JOIN amazon_keyword_serp_snapshot s ON s.keyword_id = k.id
            GROUP BY k.id, k.keyword, k.marketplace
            ORDER BY k.id`
          )
          .all() as unknown as CompetitorFolderRow[]
      ).map(mapCompetitorFolder);
    },

    getProductLink(asin, keywordId) {
      const params: SQLInputValue[] = [asin];
      const keywordClause = keywordId ? "AND keyword_id = ?" : "";
      if (keywordId) {
        params.push(keywordId);
      }
      const snapshot = db
        .prepare(
          `SELECT asin, marketplace, product_url FROM amazon_keyword_serp_snapshot
           WHERE asin = ? ${keywordClause}
           ORDER BY snapshot_date DESC, absolute_rank ASC
           LIMIT 1`
        )
        .get(...params) as { asin: string; marketplace: string; product_url: string | null } | undefined;
      if (snapshot?.product_url) {
        return { asin: snapshot.asin, marketplace: snapshot.marketplace, url: snapshot.product_url };
      }

      const competitor = db.prepare("SELECT asin, marketplace, latest_product_url FROM amazon_competitor_pool WHERE asin = ? LIMIT 1").get(asin) as
        | { asin: string; marketplace: string; latest_product_url: string | null }
        | undefined;
      return competitor?.latest_product_url
        ? { asin: competitor.asin, marketplace: competitor.marketplace, url: competitor.latest_product_url }
        : null;
    },

    getProductActivityCalendar(asin, filter = {}) {
      const limitDays = Math.max(1, Math.min(180, filter.limitDays ?? 90));
      const fromDate = filter.date ? isoDateOffset(filter.date, -(limitDays - 1)) : undefined;
      const { sql: commonWhere, params: commonParams } = buildCalendarFilterClauses(asin, filter.marketplace, filter.date, fromDate);
      const { sql: eventWhere, params: eventParams } = buildWhere(
        whereEq("asin", asin),
        whereEq("marketplace", filter.marketplace),
        whereLte("event_date", filter.date),
        whereGte("event_date", fromDate)
      );
      const { sql: actionWhere, params: actionParams } = buildWhere(
        whereEq("asin", asin),
        whereEq("marketplace", filter.marketplace),
        whereLte("insight_date", filter.date),
        whereGte("insight_date", fromDate)
      );
      const { sql: signalWhere, params: signalParams } = buildWhere(
        whereEq("asin", asin),
        whereEq("marketplace", filter.marketplace),
        whereLte("signal_date", filter.date),
        whereGte("signal_date", fromDate)
      );
      const { sql: bsrWhere, params: bsrParams } = buildWhere(
        whereEq("asin", asin),
        whereEq("marketplace", filter.marketplace),
        whereLte("snapshot_date", filter.date),
        whereGte("snapshot_date", fromDate)
      );
      const { sql: changeWhere, params: changeParams } = buildWhere(
        whereEq("asin", asin),
        whereEq("marketplace", filter.marketplace),
        whereLte("snapshot_date", filter.date),
        whereGte("snapshot_date", fromDate)
      );

      const categoryRows = db
        .prepare(
          `SELECT * FROM amazon_bestseller_rank_snapshot
           ${commonWhere}
           ORDER BY snapshot_date DESC, rank_no ASC`
        )
        .all(...commonParams) as unknown as BestsellerSnapshotRow[];

      const keywordRows = db
        .prepare(
          `SELECT * FROM amazon_keyword_serp_snapshot
           ${commonWhere}
           ORDER BY snapshot_date DESC, absolute_rank ASC`
        )
        .all(...commonParams) as unknown as SnapshotRow[];

      const eventRows = db
        .prepare(
          `SELECT * FROM amazon_competitor_activity_event
           ${eventWhere}
           ORDER BY event_date DESC, id DESC`
        )
        .all(...eventParams) as unknown as ActivityEventRow[];

      const actionRows = db
        .prepare(
          `SELECT * FROM amazon_competitor_action_insight
           ${actionWhere}
           ORDER BY insight_date DESC,
            CASE confidence WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
            id DESC`
        )
        .all(...actionParams) as unknown as ActionInsightRow[];

      const signalRows = db
        .prepare(
          `SELECT * FROM amazon_competitor_signal_log
           ${signalWhere}
           ORDER BY signal_date DESC, id DESC`
        )
        .all(...signalParams) as unknown as CategorySignalRow[];

      const bsrRows = db
        .prepare(
          `SELECT * FROM amazon_bsr_rank_history
           ${bsrWhere}
           ORDER BY snapshot_date DESC, rank_no ASC`
        )
        .all(...bsrParams) as unknown as BsrRankHistoryRow[];

      const priceRows = db
        .prepare(
          `SELECT * FROM amazon_product_price_history
           ${commonWhere}
           ORDER BY snapshot_date DESC`
        )
        .all(...commonParams) as unknown as ProductPriceHistoryRow[];

      const changeRows = db
        .prepare(
          `SELECT * FROM amazon_competitor_daily_change
           ${changeWhere}
           ORDER BY snapshot_date DESC`
        )
        .all(...changeParams) as unknown as ChangeRow[];

      const categorySnapshots = categoryRows.map(mapBestsellerSnapshot);
      const keywordSnapshots = keywordRows.map(mapSnapshot);
      const events = eventRows.map(mapActivityEvent);
      const actionInsights = actionRows.map(mapActionInsight);
      const signals = signalRows.map(mapCategorySignal);
      const bsrRanks = bsrRows.map(mapBsrRankHistory);
      const priceHistory = priceRows.map(mapProductPriceHistory);
      const keywordChanges = changeRows.map(mapChange);
      const dates = Array.from(
        new Set([
          ...categorySnapshots.map((item) => item.snapshotDate),
          ...keywordSnapshots.map((item) => item.snapshotDate),
          ...events.map((item) => item.eventDate),
          ...signals.map((item) => item.signalDate),
          ...bsrRanks.map((item) => item.snapshotDate),
          ...priceHistory.map((item) => item.snapshotDate),
          ...keywordChanges.map((item) => item.snapshotDate)
        ])
      ).sort((a, b) => b.localeCompare(a));
      const limitedDates = dates.slice(0, limitDays);
      const days = limitedDates.map((date) =>
        buildProductActivityDay({
          asin,
          date,
        categorySnapshots,
        keywordSnapshots,
        events,
        actionInsights,
        signals,
        bsrRanks,
          priceHistory,
          keywordChanges
        })
      );
      const identity = resolveProductIdentity(asin, categorySnapshots, keywordSnapshots, priceHistory, events);
      if (!identity && days.length === 0) {
        return null;
      }
      return {
        asin,
        marketplace: identity?.marketplace ?? filter.marketplace ?? "amazon.com",
        title: identity?.title ?? null,
        brand: identity?.brand ?? null,
        imageUrl: identity?.imageUrl ?? null,
        productUrl: identity?.productUrl ?? null,
        summary: buildProductActivitySummary(days),
        days
      };
    },

    setKeyCompetitor(asin, isKeyCompetitor) {
      db.prepare("UPDATE amazon_competitor_pool SET is_key_competitor = ?, updated_at = ? WHERE asin = ?").run(
        isKeyCompetitor ? 1 : 0,
        nowIso(),
        asin
      );
      const row = db.prepare("SELECT * FROM amazon_competitor_pool WHERE asin = ?").get(asin) as CompetitorRow | undefined;
      return row ? mapCompetitor(row) : null;
    },

    insertDailyChanges(items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_competitor_daily_change
         (asin, keyword, marketplace, snapshot_date, yesterday_rank, today_rank, rank_change, yesterday_price,
          today_price, price_change, price_change_rate, yesterday_sponsored, today_sponsored, change_type, title, brand)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      withTransaction(db, () => {
        for (const item of items) {
          stmt.run(
            item.asin,
            item.keyword,
            item.marketplace,
            item.snapshotDate,
            item.yesterdayRank,
            item.todayRank,
            item.rankChange,
            item.yesterdayPrice,
            item.todayPrice,
            item.priceChange,
            item.priceChangeRate,
            item.yesterdaySponsored === null ? null : item.yesterdaySponsored ? 1 : 0,
            item.todaySponsored === null ? null : item.todaySponsored ? 1 : 0,
            item.changeType,
            item.title,
            item.brand
          );
        }
      });
    },

    listDailyChanges(filter = {}) {
      const { sql: where, params } = buildWhere(whereEq("snapshot_date", filter.date), whereEq("keyword", filter.keyword));
      return (
        db.prepare(`SELECT * FROM amazon_competitor_daily_change ${where} ORDER BY created_at DESC, id DESC`).all(...params) as unknown as ChangeRow[]
      ).map(mapChange);
    },

    insertAlerts(items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_alert_log
         (alert_date, alert_type, alert_level, keyword, asin, title, brand, alert_content, old_value, new_value, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      withTransaction(db, () => {
        for (const item of items) {
          stmt.run(
            item.alertDate,
            item.alertType,
            item.alertLevel,
            item.keyword,
            item.asin,
            item.title,
            item.brand,
            item.alertContent,
            item.oldValue,
            item.newValue,
            item.status
          );
        }
      });
    },

    listAlerts(filter = {}) {
      const { sql: where, params } = buildWhere(whereEq("alert_date", filter.date), whereEq("status", filter.status));
      const limit = filter.limit ? `LIMIT ${Number(filter.limit)}` : "";
      return (db.prepare(`SELECT * FROM amazon_alert_log ${where} ORDER BY created_at DESC, id DESC ${limit}`).all(...params) as unknown as AlertRow[]).map(
        mapAlert
      );
    },

    updateAlertStatus(id, status) {
      db.prepare("UPDATE amazon_alert_log SET status = ? WHERE id = ?").run(status, id);
      const row = db.prepare("SELECT * FROM amazon_alert_log WHERE id = ?").get(id) as AlertRow | undefined;
      return row ? mapAlert(row) : null;
    },

    insertTaskLog(input) {
      const result = db
        .prepare(
          `INSERT INTO amazon_collect_task_log
           (task_type, keyword_id, keyword, marketplace, status, start_time, end_time, page_count, success_count, fail_count, error_message, retry_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.taskType,
          input.keywordId,
          input.keyword,
          input.marketplace,
          input.status,
          input.startTime,
          input.endTime,
          input.pageCount,
          input.successCount,
          input.failCount,
          input.errorMessage,
          input.retryCount
        );
      return mapTaskLog(
        db.prepare("SELECT * FROM amazon_collect_task_log WHERE id = ?").get(Number(result.lastInsertRowid)) as unknown as TaskLogRow
      );
    },

    listTaskLogs(limit = 50) {
      return (db.prepare("SELECT * FROM amazon_collect_task_log ORDER BY id DESC LIMIT ?").all(limit) as unknown as TaskLogRow[]).map(mapTaskLog);
    },

    saveDailyReport(date, keyword, markdown) {
      db.prepare(
        `INSERT INTO amazon_daily_report (report_date, keyword, markdown, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(report_date, keyword) DO UPDATE SET markdown = excluded.markdown, updated_at = excluded.updated_at`
      ).run(date, keyword, markdown, nowIso());
    },

    getDailyReport(date, keyword) {
      if (keyword) {
        const row = db
          .prepare("SELECT markdown FROM amazon_daily_report WHERE report_date = ? AND keyword = ?")
          .get(date, keyword) as { markdown: string } | undefined;
        return row?.markdown ?? "";
      }
      const rows = db.prepare("SELECT markdown FROM amazon_daily_report WHERE report_date = ? ORDER BY keyword").all(date) as {
        markdown: string;
      }[];
      return rows.map((row) => row.markdown).join("\n\n---\n\n");
    },

    createNotificationSchedule(input) {
      validateNotificationInput(input);
      const now = nowIso();
      const result = db
        .prepare(
          `INSERT INTO amazon_notification_schedule
           (name, channel, target, send_time, timezone, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.name.trim(),
          input.channel,
          input.target.trim(),
          input.sendTime,
          input.timezone || "Asia/Shanghai",
          input.status === "disabled" ? "disabled" : "enabled",
          now,
          now
        );
      return this.getNotificationSchedule(Number(result.lastInsertRowid))!;
    },

    updateNotificationSchedule(id, input) {
      const current = this.getNotificationSchedule(id);
      if (!current) {
        throw new Error(`Notification schedule ${id} not found`);
      }
      const next: NotificationScheduleInput = {
        name: input.name ?? current.name,
        channel: input.channel ?? current.channel,
        target: input.target ?? current.target,
        sendTime: input.sendTime ?? current.sendTime,
        timezone: input.timezone ?? current.timezone,
        status: input.status ?? current.status
      };
      validateNotificationInput(next);
      db.prepare(
        `UPDATE amazon_notification_schedule
         SET name = ?, channel = ?, target = ?, send_time = ?, timezone = ?, status = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        next.name.trim(),
        next.channel,
        next.target.trim(),
        next.sendTime,
        next.timezone || "Asia/Shanghai",
        next.status ?? "enabled",
        nowIso(),
        id
      );
      return this.getNotificationSchedule(id)!;
    },

    deleteNotificationSchedule(id) {
      db.prepare("DELETE FROM amazon_notification_schedule WHERE id = ?").run(id);
    },

    getNotificationSchedule(id) {
      const row = db.prepare("SELECT * FROM amazon_notification_schedule WHERE id = ?").get(id) as NotificationScheduleRow | undefined;
      return row ? mapNotificationSchedule(row) : null;
    },

    listNotificationSchedules() {
      return (
        db.prepare("SELECT * FROM amazon_notification_schedule ORDER BY status DESC, send_time ASC, id DESC").all() as unknown as NotificationScheduleRow[]
      ).map(mapNotificationSchedule);
    },

    markNotificationScheduleSent(id, input) {
      db.prepare(
        `UPDATE amazon_notification_schedule
         SET last_sent_at = ?, last_sent_date = ?, last_status = ?, last_error = ?, updated_at = ?
         WHERE id = ?`
      ).run(input.sentAt, input.sentDate, input.status, input.errorMessage ?? null, nowIso(), id);
    },

    insertNotificationSendLog(input) {
      const result = db
        .prepare(
          `INSERT INTO amazon_notification_send_log
           (schedule_id, schedule_name, channel, target, report_date, status, message, error_message, sent_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.scheduleId,
          input.scheduleName,
          input.channel,
          input.target,
          input.reportDate,
          input.status,
          input.message,
          input.errorMessage,
          input.sentAt
        );
      return mapNotificationSendLog(
        db.prepare("SELECT * FROM amazon_notification_send_log WHERE id = ?").get(Number(result.lastInsertRowid)) as unknown as NotificationSendLogRow
      );
    },

    listNotificationSendLogs(limit = 50) {
      return (
        db.prepare("SELECT * FROM amazon_notification_send_log ORDER BY id DESC LIMIT ?").all(limit) as unknown as NotificationSendLogRow[]
      ).map(mapNotificationSendLog);
    },

    getDashboardSummary(date) {
      const row = db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM amazon_keyword_monitor) AS keyword_count,
            (SELECT COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) FROM amazon_keyword_monitor) AS active_keyword_count,
            (SELECT COUNT(*) FROM amazon_bestseller_category_monitor) AS category_monitor_count,
            (SELECT COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) FROM amazon_bestseller_category_monitor) AS active_category_count,
            (SELECT COUNT(*) FROM amazon_keyword_serp_snapshot WHERE snapshot_date = ?) AS today_snapshot_count,
            (SELECT COUNT(*) FROM amazon_bestseller_rank_snapshot WHERE snapshot_date = ?) AS category_snapshot_count,
            (SELECT COUNT(*) FROM amazon_competitor_pool WHERE status = 1) AS competitor_count,
            (SELECT COUNT(*) FROM amazon_alert_log WHERE alert_date = ?) AS alert_count,
            (SELECT COUNT(*) FROM amazon_competitor_signal_log WHERE source_type = 'category' AND signal_date = ?) AS category_signal_count,
            (SELECT COUNT(*) FROM amazon_alert_log WHERE alert_date = ? AND alert_level IN ('critical', 'high')) AS critical_alert_count,
            (SELECT MAX(report_date) FROM amazon_daily_report) AS latest_report_date`
        )
        .get(date, date, date, date, date) as {
        keyword_count: number;
        active_keyword_count: number;
        category_monitor_count: number;
        active_category_count: number;
        today_snapshot_count: number;
        category_snapshot_count: number;
        competitor_count: number;
        alert_count: number;
        category_signal_count: number;
        critical_alert_count: number;
        latest_report_date: string | null;
      };
      return {
        keywordCount: row.keyword_count,
        activeKeywordCount: row.active_keyword_count,
        categoryMonitorCount: row.category_monitor_count,
        activeCategoryCount: row.active_category_count,
        todaySnapshotCount: row.today_snapshot_count,
        categorySnapshotCount: row.category_snapshot_count,
        competitorCount: row.competitor_count,
        alertCount: row.alert_count,
        categorySignalCount: row.category_signal_count,
        criticalAlertCount: row.critical_alert_count,
        latestReportDate: row.latest_report_date
      };
    },

    getKeywordDetail(keywordId, date) {
      const keyword = this.getKeyword(keywordId);
      const snapshots = this.listSnapshots({ keywordId, date });
      const changes = keyword ? this.listDailyChanges({ date, keyword: keyword.keyword }) : [];
      const alerts = keyword ? this.listAlerts({ date }).filter((alert) => alert.keyword === keyword.keyword) : [];
      return { keyword, snapshots, changes, alerts };
    }
  };
}

function keywordCountsByAsinMarketplace(db: DatabaseSync, items: Iterable<{ asin: string; marketplace: string }>): Map<string, number> {
  const keys = Array.from(new Set(Array.from(items, (item) => `${item.marketplace}:${item.asin}`)));
  if (!keys.length) {
    return new Map();
  }
  const valuesSql = keys.map(() => "(?, ?)").join(", ");
  const params = keys.flatMap((key) => {
    const separator = key.indexOf(":");
    return [key.slice(separator + 1), key.slice(0, separator)];
  });
  const rows = db
    .prepare(
      `WITH target(asin, marketplace) AS (VALUES ${valuesSql})
       SELECT target.asin, target.marketplace, COUNT(DISTINCT s.keyword) AS keyword_count
       FROM target
       LEFT JOIN amazon_keyword_serp_snapshot s
        ON s.asin = target.asin AND s.marketplace = target.marketplace
       GROUP BY target.asin, target.marketplace`
    )
    .all(...params) as Array<{ asin: string; marketplace: string; keyword_count: number }>;
  return new Map(rows.map((row) => [`${row.marketplace}:${row.asin}`, Number(row.keyword_count)]));
}

function categoryPriceLow(db: DatabaseSync, item: BestsellerRankSnapshot, days: number | null): number | null {
  const clauses = ["category_id = ?", "marketplace = ?", "asin = ?", "snapshot_date <= ?", "current_price IS NOT NULL"];
  const params: SQLInputValue[] = [item.categoryId, item.marketplace, item.asin, item.snapshotDate];
  if (days !== null) {
    clauses.push("snapshot_date >= ?");
    params.push(isoDateOffset(item.snapshotDate, -(days - 1)));
  }
  const row = db
    .prepare(`SELECT MIN(current_price) AS low_price FROM amazon_bestseller_rank_snapshot WHERE ${clauses.join(" AND ")}`)
    .get(...params) as { low_price: number | null } | undefined;
  return row?.low_price ?? null;
}

function isoDateOffset(date: string, offsetDays: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + offsetDays);
  return parsed.toISOString().slice(0, 10);
}

function keywordCompetitorTier(item: SerpSnapshot): CompetitorTier {
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

function keywordCompetitorReasons(item: SerpSnapshot): string[] {
  return [
    `Keyword rank #${item.absoluteRank} for ${item.keyword}`,
    item.organicRank ? `Organic #${item.organicRank}` : null,
    item.sponsoredRank ? `Sponsored #${item.sponsoredRank}` : null,
    item.bsrRank ? `BSR #${item.bsrRank} in ${item.bsrCategory ?? "category"}` : null,
    item.couponText ? `Coupon: ${item.couponText}` : null,
    item.dealBadge ? `Deal: ${item.dealBadge}` : null
  ].filter((item): item is string => Boolean(item));
}

function categoryCompetitorTier(item: BestsellerRankSnapshot, events: CompetitorActivityEvent[]): CompetitorTier {
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

function categoryCompetitorReasons(item: BestsellerRankSnapshot, events: CompetitorActivityEvent[]): string[] {
  return [
    `${item.categoryName} Best Sellers #${item.rank}`,
    item.rank <= 50 ? "Category Top50" : null,
    item.couponText ? `Coupon: ${item.couponText}` : null,
    item.dealBadge ? `Deal: ${item.dealBadge}` : null,
    ...events.slice(0, 3).map((event) => `${event.eventType}: ${event.eventSummary}`)
  ].filter((reason): reason is string => Boolean(reason));
}

function buildProductActivityDay(input: {
  asin: string;
  date: string;
  categorySnapshots: BestsellerRankSnapshot[];
  keywordSnapshots: SerpSnapshot[];
  events: CompetitorActivityEvent[];
  actionInsights: CompetitorActionInsight[];
  signals: CategorySignalLog[];
  bsrRanks: BsrRankHistory[];
  priceHistory: ProductPriceHistory[];
  keywordChanges: DailyChange[];
}): ProductActivityCalendarDay {
  const categoryRanks = input.categorySnapshots
    .filter((item) => item.snapshotDate === input.date)
    .map((item) => ({
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      rank: item.rank,
      price: item.currentPrice,
      finalEstimatedPrice: item.finalEstimatedPrice,
      couponText: item.couponText,
      dealBadge: item.dealBadge,
      productUrl: item.productUrl
    }));
  const keywordRanks = input.keywordSnapshots
    .filter((item) => item.snapshotDate === input.date)
    .map((item) => ({
      keywordId: item.keywordId,
      keyword: item.keyword,
      absoluteRank: item.absoluteRank,
      organicRank: item.organicRank,
      sponsoredRank: item.sponsoredRank,
      price: item.currentPrice,
      couponText: item.couponText,
      dealBadge: item.dealBadge,
      productUrl: item.productUrl
    }));
  const identity = resolveProductIdentity(input.asin, input.categorySnapshots, input.keywordSnapshots, input.priceHistory, input.events);
  return {
    date: input.date,
    asin: input.asin,
    marketplace: identity?.marketplace ?? "amazon.com",
    title: identity?.title ?? null,
    brand: identity?.brand ?? null,
    imageUrl: identity?.imageUrl ?? null,
    categoryRanks,
    keywordRanks,
    bsrRanks: input.bsrRanks.filter((item) => item.snapshotDate === input.date),
    priceHistory: input.priceHistory.find((item) => item.snapshotDate === input.date) ?? null,
    events: input.events.filter((item) => item.eventDate === input.date),
    actionInsights: input.actionInsights.filter((item) => item.insightDate === input.date),
    categorySignals: input.signals.filter((item) => item.signalDate === input.date),
    keywordChanges: input.keywordChanges.filter((item) => item.snapshotDate === input.date)
  };
}

function buildProductActivitySummary(days: ProductActivityCalendarDay[]): ProductActivityCalendar["summary"] {
  const categoryRanks = days.flatMap((day) => day.categoryRanks.map((item) => item.rank));
  const keywordRanks = days.flatMap((day) => day.keywordRanks.map((item) => item.absoluteRank));
  const prices = days.map(dayActivityPrice).filter((price): price is number => price !== null);
  const latestCategoryRank = days.find((day) => day.categoryRanks.length)?.categoryRanks[0]?.rank ?? null;
  const latestKeywordRank = days.find((day) => day.keywordRanks.length)?.keywordRanks[0]?.absoluteRank ?? null;
  return {
    firstSeenDate: days.length ? days[days.length - 1].date : null,
    lastSeenDate: days[0]?.date ?? null,
    activeDays: days.length,
    bestCategoryRank: categoryRanks.length ? Math.min(...categoryRanks) : null,
    latestCategoryRank,
    bestKeywordRank: keywordRanks.length ? Math.min(...keywordRanks) : null,
    latestKeywordRank,
    priceLow: prices.length ? Math.min(...prices) : null,
    priceHigh: prices.length ? Math.max(...prices) : null,
    eventCount: days.reduce(
      (sum, day) => sum + day.events.length + day.actionInsights.length + day.categorySignals.length + day.keywordChanges.length,
      0
    )
  };
}

function dayActivityPrice(day: ProductActivityCalendarDay): number | null {
  return (
    day.priceHistory?.currentPrice ??
    day.categoryRanks.find((item) => item.price !== null)?.price ??
    day.keywordRanks.find((item) => item.price !== null)?.price ??
    null
  );
}

function resolveProductIdentity(
  asin: string,
  categorySnapshots: BestsellerRankSnapshot[],
  keywordSnapshots: SerpSnapshot[],
  priceHistory: ProductPriceHistory[],
  events: CompetitorActivityEvent[]
): { marketplace: string; title: string | null; brand: string | null; imageUrl: string | null; productUrl: string | null } | null {
  const category = categorySnapshots[0];
  if (category) {
    return { marketplace: category.marketplace, title: category.title, brand: category.brand, imageUrl: category.imageUrl, productUrl: category.productUrl };
  }
  const keyword = keywordSnapshots[0];
  if (keyword) {
    return { marketplace: keyword.marketplace, title: keyword.title, brand: keyword.brand, imageUrl: keyword.imageUrl, productUrl: keyword.productUrl };
  }
  const price = priceHistory[0];
  if (price) {
    return { marketplace: price.marketplace, title: price.title, brand: price.brand, imageUrl: null, productUrl: `https://www.amazon.com/dp/${asin}` };
  }
  const event = events[0];
  if (event) {
    return { marketplace: event.marketplace, title: event.title, brand: event.brand, imageUrl: null, productUrl: `https://www.amazon.com/dp/${asin}` };
  }
  return null;
}

function previousUsableBsrDate(
  db: DatabaseSync,
  filter: { beforeDate: string; sourceType?: BsrSourceType; sourceId?: number; category?: string }
): string | null {
  const clauses = [
    "h.snapshot_date < ?",
    `(h.source_type <> 'category_bestseller' OR EXISTS (
      SELECT 1
      FROM amazon_bsr_snapshot_quality q
      WHERE q.snapshot_date = h.snapshot_date
        AND q.source_type = h.source_type
        AND q.source_id = h.source_id
        AND q.category = h.category
        AND q.quality_status = 'ok'
    ))`
  ];
  const params: SQLInputValue[] = [filter.beforeDate];
  if (filter.sourceType !== undefined) {
    clauses.push("h.source_type = ?");
    params.push(filter.sourceType);
  }
  if (filter.sourceId !== undefined) {
    clauses.push("h.source_id = ?");
    params.push(filter.sourceId);
  }
  if (filter.category !== undefined) {
    clauses.push("h.category = ?");
    params.push(filter.category);
  }
  const row = db
    .prepare(`SELECT MAX(h.snapshot_date) AS snapshot_date FROM amazon_bsr_rank_history h WHERE ${clauses.join(" AND ")}`)
    .get(...params) as { snapshot_date: string | null } | undefined;
  return row?.snapshot_date ?? null;
}

function hasEarlierBsrHistory(
  db: DatabaseSync,
  filter: { beforeDate: string; sourceType?: BsrSourceType; sourceId?: number; category?: string }
): boolean {
  const clauses = ["snapshot_date < ?"];
  const params: SQLInputValue[] = [filter.beforeDate];
  if (filter.sourceType !== undefined) {
    clauses.push("source_type = ?");
    params.push(filter.sourceType);
  }
  if (filter.sourceId !== undefined) {
    clauses.push("source_id = ?");
    params.push(filter.sourceId);
  }
  if (filter.category !== undefined) {
    clauses.push("category = ?");
    params.push(filter.category);
  }
  const row = db
    .prepare(`SELECT 1 AS has_history FROM amazon_bsr_rank_history WHERE ${clauses.join(" AND ")} LIMIT 1`)
    .get(...params) as { has_history: number } | undefined;
  return Boolean(row);
}

function groupBsrHistoryByScope(items: BsrRankHistory[]): Map<string, BsrRankHistory[]> {
  const groups = new Map<string, BsrRankHistory[]>();
  for (const item of items) {
    const key = [item.sourceType, item.sourceId ?? "", item.category].join("|");
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

function buildBsrRankChanges(date: string, previousDate: string | null, today: BsrRankHistory[], yesterday: BsrRankHistory[]): BsrRankChange[] {
  const todayByKey = new Map(today.map((item) => [bsrChangeKey(item), item]));
  const yesterdayByKey = new Map(yesterday.map((item) => [bsrChangeKey(item), item]));
  const keys = Array.from(new Set([...todayByKey.keys(), ...yesterdayByKey.keys()]));

  return keys
    .map((key) => {
      const current = todayByKey.get(key);
      const previous = yesterdayByKey.get(key);
      const reference = current ?? previous!;
      const currentRank = current?.rank ?? null;
      const previousRank = previous?.rank ?? null;
      const rankChange = currentRank !== null && previousRank !== null ? previousRank - currentRank : null;
      const changeType: BsrRankChange["changeType"] =
        current && !previous
          ? "new_entry"
          : !current && previous
            ? "dropped"
            : rankChange !== null && rankChange > 0
              ? "rank_up"
              : rankChange !== null && rankChange < 0
                ? "rank_down"
                : "unchanged";

      return {
        snapshotDate: date,
        previousDate,
        sourceType: reference.sourceType,
        sourceId: reference.sourceId,
        sourceName: reference.sourceName,
        marketplace: reference.marketplace,
        category: reference.category,
        asin: reference.asin,
        title: reference.title,
        brand: reference.brand,
        currentRank,
        previousRank,
        rankChange,
        changeType,
        productUrl: current?.productUrl ?? previous?.productUrl ?? null,
        currentPrice: current?.currentPrice ?? null
      };
    })
    .sort(compareBsrRankChanges);
}

function compareBsrRankChanges(a: BsrRankChange, b: BsrRankChange): number {
  const severity = (value: BsrRankChange["changeType"]) =>
    value === "new_entry" ? 5 : value === "dropped" ? 4 : value === "rank_up" ? 3 : value === "rank_down" ? 2 : 1;
  return (
    severity(b.changeType) - severity(a.changeType) ||
    (a.currentRank ?? a.previousRank ?? 999999) - (b.currentRank ?? b.previousRank ?? 999999) ||
    a.asin.localeCompare(b.asin)
  );
}

function bsrChangeKey(item: BsrRankHistory): string {
  return [item.sourceType, item.sourceId ?? "", item.marketplace, item.category, item.asin].join("|");
}

function validateNotificationInput(input: NotificationScheduleInput): void {
  if (!input.name?.trim()) {
    throw new Error("Notification name is required");
  }
  if (input.channel !== "email" && input.channel !== "feishu") {
    throw new Error("Notification channel must be email or feishu");
  }
  if (!input.target?.trim()) {
    throw new Error("Notification target is required");
  }
  if (!/^\d{2}:\d{2}$/.test(input.sendTime)) {
    throw new Error("sendTime must be HH:mm");
  }
  const [hour, minute] = input.sendTime.split(":").map(Number);
  if (hour > 23 || minute > 59) {
    throw new Error("sendTime must be HH:mm");
  }
  if (input.status && input.status !== "enabled" && input.status !== "disabled") {
    throw new Error("Notification status must be enabled or disabled");
  }
}

function validateCategoryInput(input: CategoryMonitorInput): void {
  if (!input.name?.trim()) {
    throw new Error("Category name is required");
  }
  if (!input.marketplace?.trim()) {
    throw new Error("Category marketplace is required");
  }
  if (!input.categoryUrl?.trim()) {
    throw new Error("Category URL is required");
  }
  try {
    new URL(input.categoryUrl);
  } catch {
    throw new Error("Category URL must be a valid URL");
  }
  if (input.status && input.status !== "enabled" && input.status !== "disabled") {
    throw new Error("Category status must be enabled or disabled");
  }
}

function normalizeTopN(value: number | undefined): number {
  const parsed = Number(value ?? 100);
  if (!Number.isFinite(parsed)) {
    return 100;
  }
  return Math.min(100, Math.max(1, Math.floor(parsed)));
}

function sqliteBusyTimeoutMs(): number {
  const value = Number(process.env.SQLITE_BUSY_TIMEOUT_MS ?? 10000);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 10000;
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function dedupeActionInsightTargets(db: DatabaseSync): void {
  db.prepare(
    `DELETE FROM amazon_competitor_action_insight
     WHERE id NOT IN (
      SELECT MIN(id)
      FROM amazon_competitor_action_insight
      GROUP BY insight_date,
       source_type,
       COALESCE(source_id, -1),
       category,
       COALESCE(asin, 'brand:' || COALESCE(brand, '')),
       insight_type
     )`
  ).run();
}

function ensureActionInsightTargetIndex(db: DatabaseSync): void {
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_action_insight_unique_target
     ON amazon_competitor_action_insight (
      insight_date,
      source_type,
      COALESCE(source_id, -1),
      category,
      COALESCE(asin, 'brand:' || COALESCE(brand, '')),
      insight_type
     )`
  );
}

function runStoreMigrationOnce(db: DatabaseSync, key: string, work: () => void): void {
  const existing = db.prepare("SELECT metadata_value FROM amazon_schema_metadata WHERE metadata_key = ?").get(key);
  if (existing) {
    return;
  }
  work();
  db.prepare(
    `INSERT OR REPLACE INTO amazon_schema_metadata (metadata_key, metadata_value, updated_at)
     VALUES (?, 'done', ?)`
  ).run(key, new Date().toISOString());
}

function backfillBsrRankHistory(db: DatabaseSync): void {
  const categoryBackfill = db.prepare(
    `INSERT OR IGNORE INTO amazon_bsr_rank_history
     (snapshot_date, source_type, source_id, source_name, marketplace, asin, title, brand, category,
      rank_no, rank_url, product_url, current_price, parent_rank, is_specific_rank)
     SELECT
      s.snapshot_date,
      'category_bestseller',
      s.category_id,
      s.category_name,
      s.marketplace,
      s.asin,
      COALESCE(s.title, s.asin),
      s.brand,
      s.category_name,
      s.rank_no,
      c.category_url,
      s.product_url,
      s.current_price,
      NULL,
      1
     FROM amazon_bestseller_rank_snapshot s
     LEFT JOIN amazon_bestseller_category_monitor c ON c.id = s.category_id
     WHERE s.asin IS NOT NULL AND s.category_name IS NOT NULL`
  );
  const keywordRows = db
    .prepare(
      `SELECT keyword_id, keyword, marketplace, snapshot_date, asin, title, brand, product_url, current_price, bestseller_ranks_json
       FROM amazon_keyword_serp_snapshot
       WHERE asin IS NOT NULL AND bestseller_ranks_json IS NOT NULL AND bestseller_ranks_json <> ''`
    )
    .all() as Array<{
    keyword_id: number;
    keyword: string;
    marketplace: string;
    snapshot_date: string;
    asin: string;
    title: string | null;
    brand: string | null;
    product_url: string | null;
    current_price: number | null;
    bestseller_ranks_json: string | null;
  }>;
  const keywordBackfill = db.prepare(
    `INSERT OR IGNORE INTO amazon_bsr_rank_history
     (snapshot_date, source_type, source_id, source_name, marketplace, asin, title, brand, category,
      rank_no, rank_url, product_url, current_price, parent_rank, is_specific_rank)
     VALUES (?, 'keyword_detail', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  withTransaction(db, () => {
    categoryBackfill.run();
    for (const row of keywordRows) {
      const ranks = parseJsonArray<ProductRanking>(row.bestseller_ranks_json);
      const specific = selectSpecificBestsellerRank(ranks);
      const parentRank = ranks[0]?.rank ?? null;
      for (const rank of ranks) {
        if (!rank.category || !Number.isFinite(rank.rank) || rank.rank <= 0) {
          continue;
        }
        keywordBackfill.run(
          row.snapshot_date,
          row.keyword_id,
          row.keyword,
          row.marketplace,
          row.asin,
          row.title ?? row.asin,
          row.brand,
          rank.category,
          Math.floor(rank.rank),
          rank.url ?? null,
          row.product_url,
          row.current_price,
          parentRank,
          specific?.category === rank.category && specific.rank === rank.rank ? 1 : 0
        );
      }
    }
  });
}

function backfillBsrSnapshotQuality(db: DatabaseSync): void {
  const scopes = db
    .prepare(
      `SELECT DISTINCT h.snapshot_date, h.source_type, h.source_id
       FROM amazon_bsr_rank_history h
       LEFT JOIN amazon_bsr_snapshot_quality q
        ON q.snapshot_date = h.snapshot_date
        AND q.source_type = h.source_type
        AND COALESCE(q.source_id, -1) = COALESCE(h.source_id, -1)
        AND q.category = h.category
       WHERE q.id IS NULL
       ORDER BY h.snapshot_date, h.source_type, h.source_id`
    )
    .all() as Array<{ snapshot_date: string; source_type: BsrSourceType; source_id: number | null }>;

  if (scopes.length === 0) {
    return;
  }

  withTransaction(db, () => {
    for (const scope of scopes) {
      upsertBsrSnapshotQualityForScope(db, scope.source_type, scope.source_id, scope.snapshot_date);
    }
  });
}

function refreshBsrSnapshotQuality(db: DatabaseSync): void {
  const scopes = db
    .prepare(
      `SELECT DISTINCT snapshot_date, source_type, source_id
       FROM amazon_bsr_rank_history
       ORDER BY snapshot_date, source_type, source_id`
    )
    .all() as Array<{ snapshot_date: string; source_type: BsrSourceType; source_id: number | null }>;

  withTransaction(db, () => {
    for (const scope of scopes) {
      upsertBsrSnapshotQualityForScope(db, scope.source_type, scope.source_id, scope.snapshot_date);
    }
  });
}

function upsertBsrSnapshotQualityForScope(db: DatabaseSync, sourceType: BsrSourceType, sourceId: number | null, date: string): void {
  const sourceClause = sourceId === null ? "source_id IS NULL" : "source_id = ?";
  const params: SQLInputValue[] = sourceId === null ? [date, sourceType] : [date, sourceType, sourceId];
  const rows = db
    .prepare(
      `SELECT
        snapshot_date,
        source_type,
        source_id,
        source_name,
        marketplace,
        category,
        COUNT(*) AS actual_count,
        COUNT(DISTINCT asin) AS unique_asin_count,
        COUNT(DISTINCT rank_no) AS unique_rank_count,
        MIN(rank_no) AS min_rank,
        MAX(rank_no) AS max_rank,
        GROUP_CONCAT(rank_no) AS ranks_csv
       FROM amazon_bsr_rank_history
       WHERE snapshot_date = ? AND source_type = ? AND ${sourceClause}
       GROUP BY snapshot_date, source_type, source_id, source_name, marketplace, category`
    )
    .all(...params) as Array<{
    snapshot_date: string;
    source_type: BsrSourceType;
    source_id: number | null;
    source_name: string;
    marketplace: string;
    category: string;
    actual_count: number;
    unique_asin_count: number;
    unique_rank_count: number;
    min_rank: number | null;
    max_rank: number | null;
    ranks_csv: string | null;
  }>;

  const stmt = db.prepare(
    bsrSnapshotQualityUpsertSql()
  );

  for (const row of rows) {
    const expectedCount = expectedBsrCount(db, row.source_type, row.source_id);
    const quality = bsrQualityFromCounts(
      row.actual_count,
      row.unique_asin_count,
      row.unique_rank_count,
      row.min_rank,
      row.max_rank,
      expectedCount,
      parseRankCsv(row.ranks_csv)
    );
    runBsrSnapshotQualityUpsert(stmt, {
      snapshotDate: row.snapshot_date,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceName: row.source_name,
      marketplace: row.marketplace,
      category: row.category,
      expectedCount,
      actualCount: row.actual_count,
      uniqueAsinCount: row.unique_asin_count,
      uniqueRankCount: row.unique_rank_count,
      minRank: row.min_rank,
      maxRank: row.max_rank,
      qualityStatus: quality.status,
      issue: quality.issue
    });
  }
}

function upsertBsrSnapshotQuality(
  db: DatabaseSync,
  input: Omit<BsrSnapshotQuality, "id" | "createdAt">,
  options: { preserveExistingOk?: boolean } = {}
): void {
  runBsrSnapshotQualityUpsert(db.prepare(bsrSnapshotQualityUpsertSql(options.preserveExistingOk)), input);
}

function bsrSnapshotQualityUpsertSql(preserveExistingOk = false): string {
  return `INSERT INTO amazon_bsr_snapshot_quality
   (snapshot_date, source_type, source_id, source_name, marketplace, category, expected_count,
    actual_count, unique_asin_count, unique_rank_count, min_rank, max_rank, quality_status, issue)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(snapshot_date, source_type, source_id, category) DO UPDATE SET
    source_name = excluded.source_name,
    marketplace = excluded.marketplace,
    expected_count = excluded.expected_count,
    actual_count = excluded.actual_count,
    unique_asin_count = excluded.unique_asin_count,
    unique_rank_count = excluded.unique_rank_count,
    min_rank = excluded.min_rank,
    max_rank = excluded.max_rank,
    quality_status = excluded.quality_status,
    issue = excluded.issue${preserveExistingOk ? " WHERE amazon_bsr_snapshot_quality.quality_status <> 'ok' OR excluded.quality_status = 'ok'" : ""}`;
}

function runBsrSnapshotQualityUpsert(stmt: ReturnType<DatabaseSync["prepare"]>, input: Omit<BsrSnapshotQuality, "id" | "createdAt">): void {
  stmt.run(
    input.snapshotDate,
    input.sourceType,
    input.sourceId,
    input.sourceName,
    input.marketplace,
    input.category,
    input.expectedCount,
    input.actualCount,
    input.uniqueAsinCount,
    input.uniqueRankCount,
    input.minRank,
    input.maxRank,
    input.qualityStatus,
    input.issue
  );
}

function expectedBsrCount(db: DatabaseSync, sourceType: BsrSourceType, sourceId: number | null): number | null {
  if (sourceType !== "category_bestseller" || sourceId === null) {
    return null;
  }
  const row = db.prepare("SELECT crawl_top_n FROM amazon_bestseller_category_monitor WHERE id = ?").get(sourceId) as
    | { crawl_top_n: number | null }
    | undefined;
  return row?.crawl_top_n ?? 100;
}

function bsrQualityFromCounts(
  actualCount: number,
  uniqueAsinCount: number,
  uniqueRankCount: number,
  minRank: number | null,
  maxRank: number | null,
  expectedCount: number | null,
  ranks: number[] = []
): { status: BsrSnapshotQuality["qualityStatus"]; issue: string | null } {
  if (actualCount <= 0) {
    return { status: "empty", issue: "No BSR rows were saved for this scope." };
  }
  if (expectedCount !== null && actualCount < expectedCount) {
    const detail = describeRankCoverageGaps(ranks, expectedCount);
    return { status: "partial", issue: `Expected ${expectedCount} rows, saved ${actualCount}.${detail ? ` ${detail}` : ""}` };
  }
  if (expectedCount !== null && uniqueAsinCount < expectedCount) {
    return { status: "partial", issue: `Expected ${expectedCount} unique ASINs, saved ${uniqueAsinCount}.` };
  }
  if (expectedCount !== null && uniqueRankCount < expectedCount) {
    const detail = describeRankCoverageGaps(ranks, expectedCount);
    return { status: "partial", issue: `Expected ${expectedCount} unique ranks, saved ${uniqueRankCount}.${detail ? ` ${detail}` : ""}` };
  }
  if (expectedCount !== null && minRank !== null && minRank !== 1) {
    return { status: "partial", issue: `Expected rank coverage to start at #1, started at #${minRank}.` };
  }
  if (expectedCount !== null && maxRank !== null && maxRank !== expectedCount) {
    return { status: "partial", issue: `Expected max rank ${expectedCount}, saved max rank ${maxRank}.` };
  }
  return { status: "ok", issue: null };
}

function parseRankCsv(value: string | null): number[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => Number(item))
    .filter((rank) => Number.isFinite(rank) && rank > 0);
}

function pruneLowQualityCategoryActionInsights(db: DatabaseSync): void {
  db.prepare(
    `DELETE FROM amazon_competitor_action_insight
     WHERE source_type = 'category_bestseller'
      AND EXISTS (
        SELECT 1
        FROM amazon_bsr_snapshot_quality q
        WHERE q.snapshot_date = amazon_competitor_action_insight.insight_date
          AND q.source_type = amazon_competitor_action_insight.source_type
          AND q.source_id = amazon_competitor_action_insight.source_id
          AND q.category = amazon_competitor_action_insight.category
          AND q.quality_status <> 'ok'
      )`
  ).run();
}

function backfillCompetitorActionInsights(db: DatabaseSync): void {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM amazon_competitor_action_insight").get() as { count: number };
  if (existing.count > 0) {
    return;
  }

  const scopes = db
    .prepare(
      `SELECT DISTINCT snapshot_date, source_type, source_id
       FROM amazon_bsr_rank_history
       ORDER BY snapshot_date, source_type, source_id`
    )
    .all() as Array<{ snapshot_date: string; source_type: BsrSourceType; source_id: number | null }>;

  for (const scope of scopes) {
    upsertCompetitorActionInsights(db, buildCompetitorActionInsightsForScope(db, scope));
  }
}

function refreshCategoryActionInsightsForQualityRules(db: DatabaseSync): void {
  const scopes = db
    .prepare(
      `SELECT DISTINCT snapshot_date, source_type, source_id
       FROM amazon_bsr_rank_history
       WHERE source_type = 'category_bestseller'
       ORDER BY snapshot_date, source_id`
    )
    .all() as Array<{ snapshot_date: string; source_type: BsrSourceType; source_id: number | null }>;

  for (const scope of scopes) {
    replaceCompetitorActionInsightsForScope(db, {
      sourceType: scope.source_type,
      sourceId: scope.source_id,
      date: scope.snapshot_date,
      items: buildCompetitorActionInsightsForScope(db, scope)
    });
  }
}

function refreshActionInsightsForTraceability(db: DatabaseSync): void {
  const scopes = db
    .prepare(
      `SELECT DISTINCT snapshot_date, source_type, source_id
       FROM amazon_bsr_rank_history
       ORDER BY snapshot_date, source_type, source_id`
    )
    .all() as Array<{ snapshot_date: string; source_type: BsrSourceType; source_id: number | null }>;

  for (const scope of scopes) {
    replaceCompetitorActionInsightsForScope(db, {
      sourceType: scope.source_type,
      sourceId: scope.source_id,
      date: scope.snapshot_date,
      items: buildCompetitorActionInsightsForScope(db, scope)
    });
  }
}

function buildCompetitorActionInsightsForScope(
  db: DatabaseSync,
  scope: { snapshot_date: string; source_type: BsrSourceType; source_id: number | null }
): CompetitorActionInsight[] {
  if (!canWriteActionInsightsForScope(db, scope.source_type, scope.source_id, scope.snapshot_date)) {
    return [];
  }
  const sourceId = scope.source_id ?? undefined;
  const today = listUsableBsrRankHistoryRows(db, {
    date: scope.snapshot_date,
    sourceType: scope.source_type,
    sourceId
  });
  if (!today.length) {
    return [];
  }
  const previousDate = previousUsableBsrDate(db, {
    beforeDate: scope.snapshot_date,
    sourceType: scope.source_type,
    sourceId
  });
  if (
    !previousDate &&
    hasEarlierBsrHistory(db, {
      beforeDate: scope.snapshot_date,
      sourceType: scope.source_type,
      sourceId
    })
  ) {
    return [];
  }
  const yesterday = previousDate
    ? listUsableBsrRankHistoryRows(db, {
        date: previousDate,
        sourceType: scope.source_type,
        sourceId
      })
    : [];
  const activityEvents =
    scope.source_type === "category_bestseller" && scope.source_id !== null
      ? listActivityEventRows(db, { date: scope.snapshot_date, categoryId: scope.source_id })
      : [];
  return buildCompetitorActionInsights({
    date: scope.snapshot_date,
    bsrChanges: buildBsrRankChanges(scope.snapshot_date, previousDate, today, yesterday),
    activityEvents
  });
}

function replaceCompetitorActionInsightsForScope(
  db: DatabaseSync,
  input: { sourceType: BsrSourceType; sourceId: number | null; date: string; items: CompetitorActionInsight[] }
): void {
  withTransaction(db, () => {
    if (input.sourceId === null) {
      db.prepare("DELETE FROM amazon_competitor_action_insight WHERE source_type = ? AND source_id IS NULL AND insight_date = ?").run(
        input.sourceType,
        input.date
      );
    } else {
      db.prepare("DELETE FROM amazon_competitor_action_insight WHERE source_type = ? AND source_id = ? AND insight_date = ?").run(
        input.sourceType,
        input.sourceId,
        input.date
      );
    }
    if (!canWriteActionInsightsForScope(db, input.sourceType, input.sourceId, input.date)) {
      return;
    }
    upsertCompetitorActionInsights(db, input.items);
  });
}

function canWriteActionInsightsForScope(db: DatabaseSync, sourceType: BsrSourceType, sourceId: number | null, date: string): boolean {
  if (sourceType !== "category_bestseller") {
    return true;
  }
  const sourceClause = sourceId === null ? "source_id IS NULL" : "source_id = ?";
  const params: SQLInputValue[] = sourceId === null ? [date, sourceType] : [date, sourceType, sourceId];
  const row = db
    .prepare(
      `SELECT COUNT(*) AS bad_count
       FROM amazon_bsr_snapshot_quality
       WHERE snapshot_date = ? AND source_type = ? AND ${sourceClause} AND quality_status <> 'ok'`
    )
    .get(...params) as { bad_count: number } | undefined;
  return (row?.bad_count ?? 0) === 0;
}

function upsertCompetitorActionInsights(db: DatabaseSync, items: CompetitorActionInsight[]): void {
  if (!items.length) {
    return;
  }
  const stmt = db.prepare(
    `INSERT INTO amazon_competitor_action_insight
     (insight_date, previous_date, source_type, source_id, source_name, marketplace, category, asin, brand, title,
      insight_type, confidence, current_rank, previous_rank, rank_change, price, product_url, evidence, inferred_action, suggested_response)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO UPDATE SET
      previous_date = excluded.previous_date,
      source_name = excluded.source_name,
      marketplace = excluded.marketplace,
      brand = excluded.brand,
      title = excluded.title,
      confidence = excluded.confidence,
      current_rank = excluded.current_rank,
      previous_rank = excluded.previous_rank,
      rank_change = excluded.rank_change,
      price = excluded.price,
      product_url = excluded.product_url,
      evidence = excluded.evidence,
      inferred_action = excluded.inferred_action,
      suggested_response = excluded.suggested_response`
  );
  for (const item of items) {
    stmt.run(
      item.insightDate,
      item.previousDate ?? null,
      item.sourceType,
      item.sourceId,
      item.sourceName,
      item.marketplace,
      item.category,
      item.asin,
      item.brand,
      item.title,
      item.insightType,
      item.confidence,
      item.currentRank,
      item.previousRank,
      item.rankChange,
      item.price,
      item.productUrl,
      item.evidence,
      item.inferredAction,
      item.suggestedResponse
    );
  }
}

function listBsrRankHistoryRows(
  db: DatabaseSync,
  filter: { date: string; sourceType: BsrSourceType; sourceId?: number; category?: string }
): BsrRankHistory[] {
  const { sql: where, params } = buildWhere(
    whereEq("snapshot_date", filter.date),
    whereEq("source_type", filter.sourceType),
    whereEq("source_id", filter.sourceId),
    whereEq("category", filter.category)
  );
  return (
    db
      .prepare(
        `SELECT * FROM amazon_bsr_rank_history ${where}
         ORDER BY snapshot_date DESC, source_type, source_id, category, rank_no`
      )
      .all(...params) as unknown as BsrRankHistoryRow[]
  ).map(mapBsrRankHistory);
}

function listUsableBsrRankHistoryRows(
  db: DatabaseSync,
  filter: { date: string; sourceType?: BsrSourceType; sourceId?: number; category?: string }
): BsrRankHistory[] {
  const { sql: where, params } = buildWhere(
    whereEq("h.snapshot_date", filter.date),
    whereEq("h.source_type", filter.sourceType),
    whereEq("h.source_id", filter.sourceId),
    whereEq("h.category", filter.category),
    {
      clause: `(h.source_type <> 'category_bestseller' OR EXISTS (
        SELECT 1
        FROM amazon_bsr_snapshot_quality q
        WHERE q.snapshot_date = h.snapshot_date
          AND q.source_type = h.source_type
          AND q.source_id = h.source_id
          AND q.category = h.category
          AND q.quality_status = 'ok'
      ))`
    }
  );
  return (
    db
      .prepare(
        `SELECT h.* FROM amazon_bsr_rank_history h ${where}
         ORDER BY h.snapshot_date DESC, h.source_type, h.source_id, h.category, h.rank_no`
      )
      .all(...params) as unknown as BsrRankHistoryRow[]
  ).map(mapBsrRankHistory);
}

function listActivityEventRows(db: DatabaseSync, filter: { date: string; categoryId: number }): CompetitorActivityEvent[] {
  return (
    db
      .prepare(
        `SELECT * FROM amazon_competitor_activity_event
         WHERE event_date = ? AND category_id = ?
         ORDER BY event_date DESC, id DESC`
      )
      .all(filter.date, filter.categoryId) as unknown as ActivityEventRow[]
  ).map(mapActivityEvent);
}

function withTransaction(db: DatabaseSync, work: () => void): void {
  db.exec("BEGIN");
  try {
    work();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

type WhereBuilder = { clause: string; param?: SQLInputValue };

function buildWhere(...conditions: Array<WhereBuilder | WhereBuilder[] | null | undefined>): { sql: string; params: SQLInputValue[] } {
  const flat: WhereBuilder[] = [];
  for (const cond of conditions) {
    if (!cond) continue;
    if (Array.isArray(cond)) {
      for (const item of cond) {
        if (item) flat.push(item);
      }
    } else {
      flat.push(cond);
    }
  }
  const sql = flat.length ? `WHERE ${flat.map((c) => c.clause).join(" AND ")}` : "";
  const params: SQLInputValue[] = [];
  for (const c of flat) {
    if (c.param !== undefined) {
      params.push(c.param);
    }
  }
  return { sql, params };
}

function whereEq(column: string, value: unknown): WhereBuilder | null {
  if (value === undefined || value === null) return null;
  return { clause: `${column} = ?`, param: value as SQLInputValue };
}

function whereLte(column: string, value: unknown): WhereBuilder | null {
  if (value === undefined || value === null) return null;
  return { clause: `${column} <= ?`, param: value as SQLInputValue };
}

function whereGte(column: string, value: unknown): WhereBuilder | null {
  if (value === undefined || value === null) return null;
  return { clause: `${column} >= ?`, param: value as SQLInputValue };
}

function buildCalendarFilterClauses(asin: string, marketplace?: string, toDate?: string, fromDate?: string): { sql: string; params: SQLInputValue[] } {
  return buildWhere(whereEq("asin", asin), whereEq("marketplace", marketplace), whereLte("snapshot_date", toDate), whereGte("snapshot_date", fromDate));
}

interface BsrRankHistoryRow {
  id: number;
  snapshot_date: string;
  source_type: BsrSourceType;
  source_id: number | null;
  source_name: string;
  marketplace: string;
  asin: string;
  title: string;
  brand: string | null;
  category: string;
  rank_no: number;
  rank_url: string | null;
  product_url: string | null;
  current_price: number | null;
  parent_rank: number | null;
  is_specific_rank: number;
  created_at: string;
}

function mapBsrRankHistory(row: BsrRankHistoryRow): BsrRankHistory {
  return {
    id: row.id,
    snapshotDate: row.snapshot_date,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceName: row.source_name,
    marketplace: row.marketplace,
    asin: row.asin,
    title: row.title,
    brand: row.brand,
    category: row.category,
    rank: row.rank_no,
    rankUrl: row.rank_url,
    productUrl: row.product_url,
    currentPrice: row.current_price,
    parentRank: row.parent_rank,
    isSpecificRank: Boolean(row.is_specific_rank),
    createdAt: row.created_at
  };
}

interface BsrSnapshotQualityRow {
  id: number;
  snapshot_date: string;
  source_type: BsrSourceType;
  source_id: number | null;
  source_name: string;
  marketplace: string;
  category: string;
  expected_count: number | null;
  actual_count: number;
  unique_asin_count: number;
  unique_rank_count: number;
  min_rank: number | null;
  max_rank: number | null;
  quality_status: BsrSnapshotQuality["qualityStatus"];
  issue: string | null;
  created_at: string;
}

function mapBsrSnapshotQuality(row: BsrSnapshotQualityRow): BsrSnapshotQuality {
  return {
    id: row.id,
    snapshotDate: row.snapshot_date,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceName: row.source_name,
    marketplace: row.marketplace,
    category: row.category,
    expectedCount: row.expected_count,
    actualCount: row.actual_count,
    uniqueAsinCount: row.unique_asin_count,
    uniqueRankCount: row.unique_rank_count,
    minRank: row.min_rank,
    maxRank: row.max_rank,
    qualityStatus: row.quality_status,
    issue: row.issue,
    createdAt: row.created_at
  };
}

interface KeywordRow {
  id: number;
  keyword: string;
  marketplace: string;
  zip_code: string | null;
  language: string | null;
  category_tag: string | null;
  crawl_pages: number;
  status: number;
  last_collected_at: string | null;
  today_status: "success" | "failed" | "pending";
  created_at: string;
  updated_at: string;
}

function mapKeyword(row: KeywordRow): KeywordMonitor {
  return {
    id: row.id,
    keyword: row.keyword,
    marketplace: row.marketplace,
    zipCode: row.zip_code,
    language: row.language,
    categoryTag: row.category_tag,
    crawlPages: row.crawl_pages,
    status: row.status === 1 ? "enabled" : "disabled",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastCollectedAt: row.last_collected_at,
    todayStatus: row.today_status
  };
}

interface CategoryMonitorRow {
  id: number;
  name: string;
  marketplace: string;
  category_url: string;
  category_path: string | null;
  crawl_top_n: number;
  status: number;
  last_collected_at: string | null;
  today_status: "success" | "failed" | "pending";
  created_at: string;
  updated_at: string;
}

function mapCategoryMonitor(row: CategoryMonitorRow): CategoryMonitor {
  return {
    id: row.id,
    name: row.name,
    marketplace: row.marketplace,
    categoryUrl: row.category_url,
    categoryPath: row.category_path,
    crawlTopN: row.crawl_top_n,
    status: row.status === 1 ? "enabled" : "disabled",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastCollectedAt: row.last_collected_at,
    todayStatus: row.today_status
  };
}

interface BestsellerSnapshotRow {
  id: number;
  category_id: number;
  category_name: string;
  marketplace: string;
  snapshot_date: string;
  rank_no: number;
  asin: string;
  title: string;
  brand: string | null;
  image_url: string;
  product_url: string;
  current_price: number | null;
  original_price: number | null;
  coupon_text: string | null;
  coupon_value: number | null;
  coupon_rate: number | null;
  final_estimated_price: number | null;
  currency: string;
  rating: number | null;
  review_count: number | null;
  is_prime: number;
  deal_badge: string | null;
  bsr_rank: number | null;
  bsr_category: string | null;
  created_at: string;
}

function mapBestsellerSnapshot(row: BestsellerSnapshotRow): BestsellerRankSnapshot {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    marketplace: row.marketplace,
    snapshotDate: row.snapshot_date,
    rank: row.rank_no,
    asin: row.asin,
    title: row.title,
    brand: row.brand,
    imageUrl: row.image_url,
    productUrl: row.product_url,
    currentPrice: row.current_price,
    originalPrice: row.original_price,
    couponText: row.coupon_text,
    couponValue: row.coupon_value,
    couponRate: row.coupon_rate,
    finalEstimatedPrice: row.final_estimated_price,
    currency: row.currency,
    rating: row.rating,
    reviewCount: row.review_count,
    isPrime: Boolean(row.is_prime),
    dealBadge: row.deal_badge,
    bsrRank: row.bsr_rank,
    bsrCategory: row.bsr_category,
    createdAt: row.created_at
  };
}

interface BrandMatrixRow {
  id: number;
  category_id: number;
  category_name: string;
  marketplace: string;
  snapshot_date: string;
  brand: string;
  product_count_top100: number;
  product_count_top50: number;
  product_count_top20: number;
  best_rank: number | null;
  average_rank: number | null;
  new_entry_count: number;
  dropped_count: number;
  rank_up_count: number;
  rank_down_count: number;
  price_down_count: number;
  coupon_count: number;
  deal_count: number;
  top_asins_json: string | null;
  created_at: string;
}

function mapBrandMatrix(row: BrandMatrixRow): BrandMatrixSnapshot {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    marketplace: row.marketplace,
    snapshotDate: row.snapshot_date,
    brand: row.brand,
    productCountTop100: row.product_count_top100,
    productCountTop50: row.product_count_top50,
    productCountTop20: row.product_count_top20,
    bestRank: row.best_rank,
    averageRank: row.average_rank,
    newEntryCount: row.new_entry_count,
    droppedCount: row.dropped_count,
    rankUpCount: row.rank_up_count,
    rankDownCount: row.rank_down_count,
    priceDownCount: row.price_down_count,
    couponCount: row.coupon_count,
    dealCount: row.deal_count,
    topAsins: parseJsonArray<string>(row.top_asins_json),
    createdAt: row.created_at
  };
}

interface ProductPriceHistoryRow {
  id: number;
  snapshot_date: string;
  category_id: number;
  category_name: string;
  marketplace: string;
  asin: string;
  brand: string | null;
  title: string;
  current_price: number | null;
  coupon_value: number | null;
  coupon_rate: number | null;
  final_estimated_price: number | null;
  t30_low_price: number | null;
  t60_low_price: number | null;
  t90_low_price: number | null;
  monitoring_low_price: number | null;
  created_at: string;
}

function mapProductPriceHistory(row: ProductPriceHistoryRow): ProductPriceHistory {
  return {
    id: row.id,
    snapshotDate: row.snapshot_date,
    categoryId: row.category_id,
    categoryName: row.category_name,
    marketplace: row.marketplace,
    asin: row.asin,
    brand: row.brand,
    title: row.title,
    currentPrice: row.current_price,
    couponValue: row.coupon_value,
    couponRate: row.coupon_rate,
    finalEstimatedPrice: row.final_estimated_price,
    t30LowPrice: row.t30_low_price,
    t60LowPrice: row.t60_low_price,
    t90LowPrice: row.t90_low_price,
    monitoringLowPrice: row.monitoring_low_price,
    createdAt: row.created_at
  };
}

interface CategorySignalRow {
  id: number;
  signal_date: string;
  category_id: number;
  category_name: string;
  marketplace: string;
  signal_type: CategorySignalLog["signalType"];
  alert_level: AlertLevel;
  asin: string | null;
  brand: string | null;
  title: string | null;
  rank_no: number | null;
  previous_rank: number | null;
  price: number | null;
  previous_price: number | null;
  content: string;
  created_at: string;
}

function mapCategorySignal(row: CategorySignalRow): CategorySignalLog {
  return {
    id: row.id,
    signalDate: row.signal_date,
    categoryId: row.category_id,
    categoryName: row.category_name,
    marketplace: row.marketplace,
    signalType: row.signal_type,
    alertLevel: row.alert_level,
    asin: row.asin,
    brand: row.brand,
    title: row.title,
    rank: row.rank_no,
    previousRank: row.previous_rank,
    price: row.price,
    previousPrice: row.previous_price,
    content: row.content,
    createdAt: row.created_at
  };
}

interface ActivityEventRow {
  id: number;
  event_key: string;
  event_date: string;
  event_type: CompetitorActivityEvent["eventType"];
  event_level: AlertLevel;
  category_id: number;
  category_name: string;
  marketplace: string;
  asin: string | null;
  brand: string | null;
  title: string | null;
  price_before: number | null;
  price_after: number | null;
  price_change_rate: number | null;
  coupon_before: string | null;
  coupon_after: string | null;
  deal_type: string | null;
  rank_before: number | null;
  rank_after: number | null;
  rank_change: number | null;
  keyword_rank_before: number | null;
  keyword_rank_after: number | null;
  event_summary: string;
  possible_strategy: string;
  suggested_action: string;
  created_at: string;
}

function mapActivityEvent(row: ActivityEventRow): CompetitorActivityEvent {
  return {
    id: row.id,
    eventKey: row.event_key,
    eventDate: row.event_date,
    eventType: row.event_type,
    eventLevel: row.event_level,
    categoryId: row.category_id,
    categoryName: row.category_name,
    marketplace: row.marketplace,
    asin: row.asin,
    brand: row.brand,
    title: row.title,
    priceBefore: row.price_before,
    priceAfter: row.price_after,
    priceChangeRate: row.price_change_rate,
    couponBefore: row.coupon_before,
    couponAfter: row.coupon_after,
    dealType: row.deal_type,
    rankBefore: row.rank_before,
    rankAfter: row.rank_after,
    rankChange: row.rank_change,
    keywordRankBefore: row.keyword_rank_before,
    keywordRankAfter: row.keyword_rank_after,
    eventSummary: row.event_summary,
    possibleStrategy: row.possible_strategy,
    suggestedAction: row.suggested_action,
    createdAt: row.created_at
  };
}

interface ActionInsightRow {
  id: number;
  insight_date: string;
  previous_date: string | null;
  source_type: BsrSourceType;
  source_id: number | null;
  source_name: string;
  marketplace: string;
  category: string;
  asin: string | null;
  brand: string | null;
  title: string | null;
  insight_type: CompetitorActionInsight["insightType"];
  confidence: CompetitorActionInsight["confidence"];
  current_rank: number | null;
  previous_rank: number | null;
  rank_change: number | null;
  price: number | null;
  product_url: string | null;
  evidence: string;
  inferred_action: string;
  suggested_response: string;
  created_at: string;
}

function mapActionInsight(row: ActionInsightRow): CompetitorActionInsight {
  return {
    id: row.id,
    insightDate: row.insight_date,
    previousDate: row.previous_date,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceName: row.source_name,
    marketplace: row.marketplace,
    category: row.category,
    asin: row.asin,
    brand: row.brand,
    title: row.title,
    insightType: row.insight_type,
    confidence: row.confidence,
    currentRank: row.current_rank,
    previousRank: row.previous_rank,
    rankChange: row.rank_change,
    price: row.price,
    productUrl: row.product_url,
    evidence: row.evidence,
    inferredAction: row.inferred_action,
    suggestedResponse: row.suggested_response,
    createdAt: row.created_at
  };
}

interface SnapshotRow {
  id: number;
  keyword_id: number;
  keyword: string;
  marketplace: string;
  snapshot_date: string;
  page_no: number;
  position_in_page: number;
  absolute_rank: number;
  organic_rank: number | null;
  sponsored_rank: number | null;
  asin: string;
  title: string;
  brand: string | null;
  image_url: string;
  product_url: string;
  current_price: number | null;
  original_price: number | null;
  coupon_text: string | null;
  coupon_value: number | null;
  coupon_rate: number | null;
  final_estimated_price: number | null;
  currency: string;
  rating: number | null;
  review_count: number | null;
  is_sponsored: number;
  is_prime: number;
  deal_badge: string | null;
  delivery_text: string | null;
  bsr_rank: number | null;
  bsr_category: string | null;
  bsr_text: string | null;
  bestseller_ranks_json: string | null;
  detail_collected_at: string | null;
  created_at: string;
}

function mapSnapshot(row: SnapshotRow): SerpSnapshot {
  const bestsellerRanks = parseJsonArray<ProductRanking>(row.bestseller_ranks_json);
  const specificBsr = selectSpecificBestsellerRank(bestsellerRanks);
  return {
    id: row.id,
    keywordId: row.keyword_id,
    keyword: row.keyword,
    marketplace: row.marketplace,
    snapshotDate: row.snapshot_date,
    pageNo: row.page_no,
    positionInPage: row.position_in_page,
    absoluteRank: row.absolute_rank,
    organicRank: row.organic_rank,
    sponsoredRank: row.sponsored_rank,
    asin: row.asin,
    title: row.title,
    brand: row.brand,
    imageUrl: row.image_url,
    productUrl: row.product_url,
    currentPrice: row.current_price,
    originalPrice: row.original_price,
    couponText: row.coupon_text,
    couponValue: row.coupon_value,
    couponRate: row.coupon_rate,
    finalEstimatedPrice: row.final_estimated_price,
    currency: row.currency,
    rating: row.rating,
    reviewCount: row.review_count,
    isSponsored: Boolean(row.is_sponsored),
    isPrime: Boolean(row.is_prime),
    dealBadge: row.deal_badge,
    deliveryText: row.delivery_text,
    bsrRank: specificBsr?.rank ?? row.bsr_rank,
    bsrCategory: specificBsr?.category ?? row.bsr_category,
    bsrText: row.bsr_text,
    bestsellerRanks,
    detailCollectedAt: row.detail_collected_at,
    createdAt: row.created_at
  };
}

interface CompetitorFolderRow {
  keyword_id: number;
  keyword: string;
  marketplace: string;
  competitor_count: number;
  latest_snapshot_date: string | null;
}

function mapCompetitorFolder(row: CompetitorFolderRow): CompetitorFolder {
  return {
    keywordId: row.keyword_id,
    keyword: row.keyword,
    marketplace: row.marketplace,
    competitorCount: row.competitor_count,
    latestSnapshotDate: row.latest_snapshot_date
  };
}

interface CompetitorRow {
  id: number;
  asin: string;
  marketplace: string;
  title: string;
  brand: string | null;
  image_url: string;
  first_seen_keyword: string;
  first_seen_date: string;
  last_seen_date: string;
  appear_keyword_count: number;
  best_rank: number;
  latest_rank: number;
  lowest_price: number | null;
  latest_price: number | null;
  latest_product_url: string | null;
  latest_bsr_rank: number | null;
  latest_bsr_category: string | null;
  latest_bsr_text: string | null;
  latest_bestseller_ranks_json: string | null;
  source_type: CompetitorPoolItem["sourceType"] | null;
  first_seen_source: string | null;
  latest_category_name: string | null;
  latest_category_rank: number | null;
  competitor_tier: CompetitorTier | null;
  competitor_reasons_json: string | null;
  is_key_competitor: number;
  status: number;
  created_at: string;
  updated_at: string;
}

function mapCompetitor(row: CompetitorRow): CompetitorPoolItem {
  const latestBestsellerRanks = parseJsonArray<ProductRanking>(row.latest_bestseller_ranks_json);
  const specificBsr = selectSpecificBestsellerRank(latestBestsellerRanks);
  return {
    id: row.id,
    asin: row.asin,
    marketplace: row.marketplace,
    title: row.title,
    brand: row.brand,
    imageUrl: row.image_url,
    firstSeenKeyword: row.first_seen_keyword,
    firstSeenDate: row.first_seen_date,
    lastSeenDate: row.last_seen_date,
    appearKeywordCount: row.appear_keyword_count,
    bestRank: row.best_rank,
    latestRank: row.latest_rank,
    lowestPrice: row.lowest_price,
    latestPrice: row.latest_price,
    latestProductUrl: row.latest_product_url ?? `https://www.amazon.com/dp/${row.asin}`,
    latestBsrRank: specificBsr?.rank ?? row.latest_bsr_rank,
    latestBsrCategory: specificBsr?.category ?? row.latest_bsr_category,
    latestBsrText: row.latest_bsr_text,
    latestBestsellerRanks,
    sourceType: normalizeCompetitorSourceType(row.source_type),
    firstSeenSource: row.first_seen_source,
    latestCategoryName: row.latest_category_name,
    latestCategoryRank: row.latest_category_rank,
    competitorTier: normalizeCompetitorTier(row.competitor_tier),
    competitorReasons: parseJsonArray<string>(row.competitor_reasons_json),
    isKeyCompetitor: Boolean(row.is_key_competitor),
    status: row.status === 1 ? "active" : "ignored",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeCompetitorSourceType(value: string | null): CompetitorPoolItem["sourceType"] {
  return value === "category" || value === "hybrid" || value === "keyword" ? value : "keyword";
}

function normalizeCompetitorTier(value: string | null): CompetitorTier {
  return value === "core" || value === "rising" || value === "activity" || value === "watch" ? value : "watch";
}

interface ChangeRow {
  asin: string;
  keyword: string;
  marketplace: string;
  snapshot_date: string;
  yesterday_rank: number | null;
  today_rank: number | null;
  rank_change: number | null;
  yesterday_price: number | null;
  today_price: number | null;
  price_change: number | null;
  price_change_rate: number | null;
  yesterday_sponsored: number | null;
  today_sponsored: number | null;
  change_type: ChangeType;
  title: string;
  brand: string | null;
}

function mapChange(row: ChangeRow): DailyChange {
  return {
    asin: row.asin,
    keyword: row.keyword,
    marketplace: row.marketplace,
    snapshotDate: row.snapshot_date,
    yesterdayRank: row.yesterday_rank,
    todayRank: row.today_rank,
    rankChange: row.rank_change,
    yesterdayPrice: row.yesterday_price,
    todayPrice: row.today_price,
    priceChange: row.price_change,
    priceChangeRate: row.price_change_rate,
    yesterdaySponsored: row.yesterday_sponsored === null ? null : Boolean(row.yesterday_sponsored),
    todaySponsored: row.today_sponsored === null ? null : Boolean(row.today_sponsored),
    changeType: row.change_type,
    title: row.title,
    brand: row.brand
  };
}

interface AlertRow {
  id: number;
  alert_date: string;
  alert_type: string;
  alert_level: AlertLevel;
  keyword: string;
  asin: string;
  title: string;
  brand: string | null;
  alert_content: string;
  old_value: string | null;
  new_value: string | null;
  status: AlertLog["status"];
  created_at: string;
}

function mapAlert(row: AlertRow): AlertLog {
  return {
    id: row.id,
    alertDate: row.alert_date,
    alertType: row.alert_type,
    alertLevel: row.alert_level,
    keyword: row.keyword,
    asin: row.asin,
    title: row.title,
    brand: row.brand,
    alertContent: row.alert_content,
    oldValue: row.old_value,
    newValue: row.new_value,
    status: row.status,
    createdAt: row.created_at
  };
}

interface TaskLogRow {
  id: number;
  task_type: string;
  keyword_id: number | null;
  keyword: string | null;
  marketplace: string | null;
  status: CollectTaskLog["status"];
  start_time: string;
  end_time: string | null;
  page_count: number;
  success_count: number;
  fail_count: number;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

function mapTaskLog(row: TaskLogRow): CollectTaskLog {
  return {
    id: row.id,
    taskType: row.task_type,
    keywordId: row.keyword_id,
    keyword: row.keyword,
    marketplace: row.marketplace,
    status: row.status,
    startTime: row.start_time,
    endTime: row.end_time,
    pageCount: row.page_count,
    successCount: row.success_count,
    failCount: row.fail_count,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    createdAt: row.created_at
  };
}

interface NotificationScheduleRow {
  id: number;
  name: string;
  channel: NotificationSchedule["channel"];
  target: string;
  send_time: string;
  timezone: string;
  status: NotificationSchedule["status"];
  last_sent_at: string | null;
  last_sent_date: string | null;
  last_status: NotificationSchedule["lastStatus"];
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function mapNotificationSchedule(row: NotificationScheduleRow): NotificationSchedule {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    target: row.target,
    sendTime: row.send_time,
    timezone: row.timezone,
    status: row.status,
    lastSentAt: row.last_sent_at,
    lastSentDate: row.last_sent_date,
    lastStatus: row.last_status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

interface NotificationSendLogRow {
  id: number;
  schedule_id: number;
  schedule_name: string;
  channel: NotificationSendLog["channel"];
  target: string;
  report_date: string;
  status: NotificationSendLog["status"];
  message: string | null;
  error_message: string | null;
  sent_at: string;
  created_at: string;
}

function mapNotificationSendLog(row: NotificationSendLogRow): NotificationSendLog {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    scheduleName: row.schedule_name,
    channel: row.channel,
    target: row.target,
    reportDate: row.report_date,
    status: row.status,
    message: row.message,
    errorMessage: row.error_message,
    sentAt: row.sent_at,
    createdAt: row.created_at
  };
}
