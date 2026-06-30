import type { DatabaseSync } from "node:sqlite";
import { inferIceType } from "@amazon-monitor/shared";
import type { BestsellerRankSnapshot, CompetitorActivityEvent } from "@amazon-monitor/shared";
import { categoryCompetitorReasons, categoryCompetitorTier } from "./competitor-domain.js";
import { serpKeywordCountsByAsinMarket } from "./keyword-snapshot-store.js";
import { mapBestsellerSnapshot, type BestsellerSnapshotRow } from "./snapshot-mappers.js";
import { sanitizeBestsellerSnapshotRows } from "./review-guards.js";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq, withTransaction } from "./sql-utils.js";
import type { Store } from "./types.js";

type CategorySnapshotStoreMethods = Pick<
  Store,
  | "deleteCategorySnapshotsForDate"
  | "insertCategorySnapshots"
  | "listCategorySnapshots"
  | "getPreviousCategorySnapshots"
  | "upsertProductMasterFromCategorySnapshots"
  | "upsertCompetitorsFromCategorySnapshots"
>;

export function createCategorySnapshotStore(db: DatabaseSync): CategorySnapshotStoreMethods {
  return {
    deleteCategorySnapshotsForDate(categoryId, date) {
      withTransaction(db, () => {
        db.prepare("DELETE FROM amazon_bestseller_rank_snapshot WHERE category_id = ? AND snapshot_date = ?").run(categoryId, date);
        db.prepare("DELETE FROM amazon_bsr_rank_history WHERE source_type = 'category_bestseller' AND source_id = ? AND snapshot_date = ?").run(
          categoryId,
          date
        );
        db.prepare("DELETE FROM amazon_bsr_snapshot_quality WHERE source_type = 'category_bestseller' AND source_id = ? AND snapshot_date = ?").run(
          categoryId,
          date
        );
        db.prepare("DELETE FROM amazon_product_price_history WHERE category_id = ? AND snapshot_date = ?").run(categoryId, date);
        db.prepare("DELETE FROM amazon_brand_matrix_snapshot WHERE category_id = ? AND snapshot_date = ?").run(categoryId, date);
        db.prepare("DELETE FROM amazon_competitor_signal_log WHERE source_type = 'category' AND category_id = ? AND signal_date = ?").run(
          categoryId,
          date
        );
        db.prepare("DELETE FROM amazon_competitor_activity_event WHERE category_id = ? AND event_date = ?").run(categoryId, date);
        db.prepare("DELETE FROM amazon_competitor_action_insight WHERE source_type = 'category_bestseller' AND source_id = ? AND insight_date = ?").run(
          categoryId,
          date
        );
        db.prepare("DELETE FROM amazon_category_daily_report WHERE category_id = ? AND report_date = ?").run(categoryId, date);
      });
    },

    insertCategorySnapshots(items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_bestseller_rank_snapshot
        (category_id, category_name, marketplace, snapshot_date, rank_no, asin, title, brand, image_url, product_url,
         current_price, original_price, coupon_text, coupon_value, coupon_rate, final_estimated_price, currency,
         rating, review_count, ice_type, is_prime, deal_badge, bsr_rank, bsr_category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      withTransaction(db, () => {
        for (const item of items) {
          stmt.run(
            item.categoryId,
            item.categoryName,
            item.marketplace,
            item.snapshotDate,
            item.rank,
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
            item.isPrime ? 1 : 0,
            item.dealBadge,
            item.bsrRank,
            item.bsrCategory
          );
        }
      });
    },

    listCategorySnapshots(filter = {}) {
      const { sql: where, params } = buildWhere(whereEq("snapshot_date", filter.date), whereEq("category_id", filter.categoryId), whereEq("asin", filter.asin));
      const clamped = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);
      const pagination = clamped > 0
        ? (offset > 0 ? `LIMIT ${clamped} OFFSET ${offset}` : `LIMIT ${clamped}`)
        : (offset > 0 ? `LIMIT -1 OFFSET ${offset}` : "");
      const rows = db.prepare(`SELECT * FROM amazon_bestseller_rank_snapshot ${where} ORDER BY snapshot_date DESC, category_id, rank_no ${pagination}`).all(
        ...params
      ) as unknown as BestsellerSnapshotRow[];
      return sanitizeBestsellerSnapshotRows(db, rows).map((row) => mapBestsellerSnapshot(row));
    },

    getPreviousCategorySnapshots(categoryId, beforeDate) {
      const row = db
        .prepare(
          `SELECT snapshot_date FROM amazon_bestseller_rank_snapshot
           WHERE category_id = ? AND snapshot_date < ?
           GROUP BY snapshot_date
           ORDER BY snapshot_date DESC
           LIMIT 1`
        )
        .get(categoryId, beforeDate) as { snapshot_date: string } | undefined;
      return row ? this.listCategorySnapshots({ categoryId, date: row.snapshot_date }) : [];
    },

    upsertProductMasterFromCategorySnapshots(items) {
      const unique = new Map<string, BestsellerRankSnapshot>();
      for (const item of items) {
        unique.set(`${item.marketplace}:${item.asin}`, item);
      }
      const stmt = db.prepare(
        `INSERT INTO amazon_product_master
         (asin, marketplace, title, brand, image_url, product_url, first_seen_date, first_seen_category,
          last_seen_date, latest_category_name, latest_rank, latest_price, rating, review_count, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(asin, marketplace) DO UPDATE SET
          title = excluded.title,
          brand = COALESCE(excluded.brand, amazon_product_master.brand),
          image_url = excluded.image_url,
          product_url = excluded.product_url,
          last_seen_date = excluded.last_seen_date,
          latest_category_name = excluded.latest_category_name,
          latest_rank = excluded.latest_rank,
          latest_price = excluded.latest_price,
          rating = excluded.rating,
          review_count = excluded.review_count,
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
            item.productUrl,
            item.snapshotDate,
            item.categoryName,
            item.snapshotDate,
            item.categoryName,
            item.rank,
            item.currentPrice,
            item.rating,
            item.reviewCount,
            nowIso()
          );
        }
      });
    },

    upsertCompetitorsFromCategorySnapshots(items, activityEvents = []) {
      const unique = new Map<string, BestsellerRankSnapshot>();
      for (const item of items) {
        unique.set(`${item.marketplace}:${item.asin}`, item);
      }
      const eventsByAsin = new Map<string, CompetitorActivityEvent[]>();
      for (const event of activityEvents) {
        if (!event.asin) {
          continue;
        }
        const key = `${event.marketplace}:${event.asin}`;
        const events = eventsByAsin.get(key);
        if (events) {
          events.push(event);
        } else {
          eventsByAsin.set(key, [event]);
        }
      }
      const keywordCounts = serpKeywordCountsByAsinMarket(db, Array.from(unique.values()));
      const stmt = db.prepare(
        `INSERT INTO amazon_competitor_pool
         (asin, marketplace, title, brand, image_url, first_seen_keyword, first_seen_date, last_seen_date,
          appear_keyword_count, best_rank, latest_rank, lowest_price, latest_price, latest_review_count, latest_product_url,
          coupon_text, deal_badge,
          latest_bsr_rank, latest_bsr_category, latest_bsr_text, latest_bestseller_ranks_json,
          source_type, first_seen_source, latest_category_name, latest_category_rank, ice_type, competitor_tier, competitor_reasons_json,
          is_key_competitor, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'category', ?, ?, ?, ?, ?, ?, 0, 1, ?)
         ON CONFLICT(asin, marketplace) DO UPDATE SET
          title = excluded.title,
          brand = COALESCE(excluded.brand, amazon_competitor_pool.brand),
          image_url = excluded.image_url,
          last_seen_date = excluded.last_seen_date,
          appear_keyword_count = excluded.appear_keyword_count,
          best_rank = CASE
            WHEN amazon_competitor_pool.best_rank IS NULL THEN excluded.best_rank
            WHEN excluded.best_rank IS NULL THEN amazon_competitor_pool.best_rank
            ELSE MIN(amazon_competitor_pool.best_rank, excluded.best_rank)
          END,
          latest_rank = CASE
            WHEN amazon_competitor_pool.source_type IN ('category', 'hybrid') THEN excluded.latest_rank
            ELSE amazon_competitor_pool.latest_rank
          END,
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
          source_type = CASE
            WHEN amazon_competitor_pool.source_type = 'keyword' THEN 'hybrid'
            WHEN amazon_competitor_pool.source_type = 'hybrid' THEN 'hybrid'
            ELSE 'category'
          END,
          first_seen_source = COALESCE(amazon_competitor_pool.first_seen_source, excluded.first_seen_source),
          latest_category_name = excluded.latest_category_name,
          latest_category_rank = excluded.latest_category_rank,
          ice_type = excluded.ice_type,
          competitor_tier = CASE
            WHEN amazon_competitor_pool.competitor_tier = 'core' OR excluded.competitor_tier = 'core' THEN 'core'
            WHEN amazon_competitor_pool.competitor_tier = 'rising' OR excluded.competitor_tier = 'rising' THEN 'rising'
            WHEN amazon_competitor_pool.competitor_tier = 'activity' OR excluded.competitor_tier = 'activity' THEN 'activity'
            ELSE 'watch'
          END,
          competitor_reasons_json = excluded.competitor_reasons_json,
          updated_at = excluded.updated_at`
      );
      withTransaction(db, () => {
        for (const item of unique.values()) {
          const events = eventsByAsin.get(`${item.marketplace}:${item.asin}`) ?? [];
          const tier = categoryCompetitorTier(item, events);
          stmt.run(
            item.asin,
            item.marketplace,
            item.title,
            item.brand,
            item.imageUrl,
            `[Category] ${item.categoryName}`,
            item.snapshotDate,
            item.snapshotDate,
            keywordCounts.get(`${item.marketplace}:${item.asin}`) ?? 0,
            item.rank,
            item.rank,
            item.currentPrice,
            item.currentPrice,
            item.reviewCount,
            item.productUrl,
            item.couponText,
            item.dealBadge,
            item.bsrRank,
            item.bsrCategory,
            null,
            JSON.stringify([{ rank: item.bsrRank ?? item.rank, category: item.bsrCategory ?? item.categoryName, url: null }]),
            `category:${item.categoryName}`,
            item.categoryName,
            item.rank,
            item.iceType ?? inferIceType(item.title),
            tier,
            JSON.stringify(categoryCompetitorReasons(item, events)),
            nowIso()
          );
        }
      });
    },

  };
}

