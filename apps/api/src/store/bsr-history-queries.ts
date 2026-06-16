import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { BsrSourceType } from "@amazon-monitor/shared";

export function previousUsableBsrDate(
  db: DatabaseSync,
  filter: { beforeDate: string; sourceType?: BsrSourceType; sourceId?: number; category?: string }
): string | null {
  const clauses = [
    "h.snapshot_date < ?",
    `(h.source_type <> 'category_bestseller' OR EXISTS (
      SELECT 1
      FROM amazon_bsr_snapshot_quality q
      WHERE q.snapshot_date = h.snapshot_date
        AND q.source_type = h.source_type
        AND q.source_id = h.source_id
        AND q.category = h.category
        AND q.quality_status = 'ok'
    ))`
  ];
  const params: SQLInputValue[] = [filter.beforeDate];
  if (filter.sourceType !== undefined) {
    clauses.push("h.source_type = ?");
    params.push(filter.sourceType);
  }
  if (filter.sourceId !== undefined) {
    clauses.push("h.source_id = ?");
    params.push(filter.sourceId);
  }
  if (filter.category !== undefined) {
    clauses.push("h.category = ?");
    params.push(filter.category);
  }
  const row = db
    .prepare(`SELECT MAX(h.snapshot_date) AS snapshot_date FROM amazon_bsr_rank_history h WHERE ${clauses.join(" AND ")}`)
    .get(...params) as { snapshot_date: string | null } | undefined;
  return row?.snapshot_date ?? null;
}

export function hasEarlierBsrHistory(
  db: DatabaseSync,
  filter: { beforeDate: string; sourceType?: BsrSourceType; sourceId?: number; category?: string }
): boolean {
  const clauses = ["snapshot_date < ?"];
  const params: SQLInputValue[] = [filter.beforeDate];
  if (filter.sourceType !== undefined) {
    clauses.push("source_type = ?");
    params.push(filter.sourceType);
  }
  if (filter.sourceId !== undefined) {
    clauses.push("source_id = ?");
    params.push(filter.sourceId);
  }
  if (filter.category !== undefined) {
    clauses.push("category = ?");
    params.push(filter.category);
  }
  const row = db
    .prepare(`SELECT 1 AS has_history FROM amazon_bsr_rank_history WHERE ${clauses.join(" AND ")} LIMIT 1`)
    .get(...params) as { has_history: number } | undefined;
  return Boolean(row);
}

/**
 * Batch version of previousUsableBsrDate: finds the previous usable snapshot date
 * for ALL (source_type, source_id, category) scopes in a single query.
 * Returns a Map keyed by "sourceType|sourceId|category" -> previous date string.
 */
export function batchPreviousUsableBsrDates(db: DatabaseSync, beforeDate: string): Map<string, string> {
  const rows = db
    .prepare(
      `SELECT h.source_type, h.source_id, h.category, MAX(h.snapshot_date) AS snapshot_date
       FROM amazon_bsr_rank_history h
       WHERE h.snapshot_date < ?
         AND (h.source_type <> 'category_bestseller' OR EXISTS (
           SELECT 1
           FROM amazon_bsr_snapshot_quality q
           WHERE q.snapshot_date = h.snapshot_date
             AND q.source_type = h.source_type
             AND q.source_id = h.source_id
             AND q.category = h.category
             AND q.quality_status = 'ok'
         ))
       GROUP BY h.source_type, h.source_id, h.category`
    )
    .all(beforeDate) as Array<{
    source_type: BsrSourceType;
    source_id: number | null;
    category: string;
    snapshot_date: string;
  }>;

  const result = new Map<string, string>();
  for (const row of rows) {
    const key = [row.source_type, row.source_id ?? "", row.category].join("|");
    result.set(key, row.snapshot_date);
  }
  return result;
}

/**
 * Batch version of hasEarlierBsrHistory: finds ALL (source_type, source_id, category)
 * scopes that have any history rows before the given date, in a single query.
 * Returns a Set of scope keys "sourceType|sourceId|category".
 */
export function batchScopesWithEarlierHistory(db: DatabaseSync, beforeDate: string): Set<string> {
  const rows = db
    .prepare(
      `SELECT DISTINCT source_type, source_id, category
       FROM amazon_bsr_rank_history
       WHERE snapshot_date < ?`
    )
    .all(beforeDate) as Array<{
    source_type: BsrSourceType;
    source_id: number | null;
    category: string;
  }>;

  const result = new Set<string>();
  for (const row of rows) {
    const key = [row.source_type, row.source_id ?? "", row.category].join("|");
    result.add(key);
  }
  return result;
}
