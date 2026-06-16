import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatCategorySnapshotQualityAudits,
  latestCategorySnapshotDate,
  listCategorySnapshotQualityAudits
} from "./quality-audit.js";

describe("quality audit", () => {
  const databases: DatabaseSync[] = [];

  afterEach(() => {
    while (databases.length > 0) {
      databases.pop()?.close();
    }
  });

  it("summarizes weak brands, missing metrics, and unknown ice types for a snapshot date", () => {
    const db = createAuditDb();
    databases.push(db);

    db.exec(`
      INSERT INTO amazon_bestseller_rank_snapshot (
        category_id, category_name, snapshot_date, rank_no, asin, title, brand, rating, review_count, ice_type, coupon_text, deal_badge
      ) VALUES
        (1, 'Ice makers', '2026-06-12', 1, 'B0GOOD0001', 'EUHOMY Bullet Ice Maker', 'EUHOMY', 4.3, 1200, 'bullet', 'Apply $10 coupon', 'Limited time deal'),
        (1, 'Ice makers', '2026-06-12', 2, 'B0WEAK0002', 'Countertop Ice Maker', 'Countertop', 4.1, 200, 'unknown', NULL, NULL),
        (1, 'Ice makers', '2026-06-12', 3, 'B0MISS0003', 'Portable Ice Maker', 'Kismile', NULL, NULL, 'unknown', NULL, NULL),
        (2, 'Ice maker parts', '2026-06-12', 1, 'B0PART0001', 'Replacement Kit', 'Nurfosttek', NULL, NULL, 'unknown', NULL, NULL);
    `);

    expect(latestCategorySnapshotDate(db)).toBe("2026-06-12");

    const audits = listCategorySnapshotQualityAudits(db, "2026-06-12");
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({
      categoryId: 1,
      categoryName: "Ice makers",
      rowCount: 3,
      uniqueAsinCount: 3,
      uniqueRankCount: 3,
      weakBrandCount: 1,
      missingRatingCount: 1,
      missingReviewCount: 1,
      unknownIceTypeCount: 2,
      couponCount: 1,
      dealCount: 1
    });
    expect(audits[0].weakBrandExamples[0]).toMatchObject({
      rank: 2,
      asin: "B0WEAK0002",
      brand: "Countertop"
    });

    const report = formatCategorySnapshotQualityAudits(audits);
    expect(report).toContain("Category quality audit for snapshot_date=2026-06-12");
    expect(report).toContain("[1] Ice makers");
    expect(report).toContain("weak_brands=1");
    expect(report).toContain("#2 B0WEAK0002 Countertop");
  });
});

function createAuditDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE amazon_bestseller_rank_snapshot (
      category_id INTEGER NOT NULL,
      category_name TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,
      rank_no INTEGER NOT NULL,
      asin TEXT NOT NULL,
      title TEXT NOT NULL,
      brand TEXT,
      rating REAL,
      review_count INTEGER,
      ice_type TEXT,
      coupon_text TEXT,
      deal_badge TEXT
    );
  `);
  return db;
}
