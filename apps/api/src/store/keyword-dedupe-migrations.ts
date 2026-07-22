import type { DatabaseSync } from "node:sqlite";

/**
 * Deduplicate keyword SERP snapshots before applying a unique index.
 * Keeps the lowest id as a stable representative for each natural key.
 * (Pipeline already prefers the best rank via ASIN dedupe before insert.)
 */
export function dedupeKeywordSerpSnapshots(db: DatabaseSync): void {
  db.prepare(
    `DELETE FROM amazon_keyword_serp_snapshot
     WHERE id NOT IN (
       SELECT MIN(id)
       FROM amazon_keyword_serp_snapshot
       GROUP BY snapshot_date, keyword_id, COALESCE(asin, '')
     )`
  ).run();
}

export function ensureKeywordSerpSnapshotUniqueIndex(db: DatabaseSync): void {
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_keyword_serp_snapshot_unique
     ON amazon_keyword_serp_snapshot (
       snapshot_date,
       keyword_id,
       COALESCE(asin, '')
     )`
  );
}

/**
 * Deduplicate daily changes before applying a unique index.
 * Keeps the newest row (highest id) for each natural key.
 */
export function dedupeCompetitorDailyChanges(db: DatabaseSync): void {
  db.prepare(
    `DELETE FROM amazon_competitor_daily_change
     WHERE id NOT IN (
       SELECT MAX(id)
       FROM amazon_competitor_daily_change
       GROUP BY
         org_id,
         snapshot_date,
         keyword,
         marketplace,
         COALESCE(asin, ''),
         COALESCE(change_type, '')
     )`
  ).run();
}

export function ensureCompetitorDailyChangeUniqueIndex(db: DatabaseSync): void {
  db.exec(
    `DROP INDEX IF EXISTS idx_daily_change_unique;
     CREATE UNIQUE INDEX idx_daily_change_unique
     ON amazon_competitor_daily_change (
       org_id,
       snapshot_date,
       keyword,
       marketplace,
       COALESCE(asin, ''),
       COALESCE(change_type, '')
     )`
  );
}

/** One-shot migration used by initSchema via runStoreMigrationOnce. */
export function migrateKeywordAndDailyChangeUniqueness(db: DatabaseSync): void {
  dedupeKeywordSerpSnapshots(db);
  ensureKeywordSerpSnapshotUniqueIndex(db);
  dedupeCompetitorDailyChanges(db);
  ensureCompetitorDailyChangeUniqueIndex(db);
}
