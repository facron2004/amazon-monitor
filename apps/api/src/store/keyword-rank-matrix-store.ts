import type { DatabaseSync } from "node:sqlite";
import { buildKeywordRankMatrix } from "@amazon-monitor/shared";
import type {
  KeywordMonitor,
  KeywordRankMatrixProductReference,
  KeywordRankMatrixResponse,
  SerpSnapshot
} from "@amazon-monitor/shared";
import { mapSnapshot, type SnapshotRow } from "./serp-mappers.js";

interface SnapshotDateRow {
  snapshot_date: string | null;
}

interface ProductReferenceRow {
  asin: string;
  marketplace: string;
  kind: "owned" | "competitor";
  is_key_competitor: number;
}

export function getKeywordRankMatrix(
  db: DatabaseSync,
  organizationId: number,
  requestedDate: string,
  keywords: KeywordMonitor[]
): KeywordRankMatrixResponse {
  const date = latestSnapshotDate(db, organizationId, requestedDate);
  const previousDate = date ? shiftDate(date, -1) : null;
  const sevenDayDate = date ? shiftDate(date, -7) : null;
  const snapshots = date && previousDate && sevenDayDate
    ? snapshotsForDates(db, organizationId, [date, previousDate, sevenDayDate])
    : [];

  return buildKeywordRankMatrix({
    requestedDate,
    date,
    previousDate,
    sevenDayDate,
    keywords,
    monitoredProducts: productReferences(db, organizationId),
    current: snapshots.filter((item) => item.snapshotDate === date),
    previous: snapshots.filter((item) => item.snapshotDate === previousDate),
    sevenDay: snapshots.filter((item) => item.snapshotDate === sevenDayDate)
  });
}

function latestSnapshotDate(db: DatabaseSync, organizationId: number, requestedDate: string): string | null {
  const row = db.prepare(
    `SELECT MAX(snapshot_date) AS snapshot_date
     FROM amazon_keyword_serp_snapshot s
     INNER JOIN amazon_keyword_monitor m ON m.id = s.keyword_id
     WHERE m.org_id = ? AND s.snapshot_date <= ?`
  ).get(organizationId, requestedDate) as unknown as SnapshotDateRow;
  return row.snapshot_date;
}

function snapshotsForDates(db: DatabaseSync, organizationId: number, dates: [string, string, string]): SerpSnapshot[] {
  const rows = db.prepare(
    `SELECT s.* FROM amazon_keyword_serp_snapshot s
     INNER JOIN amazon_keyword_monitor m ON m.id = s.keyword_id
     WHERE m.org_id = ? AND s.snapshot_date IN (?, ?, ?)
     ORDER BY s.snapshot_date DESC, s.keyword_id, s.absolute_rank`
  ).all(organizationId, ...dates) as unknown as SnapshotRow[];
  return rows.map(mapSnapshot);
}

function productReferences(db: DatabaseSync, organizationId: number): KeywordRankMatrixProductReference[] {
  const rows = db.prepare(
    `SELECT asin, marketplace, 'owned' AS kind, 0 AS is_key_competitor
     FROM own_products
     WHERE org_id = ? AND status = 'active'
     UNION ALL
     SELECT asin, marketplace, 'competitor' AS kind, is_key_competitor
     FROM amazon_competitor_pool
     WHERE org_id = ? AND status = 1`
  ).all(organizationId, organizationId) as unknown as ProductReferenceRow[];
  return rows.map((row) => ({
    asin: row.asin,
    marketplace: row.marketplace,
    kind: row.kind,
    isKeyCompetitor: row.is_key_competitor === 1
  }));
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
