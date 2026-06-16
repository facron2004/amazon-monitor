import type { DatabaseSync } from "node:sqlite";
import { selectSpecificBestsellerRank } from "@amazon-monitor/shared";
import type { BsrRankHistory, BsrSourceType, ProductRanking } from "@amazon-monitor/shared";
import { mapBsrRankHistory, type BsrRankHistoryRow } from "./bsr-mappers.js";
import { parseJsonArray } from "./json-utils.js";
import { buildWhere, whereEq, withTransaction } from "./sql-utils.js";

export function backfillBsrRankHistory(db: DatabaseSync): void {
  const categoryBackfill = db.prepare(
    `INSERT OR IGNORE INTO amazon_bsr_rank_history
     (snapshot_date, source_type, source_id, source_name, marketplace, asin, title, brand, category,
      rank_no, rank_url, product_url, current_price, parent_rank, is_specific_rank)
     SELECT
      s.snapshot_date,
      'category_bestseller',
      s.category_id,
      s.category_name,
      s.marketplace,
      s.asin,
      COALESCE(s.title, s.asin),
      s.brand,
      s.category_name,
      s.rank_no,
      c.category_url,
      s.product_url,
      s.current_price,
      NULL,
      1
     FROM amazon_bestseller_rank_snapshot s
     LEFT JOIN amazon_bestseller_category_monitor c ON c.id = s.category_id
     WHERE s.asin IS NOT NULL AND s.category_name IS NOT NULL`
  );
  const keywordRows = db
    .prepare(
      `SELECT keyword_id, keyword, marketplace, snapshot_date, asin, title, brand, product_url, current_price, bestseller_ranks_json
       FROM amazon_keyword_serp_snapshot
       WHERE asin IS NOT NULL AND bestseller_ranks_json IS NOT NULL AND bestseller_ranks_json <> ''`
    )
    .all() as Array<{
    keyword_id: number;
    keyword: string;
    marketplace: string;
    snapshot_date: string;
    asin: string;
    title: string | null;
    brand: string | null;
    product_url: string | null;
    current_price: number | null;
    bestseller_ranks_json: string | null;
  }>;
  const keywordBackfill = db.prepare(
    `INSERT OR IGNORE INTO amazon_bsr_rank_history
     (snapshot_date, source_type, source_id, source_name, marketplace, asin, title, brand, category,
      rank_no, rank_url, product_url, current_price, parent_rank, is_specific_rank)
     VALUES (?, 'keyword_detail', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  withTransaction(db, () => {
    categoryBackfill.run();
    for (const row of keywordRows) {
      const ranks = parseJsonArray<ProductRanking>(row.bestseller_ranks_json);
      const specific = selectSpecificBestsellerRank(ranks);
      const parentRank = ranks[0]?.rank ?? null;
      for (const rank of ranks) {
        if (!rank.category || !Number.isFinite(rank.rank) || rank.rank <= 0) {
          continue;
        }
        keywordBackfill.run(
          row.snapshot_date,
          row.keyword_id,
          row.keyword,
          row.marketplace,
          row.asin,
          row.title ?? row.asin,
          row.brand,
          rank.category,
          Math.floor(rank.rank),
          rank.url ?? null,
          row.product_url,
          row.current_price,
          parentRank,
          specific?.category === rank.category && specific.rank === rank.rank ? 1 : 0
        );
      }
    }
  });
}

export function listBsrRankHistoryRows(
  db: DatabaseSync,
  filter: { date: string; sourceType: BsrSourceType; sourceId?: number; category?: string }
): BsrRankHistory[] {
  const { sql: where, params } = buildWhere(
    whereEq("snapshot_date", filter.date),
    whereEq("source_type", filter.sourceType),
    whereEq("source_id", filter.sourceId),
    whereEq("category", filter.category)
  );
  return (
    db
      .prepare(
        `SELECT * FROM amazon_bsr_rank_history ${where}
         ORDER BY snapshot_date DESC, source_type, source_id, category, rank_no`
      )
      .all(...params) as unknown as BsrRankHistoryRow[]
  ).map(mapBsrRankHistory);
}

export function listUsableBsrRankHistoryRows(
  db: DatabaseSync,
  filter: { date: string; sourceType?: BsrSourceType; sourceId?: number; category?: string }
): BsrRankHistory[] {
  const { sql: where, params } = buildWhere(
    whereEq("h.snapshot_date", filter.date),
    whereEq("h.source_type", filter.sourceType),
    whereEq("h.source_id", filter.sourceId),
    whereEq("h.category", filter.category),
    {
      clause: `(h.source_type <> 'category_bestseller' OR EXISTS (
        SELECT 1
        FROM amazon_bsr_snapshot_quality q
        WHERE q.snapshot_date = h.snapshot_date
          AND q.source_type = h.source_type
          AND q.source_id = h.source_id
          AND q.category = h.category
          AND q.quality_status = 'ok'
      ))`
    }
  );
  return (
    db
      .prepare(
        `SELECT h.* FROM amazon_bsr_rank_history h ${where}
         ORDER BY h.snapshot_date DESC, h.source_type, h.source_id, h.category, h.rank_no`
      )
      .all(...params) as unknown as BsrRankHistoryRow[]
  ).map(mapBsrRankHistory);
}

/**
 * Batch version of listUsableBsrRankHistoryRows: loads usable BSR history rows
 * for multiple snapshot dates in a single query.
 */
export function batchListUsableBsrRankHistoryByDates(db: DatabaseSync, dates: string[]): BsrRankHistory[] {
  if (dates.length === 0) return [];
  const placeholders = dates.map(() => "?").join(", ");
  return (
    db
      .prepare(
        `SELECT h.* FROM amazon_bsr_rank_history h
         WHERE h.snapshot_date IN (${placeholders})
           AND (h.source_type <> 'category_bestseller' OR EXISTS (
             SELECT 1
             FROM amazon_bsr_snapshot_quality q
             WHERE q.snapshot_date = h.snapshot_date
               AND q.source_type = h.source_type
               AND q.source_id = h.source_id
               AND q.category = h.category
               AND q.quality_status = 'ok'
           ))
         ORDER BY h.snapshot_date DESC, h.source_type, h.source_id, h.category, h.rank_no`
      )
      .all(...dates) as unknown as BsrRankHistoryRow[]
  ).map(mapBsrRankHistory);
}
