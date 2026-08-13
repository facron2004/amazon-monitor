import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createTables } from "./schema.js";
import {
  ensureColumn,
  dedupeActionInsightTargets,
  ensureActionInsightTargetIndex,
  backfillBsrRankHistory,
  backfillBsrSnapshotQuality,
  pruneLowQualityCategoryActionInsights,
  backfillCompetitorActionInsights,
  runStoreMigrationOnce,
  refreshCategoryActionInsightsForQualityRules,
  refreshActionInsightsForTraceability,
  refreshBsrSnapshotQuality,
  backfillProductPriceHistoryPromos,
  migrateInsightOrganizationScope,
  migrateCompetitorPoolOrganizationScope,
  migrateKeywordOperationalOrganizationScope,
  migrateNotificationOrganizationScope,
  migrateSnapshotProvenance,
  migrateKeywordAndDailyChangeUniqueness,
  dedupeKeywordSerpSnapshots,
  dedupeCompetitorDailyChanges,
  ensureKeywordSerpSnapshotUniqueIndex,
  ensureCompetitorDailyChangeUniqueIndex,
  SCHEMA_VERSION,
  setSchemaVersion
} from "./migrations.js";
import { createIdentityStore } from "./identity-store.js";
import { hashPassword, PASSWORD_ALGO } from "./password.js";
import { nowIso } from "./sql-utils.js";

function resolveInitialAdminPassword(): string {
  const configured = process.env.ADMIN_INITIAL_PASSWORD?.trim();
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === "test") {
    return "admin123";
  }
  // The bootstrap route replaces this inaccessible account after proving the
  // one-time setup token. Never print the generated secret to logs.
  return randomBytes(18).toString("base64url");
}

function ensureDefaultIdentity(db: DatabaseSync): void {
  const userCountRow = db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number };
  if (userCountRow.cnt > 0) return;

  const identity = createIdentityStore(db);
  const org = identity.listOrganizations().find((item) => item.name === "Default Organization")
    ?? identity.createOrganization({ name: "Default Organization", plan: "standard" });
  const { hash } = hashPassword(resolveInitialAdminPassword());
  db.prepare(
    `INSERT INTO users (org_id, username, password_hash, password_algo, role, display_name, status, created_at, updated_at)
     VALUES (?, 'admin', ?, ?, 'admin', 'Administrator', 'active', ?, ?)`
  ).run(org.id, hash, PASSWORD_ALGO, nowIso(), nowIso());
}

/**
 * SQLite 繁忙超时配置（毫秒）
 */
export function sqliteBusyTimeoutMs(): number {
  const value = Number(process.env.SQLITE_BUSY_TIMEOUT_MS ?? 10000);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 10000;
}

/**
 * 配置数据库连接参数
 */
export function configureDatabase(db: DatabaseSync): void {
  db.exec(`
    PRAGMA busy_timeout = ${sqliteBusyTimeoutMs()};
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `);
}

/**
 * 初始化数据库 schema 和执行迁移
 */
