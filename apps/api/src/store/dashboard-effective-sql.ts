import type { DatabaseSync } from "node:sqlite";
import type { EffectiveMarketplaceMetricRow } from "./dashboard-effective-metrics.js";

/**
 * Aggregates Dashboard sales rows in SQLite so a multi-day window does not
 * require materializing every effective SKU metric in the API process.
 * Sales authority matches the product read model: STORE_DAILY wins at store
 * level, otherwise SKU facts win unless a field-level override is active.
 */
export function loadDashboardEffectiveMarketplaceMetricRows(
  db: DatabaseSync,
  orgId: number,
  startDate: string,
  endDate: string
): EffectiveMarketplaceMetricRow[] {
  return db.prepare(`
    WITH
    params(org_id, start_date, end_date) AS (VALUES (?, ?, ?)),
    latest_override_rows AS (
      SELECT a.product_id,
             a.effective_date,
             a.field_name,
             a.restore_on_sp_api_success,
             a.created_at,
             ROW_NUMBER() OVER (
               PARTITION BY a.product_id, a.effective_date, a.field_name
               ORDER BY a.created_at DESC, a.id DESC
             ) AS row_number
      FROM data_source_override_audits a
      JOIN params q ON q.org_id = a.org_id
      WHERE a.domain = 'sales_traffic'
        AND a.effective_date BETWEEN q.start_date AND q.end_date
        AND a.field_name IN ('salesAmount', 'orders')
    ),
    latest_overrides AS (
      SELECT product_id,
             effective_date,
             MAX(CASE WHEN field_name = 'salesAmount' THEN restore_on_sp_api_success END) AS sales_restore,
             MAX(CASE WHEN field_name = 'salesAmount' THEN created_at END) AS sales_created_at,
             MAX(CASE WHEN field_name = 'orders' THEN restore_on_sp_api_success END) AS orders_restore,
             MAX(CASE WHEN field_name = 'orders' THEN created_at END) AS orders_created_at
      FROM latest_override_rows
      WHERE row_number = 1
      GROUP BY product_id, effective_date
    ),
    -- Filter the bounded SKU fact window once; product_dates reuses it instead
    -- of scanning and sorting the same fact rows for a second UNION branch.
    sku_facts AS (
      SELECT s.id,
             s.product_id,
             p.marketplace,
             p.store_id,
             s.business_date,
             s.currency,
             s.synced_at,
             s.sales_amount,
             s.orders
      FROM sp_api_sales_traffic_daily s
      JOIN own_products p ON p.id = s.product_id
      CROSS JOIN params q
      WHERE p.org_id = q.org_id
        AND s.org_id = q.org_id
        AND p.status = 'active'
        AND s.scope = 'sku_daily'
        AND s.status = 'success'
        AND s.business_date BETWEEN q.start_date AND q.end_date
    ),
    product_dates AS (
      SELECT p.id AS product_id,
             p.marketplace,
             p.store_id,
             m.metric_date
      FROM own_products p
      JOIN own_product_daily_metrics m ON m.product_id = p.id
      CROSS JOIN params q
      WHERE p.org_id = q.org_id
        AND p.status = 'active'
        AND m.metric_date BETWEEN q.start_date AND q.end_date
      UNION ALL
      SELECT s.product_id,
             s.marketplace,
             s.store_id,
             s.business_date AS metric_date
      FROM sku_facts s
      WHERE NOT EXISTS (
          SELECT 1
          FROM own_product_daily_metrics existing_metric
          WHERE existing_metric.product_id = s.product_id
            AND existing_metric.metric_date = s.business_date
        )
    ),
    store_daily AS (
      SELECT s.commerce_store_id,
             s.marketplace,
             s.business_date,
             MIN(s.currency) AS currency,
             SUM(s.sales_amount) AS sales_amount,
             SUM(s.orders) AS orders
      FROM sp_api_sales_traffic_daily s
      CROSS JOIN params q
      WHERE s.org_id = q.org_id
        AND s.scope = 'store_daily'
        AND s.status = 'success'
        AND s.business_date BETWEEN q.start_date AND q.end_date
      GROUP BY s.commerce_store_id, s.marketplace, s.business_date
    ),
    effective_products AS (
      SELECT d.product_id,
             d.marketplace,
             d.store_id,
             d.metric_date,
             s.currency,
             CASE
               WHEN s.id IS NULL THEN m.sales_amount
               WHEN m.id IS NULL THEN s.sales_amount
               WHEN o.sales_restore IS NULL THEN s.sales_amount
               WHEN o.sales_restore = 1
                AND julianday(s.synced_at) > julianday(o.sales_created_at) THEN s.sales_amount
               ELSE m.sales_amount
             END AS sales_amount,
             CASE
               WHEN s.id IS NULL THEN m.orders
               WHEN m.id IS NULL THEN s.orders
               WHEN o.orders_restore IS NULL THEN s.orders
               WHEN o.orders_restore = 1
                AND julianday(s.synced_at) > julianday(o.orders_created_at) THEN s.orders
               ELSE m.orders
             END AS orders,
             m.ad_spend,
             m.ad_sales,
             m.acos,
             m.gross_margin
      FROM product_dates d
      LEFT JOIN own_product_daily_metrics m
        ON m.product_id = d.product_id AND m.metric_date = d.metric_date
      LEFT JOIN sku_facts s
        ON s.product_id = d.product_id AND s.business_date = d.metric_date
      LEFT JOIN latest_overrides o
        ON o.product_id = d.product_id AND o.effective_date = d.metric_date
    ),
    product_rows AS (
      SELECT e.marketplace,
             CASE WHEN sd.commerce_store_id IS NULL THEN e.currency END AS currency,
             e.metric_date,
             1 AS metric_product_count,
             CASE WHEN sd.commerce_store_id IS NULL THEN e.sales_amount END AS sales_amount,
             CASE WHEN sd.commerce_store_id IS NULL THEN e.orders END AS orders,
             e.ad_spend,
             e.ad_sales,
             e.acos AS average_acos,
             CASE
               WHEN sd.commerce_store_id IS NULL
                AND e.sales_amount IS NOT NULL
                AND e.gross_margin IS NOT NULL
               THEN e.sales_amount * e.gross_margin
             END AS margin_numerator,
             CASE
               WHEN sd.commerce_store_id IS NULL
                AND e.sales_amount IS NOT NULL
                AND e.gross_margin IS NOT NULL
               THEN e.sales_amount
             END AS margin_denominator,
             CASE WHEN sd.commerce_store_id IS NULL THEN e.gross_margin END AS average_gross_margin
      FROM effective_products e
      LEFT JOIN store_daily sd
        ON sd.commerce_store_id = e.store_id
       AND sd.marketplace = e.marketplace
       AND sd.business_date = e.metric_date
    ),
    combined_rows AS (
      SELECT marketplace, currency, metric_date, metric_product_count,
             sales_amount, orders, ad_spend, ad_sales, average_acos,
             margin_numerator, margin_denominator, average_gross_margin
      FROM product_rows
      UNION ALL
      SELECT marketplace, currency, business_date, 0,
             sales_amount, orders, NULL, NULL, NULL,
             NULL, NULL, NULL
      FROM store_daily
    )
    SELECT marketplace,
           CASE
             WHEN MIN(currency) IS NULL THEN NULL
             WHEN MIN(currency) = MAX(currency) THEN MIN(currency)
             ELSE NULL
           END AS currency,
           metric_date,
           SUM(metric_product_count) AS metric_product_count,
           SUM(sales_amount) AS sales_amount,
           SUM(orders) AS orders,
           SUM(ad_spend) AS ad_spend,
           SUM(ad_sales) AS ad_sales,
           AVG(average_acos) AS average_acos,
           SUM(margin_numerator) AS margin_numerator,
           SUM(margin_denominator) AS margin_denominator,
           AVG(average_gross_margin) AS average_gross_margin
    FROM combined_rows
    GROUP BY marketplace, metric_date
    ORDER BY marketplace ASC, metric_date ASC
  `).all(orgId, startDate, endDate) as unknown as EffectiveMarketplaceMetricRow[];
}
