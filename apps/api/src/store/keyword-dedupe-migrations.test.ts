import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createStore, initSchema } from "../store.js";
import {
  dedupeCompetitorDailyChanges,
  dedupeKeywordSerpSnapshots,
  ensureCompetitorDailyChangeUniqueIndex,
  ensureKeywordSerpSnapshotUniqueIndex
} from "./keyword-dedupe-migrations.js";

describe("keyword and daily-change uniqueness", () => {
  let db: DatabaseSync | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it("dedupes legacy keyword serp snapshots and rejects duplicate inserts", () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);

    // Remove unique index if present so we can seed duplicates, then re-apply migration path.
    db.exec("DROP INDEX IF EXISTS idx_keyword_serp_snapshot_unique");
    db.prepare(
      `INSERT INTO amazon_keyword_serp_snapshot
       (keyword_id, keyword, marketplace, snapshot_date, absolute_rank, asin, title)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(1, "ice maker", "amazon.com", "2026-07-18", 3, "B0DUP001", "First");
    db.prepare(
      `INSERT INTO amazon_keyword_serp_snapshot
       (keyword_id, keyword, marketplace, snapshot_date, absolute_rank, asin, title)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(1, "ice maker", "amazon.com", "2026-07-18", 8, "B0DUP001", "Duplicate");

    const before = db.prepare(
      "SELECT COUNT(*) AS count FROM amazon_keyword_serp_snapshot WHERE keyword_id = 1 AND snapshot_date = ? AND asin = ?"
    ).get("2026-07-18", "B0DUP001") as { count: number };
    expect(before.count).toBe(2);

    dedupeKeywordSerpSnapshots(db);
    ensureKeywordSerpSnapshotUniqueIndex(db);

    const after = db.prepare(
      "SELECT COUNT(*) AS count FROM amazon_keyword_serp_snapshot WHERE keyword_id = 1 AND snapshot_date = ? AND asin = ?"
    ).get("2026-07-18", "B0DUP001") as { count: number };
    expect(after.count).toBe(1);

    expect(() => {
      db!.prepare(
        `INSERT INTO amazon_keyword_serp_snapshot
         (keyword_id, keyword, marketplace, snapshot_date, absolute_rank, asin, title)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(1, "ice maker", "amazon.com", "2026-07-18", 12, "B0DUP001", "Third");
    }).toThrow();
  });

  it("dedupes daily changes and replace writes stay unique per keyword/date", () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);

    db.exec("DROP INDEX IF EXISTS idx_daily_change_unique");
    const insert = db.prepare(
      `INSERT INTO amazon_competitor_daily_change
       (asin, keyword, marketplace, snapshot_date, today_rank, change_type, title, brand)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run("B0CHG001", "ice maker", "amazon.com", "2026-07-18", 10, "rank_up", "Title", "Brand");
    insert.run("B0CHG001", "ice maker", "amazon.com", "2026-07-18", 9, "rank_up", "Title", "Brand");

    dedupeCompetitorDailyChanges(db);
    ensureCompetitorDailyChangeUniqueIndex(db);
    expect(store.listDailyChanges({ date: "2026-07-18", keyword: "ice maker" })).toHaveLength(1);

    store.deleteDailyChangesForKeywordDate("ice maker", "2026-07-18");
    store.insertDailyChanges([
      {
        asin: "B0CHG001",
        keyword: "ice maker",
        marketplace: "amazon.com",
        snapshotDate: "2026-07-18",
        yesterdayRank: 20,
        todayRank: 8,
        rankChange: 12,
        yesterdayPrice: 100,
        todayPrice: 90,
        priceChange: -10,
        priceChangeRate: -0.1,
        yesterdaySponsored: false,
        todaySponsored: false,
        changeType: "rank_up",
        title: "Title",
        brand: "Brand"
      }
    ]);
    store.deleteDailyChangesForKeywordDate("ice maker", "2026-07-18");
    store.insertDailyChanges([
      {
        asin: "B0CHG001",
        keyword: "ice maker",
        marketplace: "amazon.com",
        snapshotDate: "2026-07-18",
        yesterdayRank: 20,
        todayRank: 5,
        rankChange: 15,
        yesterdayPrice: 100,
        todayPrice: 88,
        priceChange: -12,
        priceChangeRate: -0.12,
        yesterdaySponsored: false,
        todaySponsored: true,
        changeType: "rank_up",
        title: "Title",
        brand: "Brand"
      }
    ]);

    const rows = store.listDailyChanges({ date: "2026-07-18", keyword: "ice maker" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.todayRank).toBe(5);
  });
});