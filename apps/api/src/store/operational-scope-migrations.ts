import type { DatabaseSync } from "node:sqlite";
import { ensureColumn } from "./migration-utils.js";
import { withTransaction } from "./sql-utils.js";

export function migrateKeywordOperationalOrganizationScope(db: DatabaseSync): void {
  ensureColumn(db, "amazon_competitor_daily_change", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_alert_log", "org_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "amazon_daily_report", "org_id", "INTEGER NOT NULL DEFAULT 1");
  migrateDailyReportTable(db);
  recreateOperationalIndexes(db);
}

function migrateDailyReportTable(db: DatabaseSync): void {
  if (hasOrganizationUniqueKey(db, "amazon_daily_report", ["org_id", "report_date", "keyword"])) return;
  withTransaction(db, () => {
    db.exec(`
      ALTER TABLE amazon_daily_report RENAME TO amazon_daily_report_legacy_org_scope;
      CREATE TABLE amazon_daily_report (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id INTEGER NOT NULL DEFAULT 1 REFERENCES organizations(id),
        report_date TEXT NOT NULL,
        keyword TEXT NOT NULL,
        markdown TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(org_id, report_date, keyword)
      );
      INSERT INTO amazon_daily_report (id, org_id, report_date, keyword, markdown, created_at, updated_at)
      SELECT id, COALESCE(org_id, 1), report_date, keyword, markdown, created_at, updated_at
      FROM amazon_daily_report_legacy_org_scope;
      DROP TABLE amazon_daily_report_legacy_org_scope;
    `);
  });
}

function recreateOperationalIndexes(db: DatabaseSync): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_asin_keyword_date;
    DROP INDEX IF EXISTS idx_daily_change_activity_calendar;
    DROP INDEX IF EXISTS idx_daily_change_date_keyword;
    DROP INDEX IF EXISTS idx_alert_date;
    DROP INDEX IF EXISTS idx_alert_date_status;
    DROP INDEX IF EXISTS idx_alert_date_keyword_status;
    DROP INDEX IF EXISTS idx_alert_asin;
    DROP INDEX IF EXISTS idx_alert_type;
    CREATE INDEX idx_asin_keyword_date ON amazon_competitor_daily_change(org_id, asin, keyword, snapshot_date);
    CREATE INDEX idx_daily_change_activity_calendar ON amazon_competitor_daily_change(org_id, asin, marketplace, snapshot_date);
    CREATE INDEX idx_daily_change_date_keyword ON amazon_competitor_daily_change(org_id, snapshot_date, keyword, created_at DESC, id DESC);
    CREATE INDEX idx_alert_date ON amazon_alert_log(org_id, alert_date);
    CREATE INDEX idx_alert_date_status ON amazon_alert_log(org_id, alert_date, status, created_at DESC, id DESC);
    CREATE INDEX idx_alert_date_keyword_status ON amazon_alert_log(org_id, alert_date, keyword, status, created_at DESC, id DESC);
    CREATE INDEX idx_alert_asin ON amazon_alert_log(org_id, asin);
    CREATE INDEX idx_alert_type ON amazon_alert_log(org_id, alert_type);
  `);
}

function hasOrganizationUniqueKey(db: DatabaseSync, table: string, expected: string[]): boolean {
  const indexes = db.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string; unique: number }>;
  return indexes.some((index) => {
    if (index.unique !== 1) return false;
    const columns = db.prepare(`PRAGMA index_info(${index.name})`).all() as Array<{ name: string }>;
    return columns.map((column) => column.name).join(",") === expected.join(",");
  });
}