export function initSchema(db: DatabaseSync): void {
  // 添加新列（向后兼容旧数据库）——在 createTables 之前执行，
  // 避免已有表缺失列导致 CREATE INDEX 失败
  ensureColumn(db, "own_products", "store_id", "INTEGER REFERENCES commerce_stores(id) ON DELETE SET NULL");
  ensureColumn(db, "insight_events", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "asin_watch_states", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_keyword_monitor", "priority", "TEXT NOT NULL DEFAULT 'C'");
  ensureColumn(db, "amazon_keyword_monitor", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_bestseller_category_monitor", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_collect_job_queue", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_collect_job_queue", "lease_owner", "TEXT");
  ensureColumn(db, "amazon_collect_job_queue", "lease_token", "TEXT");
  ensureColumn(db, "amazon_collect_job_queue", "lease_expires_at", "TEXT");
  ensureColumn(db, "amazon_collect_job_queue", "next_attempt_at", "TEXT");
  ensureColumn(db, "amazon_collect_task_log", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_competitor_pool", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_competitor_daily_change", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_alert_log", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_daily_report", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_notification_schedule", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_notification_send_log", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "data_source_sync_runs", "domain", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "trigger", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "mode", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "idempotency_key", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "credential_version", "INTEGER");
  ensureColumn(db, "data_source_sync_runs", "marketplaces_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "data_source_sync_runs", "requested_from_date", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "requested_to_date", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "checkpoint_summary", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "external_request_id", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "retry_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "data_source_sync_runs", "error_code", "TEXT");
  ensureColumn(db, "sp_api_sales_traffic_daily", "source_document_id", "TEXT");
  ensureColumn(db, "sp_api_sales_traffic_daily", "content_hash", "TEXT");
  ensureColumn(db, "sp_api_inventory_snapshots", "inbound_quantity", "INTEGER");
  ensureColumn(db, "sp_api_inventory_snapshots", "source_document_id", "TEXT");
  ensureColumn(db, "sp_api_inventory_snapshots", "content_hash", "TEXT");
  ensureColumn(db, "sp_api_inventory_latest", "inbound_quantity", "INTEGER");
  ensureColumn(db, "sp_api_inventory_latest", "source_document_id", "TEXT");
  ensureColumn(db, "sp_api_inventory_latest", "content_hash", "TEXT");
  db.exec("DROP INDEX IF EXISTS idx_queue_dedup_active");

  // 创建所有表
  createTables(db);
  // Organization-scoped migrations backfill legacy rows to organization 1.
  // Ensure that organization exists before those foreign keys are enforced.
  ensureDefaultIdentity(db);

  // 添加新列（向后兼容旧数据库）——针对新表或已存在表
  ensureColumn(db, "agent_messages", "sdk_item_json", "TEXT");
  ensureColumn(db, "product_inventory_settings", "production_lead_time_days", "REAL");
  ensureColumn(db, "product_inventory_settings", "inbound_lead_time_days", "REAL");
  ensureColumn(db, "product_inventory_settings", "in_transit_units", "INTEGER");
  ensureColumn(db, "product_inventory_settings", "local_warehouse_units", "INTEGER");
  ensureColumn(db, "product_inventory_settings", "expected_arrival_date", "TEXT");
  ensureColumn(db, "amazon_keyword_serp_snapshot", "bsr_rank", "INTEGER");
  ensureColumn(db, "amazon_keyword_monitor", "priority", "TEXT NOT NULL DEFAULT 'C'");
  ensureColumn(db, "amazon_keyword_monitor", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_bestseller_category_monitor", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_collect_job_queue", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_collect_job_queue", "lease_owner", "TEXT");
  ensureColumn(db, "amazon_collect_job_queue", "lease_token", "TEXT");
  ensureColumn(db, "amazon_collect_job_queue", "lease_expires_at", "TEXT");
  ensureColumn(db, "amazon_collect_job_queue", "next_attempt_at", "TEXT");
  ensureColumn(db, "amazon_collect_task_log", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "data_source_sync_runs", "domain", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "trigger", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "mode", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "idempotency_key", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "credential_version", "INTEGER");
  ensureColumn(db, "data_source_sync_runs", "marketplaces_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "data_source_sync_runs", "requested_from_date", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "requested_to_date", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "checkpoint_summary", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "external_request_id", "TEXT");
  ensureColumn(db, "data_source_sync_runs", "retry_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "data_source_sync_runs", "error_code", "TEXT");
  ensureColumn(db, "sp_api_sales_traffic_daily", "source_document_id", "TEXT");
  ensureColumn(db, "sp_api_sales_traffic_daily", "content_hash", "TEXT");
  ensureColumn(db, "sp_api_inventory_snapshots", "inbound_quantity", "INTEGER");
  ensureColumn(db, "sp_api_inventory_snapshots", "source_document_id", "TEXT");
  ensureColumn(db, "sp_api_inventory_snapshots", "content_hash", "TEXT");
  ensureColumn(db, "sp_api_inventory_latest", "inbound_quantity", "INTEGER");
  ensureColumn(db, "sp_api_inventory_latest", "source_document_id", "TEXT");
  ensureColumn(db, "sp_api_inventory_latest", "content_hash", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_keyword_monitor_org_status ON amazon_keyword_monitor(org_id, status, id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_category_monitor_org_status ON amazon_bestseller_category_monitor(org_id, status, id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_collect_task_log_org_id ON amazon_collect_task_log(org_id, id DESC)");
  ensureColumn(db, "amazon_keyword_serp_snapshot", "bsr_category", "TEXT");
  ensureColumn(db, "amazon_keyword_serp_snapshot", "bsr_text", "TEXT");
  ensureColumn(db, "amazon_keyword_serp_snapshot", "bestseller_ranks_json", "TEXT");
  ensureColumn(db, "amazon_keyword_serp_snapshot", "detail_collected_at", "TEXT");
  ensureColumn(db, "amazon_keyword_serp_snapshot", "ice_type", "TEXT");
  ensureColumn(db, "amazon_bestseller_rank_snapshot", "ice_type", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "latest_product_url", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "latest_review_count", "INTEGER");
  ensureColumn(db, "amazon_competitor_pool", "coupon_text", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "deal_badge", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "latest_bsr_rank", "INTEGER");
  ensureColumn(db, "amazon_competitor_pool", "latest_bsr_category", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "latest_bsr_text", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "latest_bestseller_ranks_json", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "source_type", "TEXT DEFAULT 'keyword'");
  ensureColumn(db, "amazon_competitor_pool", "first_seen_source", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "latest_category_name", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "latest_category_rank", "INTEGER");
  ensureColumn(db, "amazon_competitor_pool", "ice_type", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "competitor_tier", "TEXT DEFAULT 'watch'");
  ensureColumn(db, "amazon_competitor_pool", "competitor_reasons_json", "TEXT");
  ensureColumn(db, "amazon_competitor_pool", "org_id", "INTEGER NOT NULL DEFAULT 1");
  migrateCompetitorPoolOrganizationScope(db);
  migrateKeywordOperationalOrganizationScope(db);
  migrateNotificationOrganizationScope(db);
  migrateSnapshotProvenance(db);
  ensureColumn(db, "amazon_product_price_history", "review_count", "INTEGER");
  ensureColumn(db, "amazon_product_price_history", "previous_review_count", "INTEGER");
  ensureColumn(db, "amazon_product_price_history", "review_count_change", "INTEGER");
  ensureColumn(db, "amazon_product_price_history", "ice_type", "TEXT");
  ensureColumn(db, "amazon_product_price_history", "coupon_text", "TEXT");
  ensureColumn(db, "amazon_product_price_history", "deal_badge", "TEXT");
  ensureColumn(db, "amazon_competitor_activity_event", "review_count_before", "INTEGER");
  ensureColumn(db, "amazon_competitor_activity_event", "review_count_after", "INTEGER");
  ensureColumn(db, "amazon_competitor_activity_event", "review_count_change", "INTEGER");
  ensureColumn(db, "amazon_competitor_action_insight", "previous_date", "TEXT");
  ensureColumn(db, "amazon_bsr_snapshot_quality", "unique_rank_count", "INTEGER DEFAULT 0");
  ensureColumn(db, "insight_events", "assignee", "TEXT");
  migrateInsightOrganizationScope(db);
  db.exec("CREATE INDEX IF NOT EXISTS idx_own_products_store ON own_products(store_id)");
  ensureColumn(db, "ai_runs", "org_id", "INTEGER NOT NULL DEFAULT 1");
  db.exec("CREATE INDEX IF NOT EXISTS idx_ai_runs_org_created ON ai_runs(org_id, created_at DESC)");

  // 数据清理和索引
  dedupeActionInsightTargets(db);
  ensureActionInsightTargetIndex(db);
  // Keyword SERP + daily-change uniqueness: always dedupe before unique index creation.
  runStoreMigrationOnce(db, "keyword_daily_change_unique_v1", () => migrateKeywordAndDailyChangeUniqueness(db));
  dedupeKeywordSerpSnapshots(db);
  dedupeCompetitorDailyChanges(db);
  ensureKeywordSerpSnapshotUniqueIndex(db);
  ensureCompetitorDailyChangeUniqueIndex(db);

  // 数据回填
  backfillBsrRankHistory(db);
  backfillBsrSnapshotQuality(db);
  pruneLowQualityCategoryActionInsights(db);
  backfillCompetitorActionInsights(db);

  // 增量迁移（只执行一次）
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
  runStoreMigrationOnce(db, "backfill_product_price_history_promos_v1", () => backfillProductPriceHistoryPromos(db));

  // Stage 0 — identity schema. Seed a default org + admin account when the
  // users table is empty, including legacy API-key deployments.
  runStoreMigrationOnce(db, "identity_v1", () => {
    ensureDefaultIdentity(db);
  });
  runStoreMigrationOnce(db, "identity_default_admin_v2", () => {
    ensureDefaultIdentity(db);
  });

  // 记录当前 schema 版本
  setSchemaVersion(db, SCHEMA_VERSION);
}

/**
 * 打开数据库连接并初始化
 */
export function openDatabase(dbPath: string): DatabaseSync {
  const directory = dirname(dbPath);
  if (directory && directory !== "." && !existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  configureDatabase(db);
  initSchema(db);
  return db;
}
