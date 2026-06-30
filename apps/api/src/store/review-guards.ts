import type { DatabaseSync } from "node:sqlite";
import { trustedPreviousReviewCount } from "@amazon-monitor/shared";
import type { CompetitorActivityEvent, ProductPriceHistory } from "@amazon-monitor/shared";
import type { BestsellerSnapshotRow } from "./snapshot-mappers.js";

export function sanitizeBestsellerSnapshotRow(db: DatabaseSync, row: BestsellerSnapshotRow): BestsellerSnapshotRow {
  if (!isSuspiciousHistoricalReviewCount(db, row.category_id, row.asin, row.snapshot_date, row.review_count)) {
    return row;
  }
  return { ...row, review_count: null };
}

/**
 * Batch version of {@link sanitizeBestsellerSnapshotRow}. Replaces 2N per-row
 * neighbor queries with a single window-function query over the distinct
 * (category_id, asin) pairs present in `rows`.
 */
export function sanitizeBestsellerSnapshotRows(db: DatabaseSync, rows: BestsellerSnapshotRow[]): BestsellerSnapshotRow[] {
  if (rows.length === 0) {
    return rows;
  }

  // Only rows with a non-null review_count need neighbor checks.
  const checkable = rows.filter((row) => row.review_count !== null);
  if (checkable.length === 0) {
    return rows;
  }

  // Deduplicate (category_id, asin) pairs.
  const pairMap = new Map<string, { categoryId: number; asin: string }>();
  for (const row of checkable) {
    const key = `${row.category_id}|${row.asin}`;
    if (!pairMap.has(key)) {
      pairMap.set(key, { categoryId: row.category_id, asin: row.asin });
    }
  }
  const pairs = Array.from(pairMap.values());

  // Fetch prev/next review_count for every snapshot of these pairs in a single
  // window-function query — SQLite 3.25+ (bundled with Node 22) supports them.
  const placeholders = pairs.map(() => "(?, ?)").join(", ");
  const params = pairs.flatMap((pair) => [pair.categoryId, pair.asin]);
  const neighbors = db
    .prepare(
      `WITH target(category_id, asin) AS (VALUES ${placeholders})
       SELECT s.category_id, s.asin, s.snapshot_date,
         LAG(s.review_count) OVER w AS prev_rc,
         LEAD(s.review_count) OVER w AS next_rc
       FROM amazon_bestseller_rank_snapshot s
       JOIN target t ON s.category_id = t.category_id AND s.asin = t.asin
       WHERE s.review_count IS NOT NULL
       WINDOW w AS (PARTITION BY s.category_id, s.asin ORDER BY s.snapshot_date)`
    )
    .all(...params) as Array<{
    category_id: number;
    asin: string;
    snapshot_date: string;
    prev_rc: number | null;
    next_rc: number | null;
  }>;

  const neighborMap = new Map<string, { prev: number | null; next: number | null }>();
  for (const n of neighbors) {
    neighborMap.set(`${n.category_id}|${n.asin}|${n.snapshot_date}`, { prev: n.prev_rc, next: n.next_rc });
  }

  return rows.map((row) => {
    if (row.review_count === null) {
      return row;
    }
    const entry = neighborMap.get(`${row.category_id}|${row.asin}|${row.snapshot_date}`);
    if (!entry) {
      return row;
    }
    const prevSuspicious = entry.prev !== null && trustedPreviousReviewCount(row.review_count, entry.prev) === null;
    const nextSuspicious = entry.next !== null && trustedPreviousReviewCount(row.review_count, entry.next) === null;
    if (prevSuspicious || nextSuspicious) {
      return { ...row, review_count: null };
    }
    return row;
  });
}

export function sanitizeProductPriceHistory(item: ProductPriceHistory): ProductPriceHistory {
  const reviewCount = item.reviewCount ?? null;
  const previousReviewCount = trustedPreviousReviewCount(reviewCount, item.previousReviewCount ?? null);
  const reviewCountChange = previousReviewCount !== null && reviewCount !== null ? reviewCount - previousReviewCount : null;
  return {
    ...item,
    reviewCount,
    previousReviewCount,
    reviewCountChange
  };
}

export function shouldExposeActivityEvent(event: CompetitorActivityEvent): boolean {
  if (event.eventType !== "review_growth") {
    return true;
  }
  const change = event.reviewCountChange ?? parseReviewGrowthChange(event.eventSummary);
  if (change === null || change < 10) {
    return false;
  }
  const previousReviewCount =
    event.reviewCountBefore ?? parseReviewGrowthBeforeAfter(event.eventSummary)?.before ?? null;
  const reviewCountAfter = event.reviewCountAfter ?? parseReviewGrowthBeforeAfter(event.eventSummary)?.after ?? null;
  return trustedPreviousReviewCount(reviewCountAfter, previousReviewCount) !== null;
}

function isSuspiciousHistoricalReviewCount(
  db: DatabaseSync,
  categoryId: number,
  asin: string,
  snapshotDate: string,
  reviewCount: number | null
): boolean {
  if (reviewCount === null) {
    return false;
  }
  const neighbors = db
    .prepare(
      `SELECT review_count FROM (
        SELECT review_count
        FROM amazon_bestseller_rank_snapshot
        WHERE category_id = ? AND asin = ? AND snapshot_date < ? AND review_count IS NOT NULL
        ORDER BY snapshot_date DESC
        LIMIT 1
      )
      UNION ALL
      SELECT review_count FROM (
        SELECT review_count
        FROM amazon_bestseller_rank_snapshot
        WHERE category_id = ? AND asin = ? AND snapshot_date > ? AND review_count IS NOT NULL
        ORDER BY snapshot_date ASC
        LIMIT 1
      )`
    )
    .all(categoryId, asin, snapshotDate, categoryId, asin, snapshotDate) as Array<{ review_count: number }>;
  return neighbors.some((neighbor) => trustedPreviousReviewCount(reviewCount, neighbor.review_count) === null);
}

function parseReviewGrowthChange(summary: string | null): number | null {
  const match = summary?.match(/\bup\s+([\d,]+)\b/i);
  if (!match) {
    return null;
  }
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function parseReviewGrowthBeforeAfter(summary: string | null): { before: number; after: number } | null {
  const match = summary?.match(/\bfrom\s+([\d,]+)\s+to\s+([\d,]+)\b/i);
  if (!match) {
    return null;
  }
  const before = Number(match[1].replace(/,/g, ""));
  const after = Number(match[2].replace(/,/g, ""));
  return Number.isFinite(before) && Number.isFinite(after) ? { before, after } : null;
}
