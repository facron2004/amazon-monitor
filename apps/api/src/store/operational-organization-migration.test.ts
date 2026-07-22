import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createStore, initSchema } from "../store.js";

describe("keyword operational organization migration", () => {
  it("backfills legacy changes, alerts, and reports while replacing global report uniqueness", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE amazon_competitor_daily_change (
        id INTEGER PRIMARY KEY AUTOINCREMENT, asin TEXT NOT NULL, keyword TEXT NOT NULL,
        marketplace TEXT NOT NULL, snapshot_date TEXT NOT NULL, yesterday_rank INTEGER, today_rank INTEGER,
        rank_change INTEGER, yesterday_price REAL, today_price REAL, price_change REAL, price_change_rate REAL,
        yesterday_sponsored INTEGER, today_sponsored INTEGER, change_type TEXT, title TEXT, brand TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE amazon_alert_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, alert_date TEXT NOT NULL, alert_type TEXT NOT NULL,
        alert_level TEXT, keyword TEXT, asin TEXT, title TEXT, brand TEXT, alert_content TEXT,
        old_value TEXT, new_value TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE amazon_daily_report (
        id INTEGER PRIMARY KEY AUTOINCREMENT, report_date TEXT NOT NULL, keyword TEXT NOT NULL,
        markdown TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(report_date, keyword)
      );
      INSERT INTO amazon_competitor_daily_change (id, asin, keyword, marketplace, snapshot_date, change_type, title)
      VALUES (5, 'B0LEGACY01', 'ice maker', 'amazon.com', '2026-07-18', 'price_drop', 'Legacy change');
      INSERT INTO amazon_alert_log (id, alert_date, alert_type, alert_level, keyword, asin, title, alert_content)
      VALUES (6, '2026-07-18', 'price_drop', 'high', 'ice maker', 'B0LEGACY01', 'Legacy alert', 'Legacy content');
      INSERT INTO amazon_daily_report (id, report_date, keyword, markdown)
      VALUES (7, '2026-07-18', 'ice maker', '# Legacy report');
    `);

    initSchema(db);
    const store = createStore(db);
    expect(store.listDailyChanges({ orgId: 1 })).toEqual([expect.objectContaining({ orgId: 1, asin: "B0LEGACY01" })]);
    expect(store.listAlerts({ orgId: 1 })).toEqual([expect.objectContaining({ id: 6, orgId: 1, asin: "B0LEGACY01" })]);
    expect(store.getDailyReport("2026-07-18", "ice maker", 1)).toBe("# Legacy report");

    const secondOrg = store.createOrganization({ name: "Second operational organization" });
    store.saveDailyReport("2026-07-18", "ice maker", "# Independent report", secondOrg.id);
    store.insertDailyChanges([{
      asin: "B0LEGACY01", keyword: "ice maker", marketplace: "amazon.com", snapshotDate: "2026-07-18",
      yesterdayRank: 20, todayRank: 10, rankChange: 10, yesterdayPrice: 100, todayPrice: 80,
      priceChange: -20, priceChangeRate: -0.2, yesterdaySponsored: false, todaySponsored: false,
      changeType: "price_drop", title: "Independent change", brand: null
    }], secondOrg.id);
    expect(store.getDailyReport("2026-07-18", "ice maker", secondOrg.id)).toBe("# Independent report");
    expect(store.listDailyChanges({ orgId: secondOrg.id })).toHaveLength(1);
  });
});
