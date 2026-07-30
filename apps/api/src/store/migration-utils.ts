import type { DatabaseSync } from "node:sqlite";

/**
 * Current schema version. Bump this when adding new migrations.
 */
export const SCHEMA_VERSION = 2;

export function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const tableExists = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
  ).get(table);
  if (!tableExists) {
    return;
  }
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function runStoreMigrationOnce(db: DatabaseSync, key: string, work: () => void): void {
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

export function getSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare("SELECT metadata_value FROM amazon_schema_metadata WHERE metadata_key = ?").get("schema_version") as { metadata_value: string } | undefined;
  return row ? Number(row.metadata_value) : 0;
}

export function setSchemaVersion(db: DatabaseSync, version: number): void {
  db.prepare(
    `INSERT OR REPLACE INTO amazon_schema_metadata (metadata_key, metadata_value, updated_at)
     VALUES (?, ?, ?)`
  ).run("schema_version", String(version), new Date().toISOString());
}

export function backfillProductPriceHistoryPromos(db: DatabaseSync): void {
  db.exec(`
    UPDATE amazon_product_price_history
    SET coupon_text = COALESCE(
      NULLIF(TRIM(coupon_text), ''),
      (
        SELECT s.coupon_text FROM amazon_bestseller_rank_snapshot s
        WHERE s.snapshot_date = amazon_product_price_history.snapshot_date
          AND s.category_id = amazon_product_price_history.category_id
          AND s.asin = amazon_product_price_history.asin
          AND s.marketplace = amazon_product_price_history.marketplace
          AND s.coupon_text IS NOT NULL
          AND TRIM(s.coupon_text) <> ''
          AND LENGTH(s.coupon_text) <= 90
          AND (LOWER(s.coupon_text) LIKE '%coupon%' OR LOWER(s.coupon_text) LIKE '%save%')
        ORDER BY s.rank_no ASC
        LIMIT 1
      ),
      (
        SELECT ks.coupon_text FROM amazon_keyword_serp_snapshot ks
        WHERE ks.snapshot_date = amazon_product_price_history.snapshot_date
          AND ks.asin = amazon_product_price_history.asin
          AND ks.marketplace = amazon_product_price_history.marketplace
          AND ks.coupon_text IS NOT NULL
          AND TRIM(ks.coupon_text) <> ''
          AND LENGTH(ks.coupon_text) <= 90
          AND (LOWER(ks.coupon_text) LIKE '%coupon%' OR LOWER(ks.coupon_text) LIKE '%save%')
        ORDER BY ks.absolute_rank ASC
        LIMIT 1
      )
    )
    WHERE coupon_text IS NULL OR TRIM(coupon_text) = '';

    UPDATE amazon_product_price_history
    SET deal_badge = COALESCE(
      NULLIF(TRIM(deal_badge), ''),
      (
        SELECT s.deal_badge FROM amazon_bestseller_rank_snapshot s
        WHERE s.snapshot_date = amazon_product_price_history.snapshot_date
          AND s.category_id = amazon_product_price_history.category_id
          AND s.asin = amazon_product_price_history.asin
          AND s.marketplace = amazon_product_price_history.marketplace
          AND s.deal_badge IS NOT NULL
          AND TRIM(s.deal_badge) <> ''
          AND LENGTH(s.deal_badge) <= 90
          AND (
            LOWER(s.deal_badge) LIKE '%limited time deal%'
            OR LOWER(s.deal_badge) LIKE '%prime exclusive deal%'
            OR LOWER(s.deal_badge) LIKE '%prime exclusive savings%'
            OR LOWER(s.deal_badge) LIKE '%prime day deal%'
            OR LOWER(s.deal_badge) LIKE '%primeday deal%'
            OR LOWER(s.deal_badge) LIKE '%prime-day deal%'
            OR LOWER(s.deal_badge) LIKE '%prime big deal day%'
            OR LOWER(s.deal_badge) LIKE '%prime early access deal%'
            OR LOWER(s.deal_badge) LIKE '%prime member exclusive deal%'
            OR LOWER(s.deal_badge) LIKE '%deal of the day%'
            OR LOWER(s.deal_badge) LIKE '%lightning deal%'
            OR LOWER(s.deal_badge) LIKE '%black friday deal%'
            OR LOWER(s.deal_badge) LIKE '%cyber monday deal%'
            OR LOWER(TRIM(s.deal_badge)) = 'deal'
          )
        ORDER BY s.rank_no ASC
        LIMIT 1
      ),
      (
        SELECT ks.deal_badge FROM amazon_keyword_serp_snapshot ks
        WHERE ks.snapshot_date = amazon_product_price_history.snapshot_date
          AND ks.asin = amazon_product_price_history.asin
          AND ks.marketplace = amazon_product_price_history.marketplace
          AND ks.deal_badge IS NOT NULL
          AND TRIM(ks.deal_badge) <> ''
          AND LENGTH(ks.deal_badge) <= 90
          AND (
            LOWER(ks.deal_badge) LIKE '%limited time deal%'
            OR LOWER(ks.deal_badge) LIKE '%prime exclusive deal%'
            OR LOWER(ks.deal_badge) LIKE '%prime exclusive savings%'
            OR LOWER(ks.deal_badge) LIKE '%prime day deal%'
            OR LOWER(ks.deal_badge) LIKE '%primeday deal%'
            OR LOWER(ks.deal_badge) LIKE '%prime-day deal%'
            OR LOWER(ks.deal_badge) LIKE '%prime big deal day%'
            OR LOWER(ks.deal_badge) LIKE '%prime early access deal%'
            OR LOWER(ks.deal_badge) LIKE '%prime member exclusive deal%'
            OR LOWER(ks.deal_badge) LIKE '%deal of the day%'
            OR LOWER(ks.deal_badge) LIKE '%lightning deal%'
            OR LOWER(ks.deal_badge) LIKE '%black friday deal%'
            OR LOWER(ks.deal_badge) LIKE '%cyber monday deal%'
            OR LOWER(TRIM(ks.deal_badge)) = 'deal'
          )
        ORDER BY ks.absolute_rank ASC
        LIMIT 1
      )
    )
    WHERE deal_badge IS NULL OR TRIM(deal_badge) = '';
  `);
}
