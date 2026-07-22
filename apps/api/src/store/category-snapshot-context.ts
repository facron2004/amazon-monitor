import type { DatabaseSync } from "node:sqlite";

export interface CategorySnapshotContext {
  competitorPoolStatus: "active" | "ignored" | "missing";
  previousRank: number | null;
  sevenDayReferenceRank: number | null;
  sevenDayRankChange: number | null;
  firstListedDate: string;
  daysListed: number;
  isNewListing: boolean;
}

interface CategorySnapshotContextRow {
  asin: string;
  marketplace: string;
  current_rank: number;
  competitor_pool_status: CategorySnapshotContext["competitorPoolStatus"];
  previous_rank: number | null;
  seven_day_reference_rank: number | null;
  first_listed_date: string;
  days_listed: number;
  is_new_listing: number;
}

export function loadCategorySnapshotContexts(
  db: DatabaseSync,
  categoryId: number,
  date: string,
  orgId?: number
): Map<string, CategorySnapshotContext> {
  const rows = db.prepare(
    `WITH current_products AS (
       SELECT asin, marketplace, rank_no AS current_rank
       FROM amazon_bestseller_rank_snapshot
       WHERE category_id = ? AND snapshot_date = ?
     ),
     listing_stats AS (
       SELECT s.asin, s.marketplace,
        MIN(s.snapshot_date) AS first_listed_date,
        COUNT(DISTINCT s.snapshot_date) AS days_listed
       FROM amazon_bestseller_rank_snapshot s
       INNER JOIN current_products c ON c.asin = s.asin AND c.marketplace = s.marketplace
       WHERE s.category_id = ? AND s.snapshot_date <= ?
       GROUP BY s.asin, s.marketplace
     ),
     previous_rank_rows AS (
       SELECT s.asin, s.marketplace, s.rank_no,
        ROW_NUMBER() OVER (PARTITION BY s.asin, s.marketplace ORDER BY s.id DESC) AS row_no
       FROM amazon_bestseller_rank_snapshot s
       INNER JOIN current_products c ON c.asin = s.asin AND c.marketplace = s.marketplace
       WHERE s.category_id = ? AND s.snapshot_date = date(?, '-1 day')
     ),
     seven_day_rank_rows AS (
       SELECT s.asin, s.marketplace, s.rank_no,
        ROW_NUMBER() OVER (PARTITION BY s.asin, s.marketplace ORDER BY s.snapshot_date DESC, s.id DESC) AS row_no
       FROM amazon_bestseller_rank_snapshot s
       INNER JOIN current_products c ON c.asin = s.asin AND c.marketplace = s.marketplace
       WHERE s.category_id = ? AND s.snapshot_date <= date(?, '-7 day')
     )
     SELECT c.asin, c.marketplace, c.current_rank,
      CASE WHEN cp.id IS NULL THEN 'missing' WHEN cp.status = 1 THEN 'active' ELSE 'ignored' END AS competitor_pool_status,
      previous.rank_no AS previous_rank,
      seven_day.rank_no AS seven_day_reference_rank,
      stats.first_listed_date,
      stats.days_listed,
      CASE WHEN date(stats.first_listed_date) >= date(?, '-29 day') THEN 1 ELSE 0 END AS is_new_listing
     FROM current_products c
     INNER JOIN listing_stats stats ON stats.asin = c.asin AND stats.marketplace = c.marketplace
     LEFT JOIN previous_rank_rows previous
      ON previous.asin = c.asin AND previous.marketplace = c.marketplace AND previous.row_no = 1
     LEFT JOIN seven_day_rank_rows seven_day
      ON seven_day.asin = c.asin AND seven_day.marketplace = c.marketplace AND seven_day.row_no = 1
     LEFT JOIN amazon_competitor_pool cp
      ON cp.asin = c.asin AND cp.marketplace = c.marketplace AND (? IS NULL OR cp.org_id = ?)`
  ).all(
    categoryId,
    date,
    categoryId,
    date,
    categoryId,
    date,
    categoryId,
    date,
    date,
    orgId ?? null,
    orgId ?? null
  ) as unknown as CategorySnapshotContextRow[];

  return new Map(rows.map((row) => [
    `${row.marketplace}:${row.asin}`,
    {
      competitorPoolStatus: row.competitor_pool_status,
      previousRank: row.previous_rank,
      sevenDayReferenceRank: row.seven_day_reference_rank,
      sevenDayRankChange: row.seven_day_reference_rank === null
        ? null
        : row.seven_day_reference_rank - row.current_rank,
      firstListedDate: row.first_listed_date,
      daysListed: row.days_listed,
      isNewListing: Boolean(row.is_new_listing)
    }
  ]));
}
