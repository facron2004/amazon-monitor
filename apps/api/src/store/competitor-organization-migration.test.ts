import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createStore, initSchema } from "../store.js";

describe("competitor organization migration", () => {
  it("backfills legacy rows and replaces the global ASIN uniqueness constraint", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE amazon_competitor_pool (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asin TEXT NOT NULL, marketplace TEXT NOT NULL, title TEXT, brand TEXT, image_url TEXT,
        first_seen_keyword TEXT, first_seen_date TEXT, last_seen_date TEXT,
        appear_keyword_count INTEGER DEFAULT 0, best_rank INTEGER, latest_rank INTEGER,
        lowest_price REAL, latest_price REAL, latest_review_count INTEGER, latest_product_url TEXT,
        coupon_text TEXT, deal_badge TEXT, latest_bsr_rank INTEGER, latest_bsr_category TEXT,
        latest_bsr_text TEXT, latest_bestseller_ranks_json TEXT, source_type TEXT DEFAULT 'keyword',
        first_seen_source TEXT, latest_category_name TEXT, latest_category_rank INTEGER, ice_type TEXT,
        competitor_tier TEXT DEFAULT 'watch', competitor_reasons_json TEXT,
        is_key_competitor INTEGER DEFAULT 0, status INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(asin, marketplace)
      );
      INSERT INTO amazon_competitor_pool (id, asin, marketplace, title, source_type)
      VALUES (7, 'B0LEGACY01', 'amazon.com', 'Legacy competitor', 'manual');
    `);

    initSchema(db);
    const store = createStore(db);
    expect(store.listCompetitors({ orgId: 1 })).toEqual([
      expect.objectContaining({ id: 7, orgId: 1, asin: "B0LEGACY01", title: "Legacy competitor" })
    ]);

    const secondOrg = store.createOrganization({ name: "Second competitor organization" });
    const second = store.createManualCompetitor({
      asin: "B0LEGACY01",
      marketplace: "amazon.com",
      title: "Independent competitor"
    }, secondOrg.id);
    expect(second).toMatchObject({ orgId: secondOrg.id, asin: "B0LEGACY01", title: "Independent competitor" });
    expect(store.listCompetitors({ orgId: 1 })[0].title).toBe("Legacy competitor");
  });
});
