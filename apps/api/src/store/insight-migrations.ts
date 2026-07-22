import type { DatabaseSync } from "node:sqlite";
import { ensureColumn } from "./migration-utils.js";
import { withTransaction } from "./sql-utils.js";

export function migrateInsightOrganizationScope(db: DatabaseSync): void {
  ensureColumn(db, "insight_events", "org_id", "INTEGER NOT NULL DEFAULT 1");
  db.exec("CREATE INDEX IF NOT EXISTS idx_insight_events_org_date ON insight_events(org_id, event_date)");

  ensureColumn(db, "asin_watch_states", "org_id", "INTEGER NOT NULL DEFAULT 1");
  if (hasOrganizationCompositeKey(db)) return;

  withTransaction(db, () => {
    db.exec(`
      ALTER TABLE asin_watch_states RENAME TO asin_watch_states_legacy_org_scope;

      CREATE TABLE asin_watch_states (
        org_id INTEGER NOT NULL DEFAULT 1 REFERENCES organizations(id),
        asin TEXT NOT NULL,
        watch_level TEXT NOT NULL DEFAULT 'NORMAL',
        watch_reason TEXT,
        first_watch_date TEXT NOT NULL,
        last_event_date TEXT,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (org_id, asin)
      );

      INSERT INTO asin_watch_states
        (org_id, asin, watch_level, watch_reason, first_watch_date, last_event_date, note, created_at, updated_at)
      SELECT
        COALESCE(org_id, 1), asin, watch_level, watch_reason, first_watch_date, last_event_date, note, created_at, updated_at
      FROM asin_watch_states_legacy_org_scope;

      DROP TABLE asin_watch_states_legacy_org_scope;

      CREATE INDEX idx_asin_watch_states_level ON asin_watch_states(org_id, watch_level);
      CREATE INDEX idx_asin_watch_states_last_event ON asin_watch_states(org_id, last_event_date);
    `);
  });
}

function hasOrganizationCompositeKey(db: DatabaseSync): boolean {
  const columns = db.prepare("PRAGMA table_info(asin_watch_states)").all() as Array<{
    name: string;
    pk: number;
  }>;
  return columns.some((column) => column.name === "org_id" && column.pk === 1)
    && columns.some((column) => column.name === "asin" && column.pk === 2);
}
