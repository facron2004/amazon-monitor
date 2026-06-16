import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { describeRankCoverageGaps } from "@amazon-monitor/shared";
import type { BsrSnapshotQuality, BsrSourceType } from "@amazon-monitor/shared";
import { withTransaction } from "./sql-utils.js";

export function backfillBsrSnapshotQuality(db: DatabaseSync): void {
  const scopes = db
    .prepare(
      `SELECT DISTINCT h.snapshot_date, h.source_type, h.source_id
       FROM amazon_bsr_rank_history h
       LEFT JOIN amazon_bsr_snapshot_quality q
        ON q.snapshot_date = h.snapshot_date
        AND q.source_type = h.source_type
        AND COALESCE(q.source_id, -1) = COALESCE(h.source_id, -1)
        AND q.category = h.category
       WHERE q.id IS NULL
       ORDER BY h.snapshot_date, h.source_type, h.source_id`
    )
    .all() as Array<{ snapshot_date: string; source_type: BsrSourceType; source_id: number | null }>;

  if (scopes.length === 0) {
    return;
  }

  withTransaction(db, () => {
    for (const scope of scopes) {
      upsertBsrSnapshotQualityForScope(db, scope.source_type, scope.source_id, scope.snapshot_date);
    }
  });
}

export function refreshBsrSnapshotQuality(db: DatabaseSync): void {
  const scopes = db
    .prepare(
      `SELECT DISTINCT snapshot_date, source_type, source_id
       FROM amazon_bsr_rank_history
       ORDER BY snapshot_date, source_type, source_id`
    )
    .all() as Array<{ snapshot_date: string; source_type: BsrSourceType; source_id: number | null }>;

  withTransaction(db, () => {
    for (const scope of scopes) {
      upsertBsrSnapshotQualityForScope(db, scope.source_type, scope.source_id, scope.snapshot_date);
    }
  });
}

export function upsertBsrSnapshotQualityForScope(db: DatabaseSync, sourceType: BsrSourceType, sourceId: number | null, date: string): void {
  const sourceClause = sourceId === null ? "source_id IS NULL" : "source_id = ?";
  const params: SQLInputValue[] = sourceId === null ? [date, sourceType] : [date, sourceType, sourceId];
  const rows = db
    .prepare(
      `SELECT
        snapshot_date,
        source_type,
        source_id,
        source_name,
        marketplace,
        category,
        COUNT(*) AS actual_count,
        COUNT(DISTINCT asin) AS unique_asin_count,
        COUNT(DISTINCT rank_no) AS unique_rank_count,
        MIN(rank_no) AS min_rank,
        MAX(rank_no) AS max_rank,
        GROUP_CONCAT(rank_no) AS ranks_csv
       FROM amazon_bsr_rank_history
       WHERE snapshot_date = ? AND source_type = ? AND ${sourceClause}
       GROUP BY snapshot_date, source_type, source_id, source_name, marketplace, category`
    )
    .all(...params) as Array<{
    snapshot_date: string;
    source_type: BsrSourceType;
    source_id: number | null;
    source_name: string;
    marketplace: string;
    category: string;
    actual_count: number;
    unique_asin_count: number;
    unique_rank_count: number;
    min_rank: number | null;
    max_rank: number | null;
    ranks_csv: string | null;
  }>;

  const stmt = db.prepare(
    bsrSnapshotQualityUpsertSql()
  );

  for (const row of rows) {
    const expectedCount = expectedBsrCount(db, row.source_type, row.source_id);
    const quality = bsrQualityFromCounts(
      row.actual_count,
      row.unique_asin_count,
      row.unique_rank_count,
      row.min_rank,
      row.max_rank,
      expectedCount,
      parseRankCsv(row.ranks_csv)
    );
    runBsrSnapshotQualityUpsert(stmt, {
      snapshotDate: row.snapshot_date,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceName: row.source_name,
      marketplace: row.marketplace,
      category: row.category,
      expectedCount,
      actualCount: row.actual_count,
      uniqueAsinCount: row.unique_asin_count,
      uniqueRankCount: row.unique_rank_count,
      minRank: row.min_rank,
      maxRank: row.max_rank,
      qualityStatus: quality.status,
      issue: quality.issue
    });
  }
}

