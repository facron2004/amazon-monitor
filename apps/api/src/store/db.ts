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
  SCHEMA_VERSION,
  getSchemaVersion,
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
  if (process.env.NODE_ENV !== "production") {
    return "Admin123!";
  }
  const generated = randomBytes(18).toString("base64url");
  console.warn(
    `[Identity] Generated initial admin password for this database: ${generated}. ` +
    "Set ADMIN_INITIAL_PASSWORD to choose it explicitly."
  );
  return generated;
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
  // 创建所有表
  createTables(db);

  // 添加新列（向后兼容旧数据库）
  ensureColumn(db, "amazon_keyword_serp_snapshot", "bsr_rank", "INTEGER");
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

  // 数据清理和索引
  dedupeActionInsightTargets(db);
  ensureActionInsightTargetIndex(db);

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
