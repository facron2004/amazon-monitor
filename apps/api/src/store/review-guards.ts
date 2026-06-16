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