export function upsertBsrSnapshotQuality(
  db: DatabaseSync,
  input: Omit<BsrSnapshotQuality, "id" | "createdAt">,
  options: { preserveExistingOk?: boolean } = {}
): void {
  runBsrSnapshotQualityUpsert(db.prepare(bsrSnapshotQualityUpsertSql(options.preserveExistingOk)), input);
}

export function bsrSnapshotQualityUpsertSql(preserveExistingOk = false): string {
  return `INSERT INTO amazon_bsr_snapshot_quality
   (snapshot_date, source_type, source_id, source_name, marketplace, category, expected_count,
    actual_count, unique_asin_count, unique_rank_count, min_rank, max_rank, quality_status, issue)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(snapshot_date, source_type, source_id, category) DO UPDATE SET
    source_name = excluded.source_name,
    marketplace = excluded.marketplace,
    expected_count = excluded.expected_count,
    actual_count = excluded.actual_count,
    unique_asin_count = excluded.unique_asin_count,
    unique_rank_count = excluded.unique_rank_count,
    min_rank = excluded.min_rank,
    max_rank = excluded.max_rank,
    quality_status = excluded.quality_status,
    issue = excluded.issue${preserveExistingOk ? " WHERE amazon_bsr_snapshot_quality.quality_status <> 'ok' OR excluded.quality_status = 'ok'" : ""}`;
}

export function runBsrSnapshotQualityUpsert(stmt: ReturnType<DatabaseSync["prepare"]>, input: Omit<BsrSnapshotQuality, "id" | "createdAt">): void {
  stmt.run(
    input.snapshotDate,
    input.sourceType,
    input.sourceId,
    input.sourceName,
    input.marketplace,
    input.category,
    input.expectedCount,
    input.actualCount,
    input.uniqueAsinCount,
    input.uniqueRankCount,
    input.minRank,
    input.maxRank,
    input.qualityStatus,
    input.issue
  );
}

export function expectedBsrCount(db: DatabaseSync, sourceType: BsrSourceType, sourceId: number | null): number | null {
  if (sourceType !== "category_bestseller" || sourceId === null) {
    return null;
  }
  const row = db.prepare("SELECT crawl_top_n FROM amazon_bestseller_category_monitor WHERE id = ?").get(sourceId) as
    | { crawl_top_n: number | null }
    | undefined;
  return row?.crawl_top_n ?? 100;
}

export function bsrQualityFromCounts(
  actualCount: number,
  uniqueAsinCount: number,
  uniqueRankCount: number,
  minRank: number | null,
  maxRank: number | null,
  expectedCount: number | null,
  ranks: number[] = []
): { status: BsrSnapshotQuality["qualityStatus"]; issue: string | null } {
  if (actualCount <= 0) {
    return { status: "empty", issue: "No BSR rows were saved for this scope." };
  }
  if (expectedCount !== null && actualCount < expectedCount) {
    const detail = describeRankCoverageGaps(ranks, expectedCount);
    return { status: "partial", issue: `Expected ${expectedCount} rows, saved ${actualCount}.${detail ? ` ${detail}` : ""}` };
  }
  if (expectedCount !== null && uniqueAsinCount < expectedCount) {
    return { status: "partial", issue: `Expected ${expectedCount} unique ASINs, saved ${uniqueAsinCount}.` };
  }
  if (expectedCount !== null && uniqueRankCount < expectedCount) {
    const detail = describeRankCoverageGaps(ranks, expectedCount);
    return { status: "partial", issue: `Expected ${expectedCount} unique ranks, saved ${uniqueRankCount}.${detail ? ` ${detail}` : ""}` };
  }
  if (expectedCount !== null && minRank !== null && minRank !== 1) {
    return { status: "partial", issue: `Expected rank coverage to start at #1, started at #${minRank}.` };
  }
  if (expectedCount !== null && maxRank !== null && maxRank !== expectedCount) {
    return { status: "partial", issue: `Expected max rank ${expectedCount}, saved max rank ${maxRank}.` };
  }
  return { status: "ok", issue: null };
}

export function parseRankCsv(value: string | null): number[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => Number(item))
    .filter((rank) => Number.isFinite(rank) && rank > 0);
}
