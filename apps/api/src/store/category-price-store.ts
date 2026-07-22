import type { DatabaseSync } from "node:sqlite";
import { trustedPreviousReviewCount } from "@amazon-monitor/shared";
import { mapProductPriceHistory, type ProductPriceHistoryRow } from "./snapshot-mappers.js";
import { sanitizeProductPriceHistory } from "./review-guards.js";
import { isoDateOffset } from "./date-utils.js";
import { buildWhere, clampLimit, clampOffset, whereEq, whereGte, whereLte, withTransaction } from "./sql-utils.js";
import type { Store } from "./types.js";

type CategoryPriceStoreMethods = Pick<Store, "replaceProductPriceHistoryForDate" | "listProductPriceHistory">;

type PriceLowRow = {
  asin: string;
  marketplace: string;
  t30_low: number | null;
  t60_low: number | null;
  t90_low: number | null;
  monitoring_low: number | null;
};

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

        // Batch-compute the four price-low aggregates for every (asin, marketplace)
        // in this category with a single GROUP BY query. Replaces the previous
        // 4 SQL × N items = 4N round-trips with one query.
        // `MIN(CASE WHEN ... THEN price END)` returns NULL when no row matches
        // the date predicate, which is exactly the "no prior data" signal.
        const t30Start = isoDateOffset(date, -29);
        const t60Start = isoDateOffset(date, -59);
        const t90Start = isoDateOffset(date, -89);
        const priceLowRows = db.prepare(`
          SELECT s.asin, s.marketplace,
            MIN(CASE WHEN s.snapshot_date >= ? THEN s.current_price END) AS t30_low,
            MIN(CASE WHEN s.snapshot_date >= ? THEN s.current_price END) AS t60_low,
            MIN(CASE WHEN s.snapshot_date >= ? THEN s.current_price END) AS t90_low,
            MIN(s.current_price) AS monitoring_low
          FROM amazon_bestseller_rank_snapshot s
          WHERE s.category_id = ?
            AND s.snapshot_date <= ?
            AND s.current_price IS NOT NULL
          GROUP BY s.asin, s.marketplace
        `).all(t30Start, t60Start, t90Start, categoryId, date) as PriceLowRow[];
        const priceLowByKey = new Map(
          priceLowRows.map((row) => [`${row.asin}|${row.marketplace}`, row] as const)
        );

        for (const item of items) {
          const previous = previousByAsin.get(item.asin) ?? null;
          const previousReviewCount = trustedPreviousReviewCount(item.reviewCount, previous?.reviewCount ?? null);
          const reviewCountChange = previousReviewCount !== null && item.reviewCount !== null ? item.reviewCount - previousReviewCount : null;
          const lows = priceLowByKey.get(`${item.asin}|${item.marketplace}`);
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
            lows?.t30_low ?? null,
            lows?.t60_low ?? null,
            lows?.t90_low ?? null,
            lows?.monitoring_low ?? null
          );
        }
      });
    },

    listProductPriceHistory(filter = {}) {
      const { sql: where, params } = buildWhere(
        whereEq("cm.org_id", filter.orgId),
        whereEq("p.snapshot_date", filter.date),
        whereEq("p.category_id", filter.categoryId),
        whereEq("p.asin", filter.asin),
        whereEq("p.marketplace", filter.marketplace),
        whereEq("p.brand", filter.brand),
        whereGte("p.snapshot_date", filter.startDate),
        whereLte("p.snapshot_date", filter.endDate)
      );
      // Default to 500 when no limit is requested — the three-way JOIN plus
      // computed-column ORDER BY is expensive, and unbounded returns on this
      // large table cause dashboard slowdowns.
      const clamped = clampLimit(filter.limit) || 500;
      const offset = clampOffset(filter.offset);
      const pagination = offset > 0 ? `LIMIT ${clamped} OFFSET ${offset}` : `LIMIT ${clamped}`;
      return (
        db
          .prepare(
            `SELECT p.*,
              COALESCE(s.image_url, m.image_url) AS image_url,
              COALESCE(s.product_url, m.product_url) AS product_url
             FROM amazon_product_price_history p
             INNER JOIN amazon_bestseller_category_monitor cm ON cm.id = p.category_id
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

