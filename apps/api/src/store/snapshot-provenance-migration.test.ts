import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrateSnapshotProvenance } from "./snapshot-provenance-migrations.js";

describe("snapshot provenance migration", () => {
  it("backfills legacy keyword and BSR snapshots with durable synchronization evidence", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE amazon_keyword_serp_snapshot (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE amazon_bestseller_rank_snapshot (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO amazon_keyword_serp_snapshot (id, created_at) VALUES (7, '2026-07-17T01:00:00.000Z');
      INSERT INTO amazon_bestseller_rank_snapshot (id, created_at) VALUES (8, '2026-07-17T02:00:00.000Z');
    `);

    migrateSnapshotProvenance(db);

    expect(provenanceRow(db, "amazon_keyword_serp_snapshot", 7)).toEqual({
      data_source: "legacy",
      last_synced_at: "2026-07-17T01:00:00.000Z",
      sync_status: "success"
    });
    expect(provenanceRow(db, "amazon_bestseller_rank_snapshot", 8)).toEqual({
      data_source: "legacy",
      last_synced_at: "2026-07-17T02:00:00.000Z",
      sync_status: "success"
    });
  });
});

function provenanceRow(db: DatabaseSync, table: string, id: number) {
  return db.prepare(`SELECT data_source, last_synced_at, sync_status FROM ${table} WHERE id = ?`).get(id);
}
