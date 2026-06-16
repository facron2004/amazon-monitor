import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { inferIceType } from "@amazon-monitor/shared";
import type { SerpSnapshot } from "@amazon-monitor/shared";
import {
  mapCompetitor,
  mapCompetitorFolder,
  type CompetitorFolderRow,
  type CompetitorRow
} from "./competitor-mappers.js";
import { keywordCompetitorReasons, keywordCompetitorTier } from "./competitor-domain.js";
import { mapSnapshot, type SnapshotRow } from "./serp-mappers.js";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq, withTransaction } from "./sql-utils.js";
import type { Store } from "./types.js";

type KeywordSnapshotStoreMethods = Pick<
  Store,
  | "deleteSnapshotsForKeywordDate"
  | "insertSnapshots"
  | "listSnapshots"
  | "getPreviousSnapshots"
  | "getHistoryLowestPrices"
  | "upsertCompetitorsFromSnapshots"
  | "listCompetitors"
  | "listCompetitorFolders"
  | "getProductLink"
>;

export function createKeywordSnapshotStore(db: DatabaseSync): KeywordSnapshotStoreMethods {
  return {
    deleteSnapshotsForKeywordDate(keywordId, date) {
      db.prepare("DELETE FROM amazon_keyword_serp_snapshot WHERE keyword_id = ? AND snapshot_date = ?").run(keywordId, date);
    },

    insertSnapshots(items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_keyword_serp_snapshot
         (keyword_id, keyword, marketplace, snapshot_date, page_no, position_in_page, absolute_rank, organic_rank, sponsored_rank,
          asin, title, brand, image_url, product_url, current_price, original_price, coupon_text, coupon_value, coupon_rate,
          final_estimated_price, currency, rating, review_count, ice_type, is_sponsored, is_prime, deal_badge, delivery_text,
          bsr_rank, bsr_category, bsr_text, bestseller_ranks_json, detail_collected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      withTransaction(db, () => {
        for (const item of items) {
          stmt.run(
            item.keywordId,
            item.keyword,
            item.marketplace,
            item.snapshotDate,
            item.pageNo,
            item.positionInPage,
            item.absoluteRank,
            item.organicRank,
            item.sponsoredRank,
            item.asin,
            item.title,
            item.brand,
            item.imageUrl,
            item.productUrl,
            item.currentPrice,
            item.originalPrice ?? null,
            item.couponText,
            item.couponValue,
            item.couponRate,
            item.finalEstimatedPrice,
            item.currency,
            item.rating,
            item.reviewCount,
            item.iceType ?? inferIceType(item.title),
            item.isSponsored ? 1 : 0,
            item.isPrime ? 1 : 0,
            item.dealBadge,
            item.deliveryText,
            item.bsrRank,
            item.bsrCategory,
            item.bsrText,
            JSON.stringify(item.bestsellerRanks ?? []),
            item.detailCollectedAt ?? null
          );
        }
      });
    },

    listSnapshots(filter = {}) {
      return listSnapshots(db, filter);
    },

    getPreviousSnapshots(keywordId, beforeDate) {
      const row = db
        .prepare(
          `SELECT snapshot_date FROM amazon_keyword_serp_snapshot
           WHERE keyword_id = ? AND snapshot_date < ?
           GROUP BY snapshot_date
           ORDER BY snapshot_date DESC
           LIMIT 1`
        )
        .get(keywordId, beforeDate) as { snapshot_date: string } | undefined;
      return row ? listSnapshots(db, { keywordId, date: row.snapshot_date }) : [];
    },

    getHistoryLowestPrices(asins) {
      if (!asins.length) {
        return {};
      }
      const placeholders = asins.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT asin, MIN(current_price) AS low_price
           FROM amazon_keyword_serp_snapshot
           WHERE asin IN (${placeholders}) AND current_price IS NOT NULL
           GROUP BY asin`
        )
        .all(...asins) as Array<{ asin: string; low_price: number | null }>;
      const result: Record<string, number | null> = {};
      for (const asin of asins) {
        result[asin] = rows.find((row) => row.asin === asin)?.low_price ?? null;
      }
      return result;
    },

    upsertCompetitorsFromSnapshots(items) {
      const unique = new Map<string, SerpSnapshot>();
      for (const item of items) {
        unique.set(`${item.marketplace}:${item.asin}`, item);
      }
      const stmt = db.prepare(
        `INSERT INTO amazon_competitor_pool
         (asin, marketplace, title, brand, image_url, first_seen_keyword, first_seen_date, last_seen_date,
           appear_keyword_count, best_rank, latest_rank, lowest_price, latest_price, latest_review_count, latest_product_url,
           coupon_text, deal_badge,
           latest_bsr_rank, latest_bsr_category, latest_bsr_text, latest_bestseller_ranks_json,
           source_type, first_seen_source, latest_category_name, latest_category_rank, ice_type, competitor_tier, competitor_reasons_json,
           is_key_competitor, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'keyword', ?, NULL, NULL, ?, ?, ?, 0, 1, ?)
         ON CONFLICT(asin, marketplace) DO UPDATE SET
           title = excluded.title,
           brand = COALESCE(excluded.brand, amazon_competitor_pool.brand),
           image_url = excluded.image_url,
           last_seen_date = excluded.last_seen_date,
          appear_keyword_count = (
            SELECT COUNT(DISTINCT keyword) FROM amazon_keyword_serp_snapshot
            WHERE asin = excluded.asin AND marketplace = excluded.marketplace
          ),
          best_rank = MIN(amazon_competitor_pool.best_rank, excluded.best_rank),
          latest_rank = excluded.latest_rank,
          lowest_price = CASE
            WHEN amazon_competitor_pool.lowest_price IS NULL THEN excluded.lowest_price
            WHEN excluded.lowest_price IS NULL THEN amazon_competitor_pool.lowest_price
            ELSE MIN(amazon_competitor_pool.lowest_price, excluded.lowest_price)
          END,
          latest_price = excluded.latest_price,
          latest_review_count = excluded.latest_review_count,
          latest_product_url = excluded.latest_product_url,
          coupon_text = excluded.coupon_text,
          deal_badge = excluded.deal_badge,
           latest_bsr_rank = excluded.latest_bsr_rank,
           latest_bsr_category = excluded.latest_bsr_category,
           latest_bsr_text = excluded.latest_bsr_text,
           latest_bestseller_ranks_json = excluded.latest_bestseller_ranks_json,
           source_type = CASE
             WHEN amazon_competitor_pool.source_type = 'category' THEN 'hybrid'
             WHEN amazon_competitor_pool.source_type = 'hybrid' THEN 'hybrid'
             ELSE 'keyword'
           END,
           first_seen_source = COALESCE(amazon_competitor_pool.first_seen_source, excluded.first_seen_source),
           ice_type = excluded.ice_type,
           competitor_tier = CASE
             WHEN amazon_competitor_pool.competitor_tier = 'core' THEN 'core'
             ELSE excluded.competitor_tier
           END,
           competitor_reasons_json = excluded.competitor_reasons_json,
           updated_at = excluded.updated_at`
      );
      withTransaction(db, () => {
        for (const item of unique.values()) {
          stmt.run(
            item.asin,
            item.marketplace,
            item.title,
            item.brand,
            item.imageUrl,
            item.keyword,
            item.snapshotDate,
            item.snapshotDate,
            item.absoluteRank,
            item.absoluteRank,
            item.currentPrice,
            item.currentPrice,
            item.reviewCount,
            item.productUrl,
            item.couponText,
            item.dealBadge,
            item.bsrRank,
            item.bsrCategory,
            item.bsrText,
            JSON.stringify(item.bestsellerRanks ?? []),
            `keyword:${item.keyword}`,
            item.iceType ?? inferIceType(item.title),
            keywordCompetitorTier(item),
            JSON.stringify(keywordCompetitorReasons(item)),
            nowIso()
          );
        }
      });
    },

    listCompetitors(filter = {}) {
      const clauses = ["cp.status = 1"];
      const params: SQLInputValue[] = [];
      if (filter.keywordId) {
        clauses.push("EXISTS (SELECT 1 FROM amazon_keyword_serp_snapshot s WHERE s.asin = cp.asin AND s.marketplace = cp.marketplace AND s.keyword_id = ?)");
        params.push(filter.keywordId);
      }
      if (filter.keyword) {
        clauses.push("EXISTS (SELECT 1 FROM amazon_keyword_serp_snapshot s WHERE s.asin = cp.asin AND s.marketplace = cp.marketplace AND s.keyword = ?)");
        params.push(filter.keyword);
      }
      if (filter.sourceType) {
        clauses.push("cp.source_type = ?");
        params.push(filter.sourceType);
      }
      if (filter.tier) {
        clauses.push("cp.competitor_tier = ?");
        params.push(filter.tier);
      }
      return (
        db
          .prepare(
            `SELECT cp.* FROM amazon_competitor_pool cp
             WHERE ${clauses.join(" AND ")}
             ORDER BY cp.is_key_competitor DESC,
              CASE cp.competitor_tier
                WHEN 'core' THEN 1
                WHEN 'rising' THEN 2
                WHEN 'activity' THEN 3
                ELSE 4
              END,
              COALESCE(cp.latest_category_rank, cp.latest_bsr_rank, cp.latest_rank, 999999),
              cp.asin`
          )
          .all(...params) as unknown as CompetitorRow[]
      ).map(mapCompetitor);
    },

    listCompetitorFolders() {
      return (
        db
          .prepare(
            `SELECT
              k.id AS keyword_id,
              k.keyword,
              k.marketplace,
              COUNT(DISTINCT s.asin) AS competitor_count,
              MAX(s.snapshot_date) AS latest_snapshot_date
            FROM amazon_keyword_monitor k
            LEFT JOIN amazon_keyword_serp_snapshot s ON s.keyword_id = k.id
            GROUP BY k.id, k.keyword, k.marketplace
            ORDER BY k.id`
          )
          .all() as unknown as CompetitorFolderRow[]
      ).map(mapCompetitorFolder);
    },

    getProductLink(asin, keywordId) {
      const params: SQLInputValue[] = [asin];
      const keywordClause = keywordId ? "AND keyword_id = ?" : "";
      if (keywordId) {
        params.push(keywordId);
      }
      const snapshot = db
        .prepare(
          `SELECT asin, marketplace, product_url FROM amazon_keyword_serp_snapshot
           WHERE asin = ? ${keywordClause}
           ORDER BY snapshot_date DESC, absolute_rank ASC
           LIMIT 1`
        )
        .get(...params) as { asin: string; marketplace: string; product_url: string | null } | undefined;
      if (snapshot?.product_url) {
        return { asin: snapshot.asin, marketplace: snapshot.marketplace, url: snapshot.product_url };
      }

      const competitor = db.prepare("SELECT asin, marketplace, latest_product_url FROM amazon_competitor_pool WHERE asin = ? LIMIT 1").get(asin) as
        | { asin: string; marketplace: string; latest_product_url: string | null }
        | undefined;
      return competitor?.latest_product_url
        ? { asin: competitor.asin, marketplace: competitor.marketplace, url: competitor.latest_product_url }
        : null;
    }
  };
}

function listSnapshots(
  db: DatabaseSync,
  filter: Parameters<Store["listSnapshots"]>[0] = {}
): ReturnType<Store["listSnapshots"]> {
  const { sql: where, params } = buildWhere(whereEq("snapshot_date", filter.date), whereEq("keyword_id", filter.keywordId), whereEq("keyword", filter.keyword));
  const clamped = clampLimit(filter.limit);
  const offset = clampOffset(filter.offset);
  const pagination = clamped > 0
    ? (offset > 0 ? `LIMIT ${clamped} OFFSET ${offset}` : `LIMIT ${clamped}`)
    : (offset > 0 ? `LIMIT -1 OFFSET ${offset}` : "");
  return (
    db
      .prepare(
        `SELECT * FROM amazon_keyword_serp_snapshot ${where}
         ORDER BY snapshot_date DESC, keyword_id, absolute_rank
         ${pagination}`
      )
      .all(...params) as unknown as SnapshotRow[]
  ).map(mapSnapshot);
}
