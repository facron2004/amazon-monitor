import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { trustedPreviousReviewCount } from "@amazon-monitor/shared";
import type { BestsellerRankSnapshot } from "@amazon-monitor/shared";
import { mapProductPriceHistory, type ProductPriceHistoryRow } from "./snapshot-mappers.js";
import { sanitizeProductPriceHistory } from "./review-guards.js";
import { isoDateOffset } from "./date-utils.js";
import { buildWhere, clampLimit, clampOffset, whereEq, withTransaction } from "./sql-utils.js";
import type { Store } from "./types.js";

type CategoryPriceStoreMethods = Pick<Store, "replaceProductPriceHistoryForDate" | "listProductPriceHistory">;

export function createCategoryPriceStore(
  db: DatabaseSync,
  snapshots: Pick<Store, "getPreviousCategorySnapshots">
): CategoryPriceStoreMethods {
  return {
    replaceProductPriceHistoryForDate(categoryId, date, items) {
      const stmt = db.prepare(
        `INSERT INTO amazon_product_price_history
         (snapshot_date, category_id, category_name, marketplace, asin, brand, title, current_price,
          review_count, previous_review_count, review_count_change, ice_type, coupon_text, coupon_value, coupon_rate, deal_badge,
          final_estimated_price, t30_low_price, t60_low_price, t90_low_price, monitoring_low_price)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(snapshot_date, category_id, asin, marketplace) DO UPDATE SET
           category_name = excluded.category_name,
           brand = excluded.brand,
           title = excluded.title,
           current_price = excluded.current_price,
           review_count = excluded.review_count,
           previous_review_count = excluded.previous_review_count,
           review_count_change = excluded.review_count_change,
           ice_type = excluded.ice_type,
           coupon_text = excluded.coupon_text,
           coupon_value = excluded.coupon_value,
           coupon_rate = excluded.coupon_rate,
          deal_badge = excluded.deal_badge,
          final_estimated_price = excluded.final_estimated_price,
          t30_low_price = excluded.t30_low_price,
          t60_low_price = excluded.t60_low_price,
          t90_low_price = excluded.t90_low_price,
          monitoring_low_price = excluded.monitoring_low_price`
      );
      withTransaction(db, () => {
        db.prepare("DELETE FROM amazon_product_price_history WHERE category_id = ? AND snapshot_date = ?").run(categoryId, date);
        const previousSnapshots = snapshots.getPreviousCategorySnapshots(categoryId, date);
        const previousByAsin = new Map(previousSnapshots.map((item) => [item.asin, item]));
        for (const item of items) {
          const previous = previousByAsin.get(item.asin) ?? null;
          const previousReviewCount = trustedPreviousReviewCount(item.reviewCount, previous?.reviewCount ?? null);
          const reviewCountChange = previousReviewCount !== null && item.reviewCount !== null ? item.reviewCount - previousReviewCount : null;
          stmt.run(
            item.snapshotDate,
            item.categoryId,
            item.categoryName,
            item.marketplace,
            item.asin,
            item.brand,
            item.title,
            item.currentPrice,
            item.reviewCount,
            previousReviewCount,
            reviewCountChange,
            item.iceType ?? null,
            item.couponText,
            item.couponValue,
            item.couponRate,
            item.dealBadge,
            item.finalEstimatedPrice,
            categoryPriceLow(db, item, 30),
            categoryPriceLow(db, item, 60),
            categoryPriceLow(db, item, 90),
            categoryPriceLow(db, item, null)
          );
        }
      });
    },

    listProductPriceHistory(filter = {}) {
      const { sql: where, params } = buildWhere(
        whereEq("p.snapshot_date", filter.date),
        whereEq("p.category_id", filter.categoryId),
        whereEq("p.asin", filter.asin),
        whereEq("p.marketplace", filter.marketplace)
      );
      const clamped = clampLimit(filter.limit);
      const offset = clampOffset(filter.offset);
      const pagination = clamped > 0
        ? (offset > 0 ? `LIMIT ${clamped} OFFSET ${offset}` : `LIMIT ${clamped}`)
        : (offset > 0 ? `LIMIT -1 OFFSET ${offset}` : "");
      return (
        db
          .prepare(
            `SELECT p.*,
              COALESCE(s.image_url, m.image_url) AS image_url,
              COALESCE(s.product_url, m.product_url) AS product_url
             FROM amazon_product_price_history p
             LEFT JOIN amazon_bestseller_rank_snapshot s
              ON s.snapshot_date = p.snapshot_date
              AND s.category_id = p.category_id
              AND s.asin = p.asin
              AND s.marketplace = p.marketplace
             LEFT JOIN amazon_product_master m
              ON m.asin = p.asin AND m.marketplace = p.marketplace
             ${where}
             ORDER BY p.snapshot_date DESC, p.category_id, p.current_price IS NULL, COALESCE(p.t30_low_price, p.current_price) ASC, p.asin
             ${pagination}`
          )
          .all(...params) as unknown as ProductPriceHistoryRow[]
      ).map((row) => sanitizeProductPriceHistory(mapProductPriceHistory(row)));
    },

  };
}

function categoryPriceLow(db: DatabaseSync, item: BestsellerRankSnapshot, days: number | null): number | null {
  const clauses = ["category_id = ?", "marketplace = ?", "asin = ?", "snapshot_date <= ?", "current_price IS NOT NULL"];
  const params: SQLInputValue[] = [item.categoryId, item.marketplace, item.asin, item.snapshotDate];
  if (days !== null) {
    clauses.push("snapshot_date >= ?");
    params.push(isoDateOffset(item.snapshotDate, -(days - 1)));
  }
  const row = db
    .prepare(`SELECT MIN(current_price) AS low_price FROM amazon_bestseller_rank_snapshot WHERE ${clauses.join(" AND ")}`)
    .get(...params) as { low_price: number | null } | undefined;
  return row?.low_price ?? null;
}

