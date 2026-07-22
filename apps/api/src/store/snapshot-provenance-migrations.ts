import type { DatabaseSync } from "node:sqlite";
import { ensureColumn } from "./migration-utils.js";

const snapshotTables = ["amazon_keyword_serp_snapshot", "amazon_bestseller_rank_snapshot"] as const;

export function migrateSnapshotProvenance(db: DatabaseSync): void {
  for (const table of snapshotTables) {
    ensureColumn(db, table, "data_source", "TEXT NOT NULL DEFAULT 'legacy'");
    ensureColumn(db, table, "last_synced_at", "TEXT");
    ensureColumn(db, table, "sync_status", "TEXT NOT NULL DEFAULT 'success'");
    db.exec(`
      UPDATE ${table}
      SET data_source = CASE WHEN TRIM(COALESCE(data_source, '')) = '' THEN 'legacy' ELSE data_source END,
          last_synced_at = COALESCE(last_synced_at, created_at),
          sync_status = CASE WHEN TRIM(COALESCE(sync_status, '')) = '' THEN 'success' ELSE sync_status END
    `);
  }
}
