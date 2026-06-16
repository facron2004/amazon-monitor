import type { DatabaseSync } from "node:sqlite";
import { hasWeakBrandValue } from "./amazon/brand-quality.js";

interface CategorySnapshotRow {
  category_id: number;
  category_name: string;
  snapshot_date: string;
  rank_no: number;
  asin: string;
  title: string;
  brand: string | null;
  rating: number | null;
  review_count: number | null;
  ice_type: string | null;
  coupon_text: string | null;
  deal_badge: string | null;
}

export interface QualityExampleRow {
  rank: number;
  asin: string;
  brand: string | null;
  title: string;
}

export interface CategorySnapshotQualityAudit {
  snapshotDate: string;
  categoryId: number;
  categoryName: string;
  rowCount: number;
  uniqueAsinCount: number;
  uniqueRankCount: number;
  weakBrandCount: number;
  missingRatingCount: number;
  missingReviewCount: number;
  unknownIceTypeCount: number;
  couponCount: number;
  dealCount: number;
  weakBrandExamples: QualityExampleRow[];
  missingMetricExamples: QualityExampleRow[];
  unknownIceTypeExamples: QualityExampleRow[];
}

export function latestCategorySnapshotDate(db: DatabaseSync): string | null {
  const row = db.prepare("SELECT MAX(snapshot_date) AS snapshot_date FROM amazon_bestseller_rank_snapshot").get() as { snapshot_date: string | null } | undefined;
  return row?.snapshot_date ?? null;
}

export function listCategorySnapshotQualityAudits(
  db: DatabaseSync,
  snapshotDate = latestCategorySnapshotDate(db)
): CategorySnapshotQualityAudit[] {
  if (!snapshotDate) {
    return [];
  }

  const rows = db
    .prepare(
      `SELECT
        category_id,
        category_name,
        snapshot_date,
        rank_no,
        asin,
        title,
        brand,
        rating,
        review_count,
        ice_type,
        coupon_text,
        deal_badge
      FROM amazon_bestseller_rank_snapshot
      WHERE snapshot_date = ?
      ORDER BY category_id, rank_no`
    )
    .all(snapshotDate) as unknown as CategorySnapshotRow[];

  const grouped = new Map<number, CategorySnapshotRow[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.category_id) ?? [];
    bucket.push(row);
    grouped.set(row.category_id, bucket);
  }

  return Array.from(grouped.entries()).map(([categoryId, items]) => {
    const uniqueAsins = new Set(items.map((item) => item.asin));
    const uniqueRanks = new Set(items.map((item) => item.rank_no));
    const weakBrandExamples = items.filter((item) => hasWeakBrandValue(item.brand, item.title)).slice(0, 5);
    const missingMetricExamples = items.filter((item) => item.rating === null || item.review_count === null).slice(0, 5);
    const unknownIceTypeExamples = items.filter((item) => !item.ice_type || item.ice_type === "unknown").slice(0, 5);

    return {
      snapshotDate,
      categoryId,
      categoryName: items[0]?.category_name ?? String(categoryId),
      rowCount: items.length,
      uniqueAsinCount: uniqueAsins.size,
      uniqueRankCount: uniqueRanks.size,
      weakBrandCount: weakBrandExamples.length === 0 ? 0 : items.filter((item) => hasWeakBrandValue(item.brand, item.title)).length,
      missingRatingCount: items.filter((item) => item.rating === null).length,
      missingReviewCount: items.filter((item) => item.review_count === null).length,
      unknownIceTypeCount: items.filter((item) => !item.ice_type || item.ice_type === "unknown").length,
      couponCount: items.filter((item) => Boolean(item.coupon_text?.trim())).length,
      dealCount: items.filter((item) => Boolean(item.deal_badge?.trim())).length,
      weakBrandExamples: weakBrandExamples.map(mapExampleRow),
      missingMetricExamples: missingMetricExamples.map(mapExampleRow),
      unknownIceTypeExamples: unknownIceTypeExamples.map(mapExampleRow)
    };
  });
}

export function formatCategorySnapshotQualityAudits(audits: CategorySnapshotQualityAudit[]): string {
  if (audits.length === 0) {
    return "No category snapshot data found.";
  }

  const lines: string[] = [];
  lines.push(`Category quality audit for snapshot_date=${audits[0].snapshotDate}`);

  for (const audit of audits) {
    lines.push("");
    lines.push(`[${audit.categoryId}] ${audit.categoryName}`);
    lines.push(`  rows=${audit.rowCount} unique_asins=${audit.uniqueAsinCount} unique_ranks=${audit.uniqueRankCount}`);
    lines.push(
      `  weak_brands=${audit.weakBrandCount} missing_rating=${audit.missingRatingCount} missing_review=${audit.missingReviewCount} unknown_ice_type=${audit.unknownIceTypeCount}`
    );
    lines.push(`  coupon=${audit.couponCount} deal=${audit.dealCount}`);
    appendExamples(lines, "weak brand examples", audit.weakBrandExamples);
    appendExamples(lines, "missing metric examples", audit.missingMetricExamples);
    appendExamples(lines, "unknown ice type examples", audit.unknownIceTypeExamples);
  }

  return lines.join("\n");
}

function appendExamples(lines: string[], label: string, examples: QualityExampleRow[]): void {
  if (examples.length === 0) {
    return;
  }
  lines.push(`  ${label}:`);
  for (const example of examples) {
    lines.push(`    #${example.rank} ${example.asin} ${example.brand ?? "Unknown"} | ${example.title}`);
  }
}

function mapExampleRow(row: CategorySnapshotRow): QualityExampleRow {
  return {
    rank: row.rank_no,
    asin: row.asin,
    brand: row.brand,
    title: row.title
  };
}
