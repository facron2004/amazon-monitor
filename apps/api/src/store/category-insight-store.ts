import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  mapActivityEvent,
  mapBrandMatrix,
  mapCategorySignal,
  type ActivityEventRow,
  type BrandMatrixRow,
  type CategorySignalRow
} from "./snapshot-mappers.js";
import { shouldExposeActivityEvent } from "./review-guards.js";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq, withTransaction } from "./sql-utils.js";
import type { Store } from "./types.js";

type CategoryInsightStoreMethods = Pick<
  Store,
  | "replaceBrandMatrix"
  | "listBrandMatrix"
  | "replaceCategorySignals"
  | "listCategorySignals"
  | "replaceCategoryActivityEvents"
  | "listCategoryActivityEvents"
  | "saveCategoryReport"
  | "getCategoryReport"
  | "getCategoryProductLink"
>;

export function createCategoryInsightStore(db: DatabaseSync): CategoryInsightStoreMethods {
  return {
    replaceBrandMatrix(categoryId, date, items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_brand_matrix_snapshot
         (category_id, category_name, marketplace, snapshot_date, brand, product_count_top100, product_count_top50,
          product_count_top20, best_rank, average_rank, new_entry_count, dropped_count, rank_up_count,
          rank_down_count, price_down_count, coupon_count, deal_count, top_asins_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      withTransaction(db, () => {
        db.prepare("DELETE FROM amazon_brand_matrix_snapshot WHERE category_id = ? AND snapshot_date = ?").run(categoryId, date);
        for (const item of items) {
          stmt.run(
            item.categoryId,
            item.categoryName,
            item.marketplace,
            item.snapshotDate,
            item.brand,
            item.productCountTop100,
            item.productCountTop50,
            item.productCountTop20,
            item.bestRank,
            item.averageRank,
            item.newEntryCount,
            item.droppedCount,
            item.rankUpCount,
            item.rankDownCount,
            item.priceDownCount,
            item.couponCount,
            item.dealCount,
            JSON.stringify(item.topAsins)
          );
        }
      });
    },

    listBrandMatrix(filter = {}) {
      const { sql: where, params } = buildWhere(whereEq("snapshot_date", filter.date), whereEq("category_id", filter.categoryId));
      return (
        db
          .prepare(
            `SELECT * FROM amazon_brand_matrix_snapshot ${where}
             ORDER BY product_count_top20 DESC, product_count_top50 DESC, product_count_top100 DESC, COALESCE(best_rank, 9999) ASC`
          )
          .all(...params) as unknown as BrandMatrixRow[]
      ).map(mapBrandMatrix);
    },

    replaceCategorySignals(categoryId, date, items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_competitor_signal_log
         (signal_date, source_type, category_id, category_name, marketplace, signal_type, alert_level, asin, brand,
          title, rank_no, previous_rank, price, previous_price, content)
         VALUES (?, 'category', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      withTransaction(db, () => {
        db.prepare("DELETE FROM amazon_competitor_signal_log WHERE source_type = 'category' AND category_id = ? AND signal_date = ?").run(categoryId, date);
        for (const item of items) {
          stmt.run(
            item.signalDate,
            item.categoryId,
            item.categoryName,
            item.marketplace,
            item.signalType,
            item.alertLevel,
            item.asin,
            item.brand,
            item.title,
            item.rank,
            item.previousRank,
            item.price,
            item.previousPrice,
            item.content
          );
        }
      });
    },

    listCategorySignals(filter = {}) {
      const { sql: where, params } = buildWhere(
        { clause: "source_type = 'category'" },
        whereEq("signal_date", filter.date),
        whereEq("category_id", filter.categoryId)
      );
      const clamped = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);
      const pagination = clamped > 0
        ? (offset > 0 ? `LIMIT ${clamped} OFFSET ${offset}` : `LIMIT ${clamped}`)
        : (offset > 0 ? `LIMIT -1 OFFSET ${offset}` : "");
      return (
        db
          .prepare(
            `SELECT * FROM amazon_competitor_signal_log
             ${where}
             ORDER BY
              CASE alert_level WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
              COALESCE(rank_no, 9999) ASC,
              id ASC
             ${pagination}`
          )
          .all(...params) as unknown as CategorySignalRow[]
      ).map(mapCategorySignal);
    },

    replaceCategoryActivityEvents(categoryId, date, items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_competitor_activity_event
         (event_key, event_date, event_type, event_level, category_id, category_name, marketplace, asin, brand,
          title, price_before, price_after, price_change_rate, review_count_before, review_count_after, review_count_change,
          coupon_before, coupon_after, deal_type,
          rank_before, rank_after, rank_change, keyword_rank_before, keyword_rank_after, event_summary,
          possible_strategy, suggested_action)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(event_date, category_id, event_key) DO UPDATE SET
          event_type = excluded.event_type,
          event_level = excluded.event_level,
          category_name = excluded.category_name,
          marketplace = excluded.marketplace,
          asin = excluded.asin,
          brand = excluded.brand,
          title = excluded.title,
          price_before = excluded.price_before,
          price_after = excluded.price_after,
          price_change_rate = excluded.price_change_rate,
          review_count_before = excluded.review_count_before,
          review_count_after = excluded.review_count_after,
          review_count_change = excluded.review_count_change,
          coupon_before = excluded.coupon_before,
          coupon_after = excluded.coupon_after,
          deal_type = excluded.deal_type,
          rank_before = excluded.rank_before,
          rank_after = excluded.rank_after,
          rank_change = excluded.rank_change,
          keyword_rank_before = excluded.keyword_rank_before,
          keyword_rank_after = excluded.keyword_rank_after,
          event_summary = excluded.event_summary,
          possible_strategy = excluded.possible_strategy,
          suggested_action = excluded.suggested_action`
      );
      withTransaction(db, () => {
        db.prepare("DELETE FROM amazon_competitor_activity_event WHERE category_id = ? AND event_date = ?").run(categoryId, date);
        for (const item of items) {
          stmt.run(
            item.eventKey,
            item.eventDate,
            item.eventType,
            item.eventLevel,
            item.categoryId,
            item.categoryName,
            item.marketplace,
            item.asin,
            item.brand,
            item.title,
            item.priceBefore,
            item.priceAfter,
            item.priceChangeRate,
            item.reviewCountBefore ?? null,
            item.reviewCountAfter ?? null,
            item.reviewCountChange ?? null,
            item.couponBefore,
            item.couponAfter,
            item.dealType,
            item.rankBefore,
            item.rankAfter,
            item.rankChange,
            item.keywordRankBefore,
            item.keywordRankAfter,
            item.eventSummary,
            item.possibleStrategy,
            item.suggestedAction
          );
        }
      });
    },

    listCategoryActivityEvents(filter = {}) {
      const { sql: where, params } = buildWhere(
        whereEq("event_date", filter.date),
        whereEq("category_id", filter.categoryId),
        whereEq("asin", filter.asin),
        whereEq("brand", filter.brand),
        whereEq("event_type", filter.eventType)
      );
      const clamped = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);
      const pagination = clamped > 0
        ? (offset > 0 ? `LIMIT ${clamped} OFFSET ${offset}` : `LIMIT ${clamped}`)
        : (offset > 0 ? `LIMIT -1 OFFSET ${offset}` : "");
      return (
        db
          .prepare(
            `SELECT * FROM amazon_competitor_activity_event ${where}
             ORDER BY event_date DESC,
              CASE event_level WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
              COALESCE(rank_after, 999999) ASC,
              event_type,
              COALESCE(asin, brand, '')
             ${pagination}`
          )
          .all(...params) as unknown as ActivityEventRow[]
      ).map(mapActivityEvent).filter(shouldExposeActivityEvent);
    },

    saveCategoryReport(date, categoryId, markdown) {
      db.prepare(
        `INSERT INTO amazon_category_daily_report (report_date, category_id, markdown, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(report_date, category_id) DO UPDATE SET markdown = excluded.markdown, updated_at = excluded.updated_at`
      ).run(date, categoryId, markdown, nowIso());
    },

    getCategoryReport(date, categoryId) {
      if (categoryId) {
        const row = db
          .prepare("SELECT markdown FROM amazon_category_daily_report WHERE report_date = ? AND category_id = ?")
          .get(date, categoryId) as { markdown: string } | undefined;
        return row?.markdown ?? "";
      }
      const rows = db.prepare("SELECT markdown FROM amazon_category_daily_report WHERE report_date = ? ORDER BY category_id").all(date) as {
        markdown: string;
      }[];
      return rows.map((row) => row.markdown).join("\n\n---\n\n");
    },

    getCategoryProductLink(asin, categoryId) {
      const params: SQLInputValue[] = [asin];
      const categoryClause = categoryId ? "AND category_id = ?" : "";
      if (categoryId) {
        params.push(categoryId);
      }
      const snapshot = db
        .prepare(
          `SELECT asin, marketplace, product_url FROM amazon_bestseller_rank_snapshot
           WHERE asin = ? ${categoryClause}
           ORDER BY snapshot_date DESC, rank_no ASC
           LIMIT 1`
        )
        .get(...params) as { asin: string; marketplace: string; product_url: string | null } | undefined;
      if (snapshot?.product_url) {
        return { asin: snapshot.asin, marketplace: snapshot.marketplace, url: snapshot.product_url };
      }
      const master = db.prepare("SELECT asin, marketplace, product_url FROM amazon_product_master WHERE asin = ? LIMIT 1").get(asin) as
        | { asin: string; marketplace: string; product_url: string | null }
        | undefined;
      return master?.product_url ? { asin: master.asin, marketplace: master.marketplace, url: master.product_url } : null;
    },

  };
}
