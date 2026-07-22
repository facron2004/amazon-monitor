import type { DatabaseSync } from "node:sqlite";
import { inferIceType } from "@amazon-monitor/shared";
import { mapSnapshot, type SnapshotRow } from "./serp-mappers.js";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq, whereGte, whereLte, whereMarketplace, withTransaction } from "./sql-utils.js";
import type { Store } from "./types.js";

type KeywordSnapshotStoreMethods = Pick<
  Store,
  | "deleteSnapshotsForKeywordDate"
  | "insertSnapshots"
  | "listSnapshots"
  | "getPreviousSnapshots"
  | "getHistoryLowestPrices"
>;

export function createKeywordSnapshotStore(db: DatabaseSync): KeywordSnapshotStoreMethods {
  return {
    deleteSnapshotsForKeywordDate(keywordId, date) {
      withTransaction(db, () => {
        db.prepare("DELETE FROM amazon_keyword_serp_snapshot WHERE keyword_id = ? AND snapshot_date = ?").run(keywordId, date);
      });
    },

    insertSnapshots(items) {
      const statement = db.prepare(
        `INSERT INTO amazon_keyword_serp_snapshot
         (keyword_id, keyword, marketplace, snapshot_date, page_no, position_in_page, absolute_rank, organic_rank, sponsored_rank,
          asin, title, brand, image_url, product_url, current_price, original_price, coupon_text, coupon_value, coupon_rate,
          final_estimated_price, currency, rating, review_count, ice_type, is_sponsored, is_prime, deal_badge, delivery_text,
          bsr_rank, bsr_category, bsr_text, bestseller_ranks_json, detail_collected_at, data_source, last_synced_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const storedAt = nowIso();
      withTransaction(db, () => {
        for (const item of items) {
          statement.run(
            item.keywordId, item.keyword, item.marketplace, item.snapshotDate, item.pageNo, item.positionInPage,
            item.absoluteRank, item.organicRank, item.sponsoredRank, item.asin, item.title, item.brand,
            item.imageUrl, item.productUrl, item.currentPrice, item.originalPrice ?? null, item.couponText,
            item.couponValue, item.couponRate, item.finalEstimatedPrice, item.currency, item.rating,
            item.reviewCount, item.iceType ?? inferIceType(item.title), item.isSponsored ? 1 : 0,
            item.isPrime ? 1 : 0, item.dealBadge, item.deliveryText, item.bsrRank, item.bsrCategory,
            item.bsrText, JSON.stringify(item.bestsellerRanks ?? []), item.detailCollectedAt ?? null,
            item.dataSource?.trim() || "manual", item.lastSyncedAt ?? storedAt, item.syncStatus ?? "manual"
          );
        }
      });
    },

    listSnapshots(filter = {}) {
      return listSnapshots(db, filter);
    },

    getPreviousSnapshots(keywordId, beforeDate) {
      const row = db.prepare(
        `SELECT snapshot_date FROM amazon_keyword_serp_snapshot
         WHERE keyword_id = ? AND snapshot_date < ?
         GROUP BY snapshot_date ORDER BY snapshot_date DESC LIMIT 1`
      ).get(keywordId, beforeDate) as { snapshot_date: string } | undefined;
      return row ? listSnapshots(db, { keywordId, date: row.snapshot_date }) : [];
    },

    getHistoryLowestPrices(asins, orgId) {
      if (!asins.length) return {};
      const placeholders = asins.map(() => "?").join(",");
      const rows = db.prepare(
        `SELECT asin, MIN(current_price) AS low_price
         FROM amazon_keyword_serp_snapshot
         WHERE asin IN (${placeholders}) AND current_price IS NOT NULL
           AND (? IS NULL OR EXISTS (
             SELECT 1 FROM amazon_keyword_monitor m
             WHERE m.id = amazon_keyword_serp_snapshot.keyword_id AND m.org_id = ?
           ))
         GROUP BY asin`
      ).all(...asins, orgId ?? null, orgId ?? null) as Array<{ asin: string; low_price: number | null }>;
      const result: Record<string, number | null> = {};
      for (const asin of asins) {
        result[asin] = rows.find((row) => row.asin === asin)?.low_price ?? null;
      }
      return result;
    }
  };
}

function listSnapshots(
  db: DatabaseSync,
  filter: Parameters<Store["listSnapshots"]>[0] = {}
): ReturnType<Store["listSnapshots"]> {
  const { sql: where, params } = buildWhere(
    whereEq("s.snapshot_date", filter.date),
    whereEq("s.keyword_id", filter.keywordId),
    whereEq("s.keyword", filter.keyword),
    whereEq("s.asin", filter.asin),
    whereMarketplace("s.marketplace", filter.marketplace),
    whereGte("s.snapshot_date", filter.startDate),
    whereLte("s.snapshot_date", filter.endDate),
    whereEq("m.org_id", filter.orgId)
  );
  const limit = clampLimit(filter.limit);
  const offset = clampOffset(filter.offset);
  const pagination = limit > 0
    ? (offset > 0 ? `LIMIT ${limit} OFFSET ${offset}` : `LIMIT ${limit}`)
    : (offset > 0 ? `LIMIT -1 OFFSET ${offset}` : "");
  const rows = db.prepare(
    `SELECT s.* FROM amazon_keyword_serp_snapshot s
     INNER JOIN amazon_keyword_monitor m ON m.id = s.keyword_id
     ${where}
     ORDER BY s.snapshot_date DESC, s.keyword_id, s.absolute_rank
     ${pagination}`
  ).all(...params) as unknown as SnapshotRow[];
  return rows.map(mapSnapshot);
}

export function serpKeywordCountsByAsinMarket(
  db: DatabaseSync,
  items: Array<{ asin: string; marketplace: string }>,
  orgId?: number
): Map<string, number> {
  const uniquePairs = new Map<string, { asin: string; marketplace: string }>();
  for (const item of items) uniquePairs.set(`${item.marketplace}\0${item.asin}`, item);
  if (uniquePairs.size === 0) return new Map();

  const pairs = Array.from(uniquePairs.values());
  const valuesSql = pairs.map(() => "(?, ?)").join(", ");
  const params = pairs.flatMap((item) => [item.asin, item.marketplace]);
  const rows = db.prepare(
    `WITH target(asin, marketplace) AS (VALUES ${valuesSql})
     SELECT target.asin, target.marketplace, COUNT(DISTINCT s.keyword) AS keyword_count
     FROM target
     LEFT JOIN amazon_keyword_serp_snapshot s
      ON s.asin = target.asin AND s.marketplace = target.marketplace
      AND (? IS NULL OR EXISTS (
        SELECT 1 FROM amazon_keyword_monitor m WHERE m.id = s.keyword_id AND m.org_id = ?
      ))
     GROUP BY target.asin, target.marketplace`
  ).all(...params, orgId ?? null, orgId ?? null) as Array<{ asin: string; marketplace: string; keyword_count: number }>;
  return new Map(rows.map((row) => [`${row.marketplace}:${row.asin}`, Number(row.keyword_count)]));
}
