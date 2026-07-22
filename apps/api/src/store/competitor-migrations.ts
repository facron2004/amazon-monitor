import type { DatabaseSync } from "node:sqlite";
import { ensureColumn } from "./migration-utils.js";
import { withTransaction } from "./sql-utils.js";

export function migrateCompetitorPoolOrganizationScope(db: DatabaseSync): void {
  ensureColumn(db, "amazon_competitor_pool", "org_id", "INTEGER NOT NULL DEFAULT 1");
  if (hasOrganizationUniqueKey(db)) {
    ensureCompetitorPoolIndexes(db);
    return;
  }

  withTransaction(db, () => {
    db.exec(`
      ALTER TABLE amazon_competitor_pool RENAME TO amazon_competitor_pool_legacy_org_scope;

      CREATE TABLE amazon_competitor_pool (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id INTEGER NOT NULL DEFAULT 1 REFERENCES organizations(id),
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
        latest_review_count INTEGER,
        latest_product_url TEXT,
        coupon_text TEXT,
        deal_badge TEXT,
        latest_bsr_rank INTEGER,
        latest_bsr_category TEXT,
        latest_bsr_text TEXT,
        latest_bestseller_ranks_json TEXT,
        source_type TEXT DEFAULT 'keyword',
        first_seen_source TEXT,
        latest_category_name TEXT,
        latest_category_rank INTEGER,
        ice_type TEXT,
        competitor_tier TEXT DEFAULT 'watch',
        competitor_reasons_json TEXT,
        is_key_competitor INTEGER DEFAULT 0,
        status INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(org_id, asin, marketplace)
      );

      INSERT INTO amazon_competitor_pool (
        id, org_id, asin, marketplace, title, brand, image_url, first_seen_keyword, first_seen_date,
        last_seen_date, appear_keyword_count, best_rank, latest_rank, lowest_price, latest_price,
        latest_review_count, latest_product_url, coupon_text, deal_badge, latest_bsr_rank,
        latest_bsr_category, latest_bsr_text, latest_bestseller_ranks_json, source_type,
        first_seen_source, latest_category_name, latest_category_rank, ice_type, competitor_tier,
        competitor_reasons_json, is_key_competitor, status, created_at, updated_at
      )
      SELECT
        id, COALESCE(org_id, 1), asin, marketplace, title, brand, image_url, first_seen_keyword,
        first_seen_date, last_seen_date, appear_keyword_count, best_rank, latest_rank, lowest_price,
        latest_price, latest_review_count, latest_product_url, coupon_text, deal_badge, latest_bsr_rank,
        latest_bsr_category, latest_bsr_text, latest_bestseller_ranks_json, source_type,
        first_seen_source, latest_category_name, latest_category_rank, ice_type, competitor_tier,
        competitor_reasons_json, is_key_competitor, status, created_at, updated_at
      FROM amazon_competitor_pool_legacy_org_scope;

      DROP TABLE amazon_competitor_pool_legacy_org_scope;
    `);
    ensureCompetitorPoolIndexes(db);
  });
}

function hasOrganizationUniqueKey(db: DatabaseSync): boolean {
  const indexes = db.prepare("PRAGMA index_list(amazon_competitor_pool)").all() as Array<{ name: string; unique: number }>;
  return indexes.some((index) => {
    if (index.unique !== 1) return false;
    const columns = db.prepare(`PRAGMA index_info(${index.name})`).all() as Array<{ name: string }>;
    return columns.map((column) => column.name).join(",") === "org_id,asin,marketplace";
  });
}

function ensureCompetitorPoolIndexes(db: DatabaseSync): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_competitor_pool_source_tier
      ON amazon_competitor_pool(org_id, source_type, competitor_tier, latest_category_rank);
    CREATE INDEX IF NOT EXISTS idx_competitor_pool_rank
      ON amazon_competitor_pool(org_id, status, is_key_competitor, latest_category_rank, latest_bsr_rank, latest_rank);
  `);
}
