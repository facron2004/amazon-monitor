import type { DatabaseSync } from "node:sqlite";
import {
  isoDateOffset,
  type DashboardMarketplaceOperations,
  type DashboardOperationsSummary,
  type OwnedProductDailyMetric
} from "@amazon-monitor/shared";
import { loadEffectiveMarketplaceMetricRows, type EffectiveMarketplaceMetricRow } from "./dashboard-effective-metrics.js";
import { loadDashboardEffectiveMarketplaceMetricRows } from "./dashboard-effective-sql.js";
import { MAX_EFFECTIVE_METRIC_ROWS } from "./product-metric-effective-store.js";

interface OperationsStatsRow {
  active_product_count: number;
  product_metric_count: number;
  inventory_risk_sku_count: number;
  open_task_count: number;
  last_synced_at: string | null;
}

export type DashboardMetricLoader = (
  orgId: number,
  filter: { startDate: string; endDate: string; limit: number }
) => OwnedProductDailyMetric[];

/** Combines independent sales, inventory, and manual domains without overwriting fact ownership. */
export function getDashboardOperationsSummary(
  db: DatabaseSync,
  orgId: number,
  date: string,
  metricLoader?: DashboardMetricLoader
): DashboardOperationsSummary {
  const startDate = isoDateOffset(date, -6);
  const previousDate = isoDateOffset(date, -1);
  const stats = loadOperationsStats(db, orgId, date);
  const marketplaces = db.prepare(
    `SELECT DISTINCT marketplace
       FROM own_products
      WHERE org_id = ? AND status = 'active'
      ORDER BY marketplace ASC`
  ).all(orgId) as unknown as Array<{ marketplace: string }>;
  const metricRows = metricLoader
    ? loadEffectiveMarketplaceMetricRows(
      db,
      orgId,
      startDate,
      date,
      metricLoader(orgId, { startDate, endDate: date, limit: MAX_EFFECTIVE_METRIC_ROWS })
    )
    : loadDashboardEffectiveMarketplaceMetricRows(db, orgId, startDate, date);
  const dates = Array.from({ length: 7 }, (_, index) => isoDateOffset(startDate, index));
  return {
    date,
    activeProductCount: stats.active_product_count,
    productMetricCount: stats.product_metric_count,
    inventoryRiskSkuCount: stats.inventory_risk_sku_count,
    openTaskCount: stats.open_task_count,
    lastSyncedAt: stats.last_synced_at,
    marketplaces: marketplaces.map(({ marketplace }) => buildMarketplaceOperations(
      marketplace,
      date,
      previousDate,
      dates,
      metricRows.filter((row) => row.marketplace === marketplace)
    ))
  };
}

function loadOperationsStats(db: DatabaseSync, orgId: number, date: string): OperationsStatsRow {
  return db.prepare(
    `SELECT
      (SELECT COUNT(*) FROM own_products WHERE org_id = ? AND status = 'active') AS active_product_count,
      (SELECT COUNT(*)
         FROM own_products p
        WHERE p.org_id = ? AND p.status = 'active'
          AND (
            EXISTS (
              SELECT 1 FROM own_product_daily_metrics m
               WHERE m.product_id = p.id AND m.metric_date = ?
            )
            OR EXISTS (
              SELECT 1 FROM sp_api_sales_traffic_daily s
               WHERE s.org_id = p.org_id AND s.product_id = p.id
                 AND s.business_date = ? AND s.scope = 'sku_daily' AND s.status = 'success'
            )
          )) AS product_metric_count,
      (SELECT COUNT(*)
         FROM own_products p
         LEFT JOIN own_product_daily_metrics m ON m.product_id = p.id AND m.metric_date = ?
         LEFT JOIN sp_api_inventory_latest i ON i.product_id = p.id AND i.status = 'success'
         LEFT JOIN product_inventory_settings s ON s.product_id = p.id
        WHERE p.org_id = ? AND p.status = 'active'
          AND (
            (m.inventory_days IS NOT NULL AND m.inventory_days <= COALESCE(s.lead_time_days, 21) + COALESCE(s.safety_stock_days, 14))
            OR (s.reorder_point_units IS NOT NULL AND COALESCE(i.fulfillable_quantity, m.inventory_available) IS NOT NULL
                AND COALESCE(i.fulfillable_quantity, m.inventory_available) <= s.reorder_point_units)
            OR COALESCE(i.fulfillable_quantity, m.inventory_available) = 0
          )) AS inventory_risk_sku_count,
      (SELECT COUNT(*) FROM tasks
        WHERE org_id = ? AND status IN ('pending', 'in_progress', 'awaiting_review')) AS open_task_count,
      (SELECT MAX(synced_at) FROM (
        SELECT COALESCE(m.last_synced_at, m.created_at) AS synced_at
          FROM own_product_daily_metrics m
          JOIN own_products p ON p.id = m.product_id
         WHERE p.org_id = ? AND p.status = 'active' AND m.metric_date = ?
        UNION ALL
        SELECT s.synced_at
          FROM sp_api_sales_traffic_daily s
          JOIN own_products p ON p.id = s.product_id
         WHERE p.org_id = ? AND p.status = 'active' AND s.business_date = ?
           AND s.scope = 'sku_daily' AND s.status = 'success'
        UNION ALL
        SELECT i.synced_at
          FROM sp_api_inventory_latest i
          JOIN own_products p ON p.id = i.product_id
         WHERE p.org_id = ? AND p.status = 'active' AND i.status = 'success'
      )) AS last_synced_at`
  ).get(
    orgId,
    orgId, date, date,
    date, orgId,
    orgId,
    orgId, date,
    orgId, date,
    orgId
  ) as unknown as OperationsStatsRow;
}

function buildMarketplaceOperations(
  marketplace: string,
  date: string,
  previousDate: string,
  dates: string[],
  rows: EffectiveMarketplaceMetricRow[]
): DashboardMarketplaceOperations {
  const byDate = new Map(rows.map((row) => [row.metric_date, row]));
  const current = byDate.get(date);
  const previous = byDate.get(previousDate);
  return {
    marketplace,
    currency: current?.currency ?? null,
    metricProductCount: current?.metric_product_count ?? 0,
    salesAmount: round(current?.sales_amount),
    previousSalesAmount: round(previous?.sales_amount),
    orders: current?.orders ?? null,
    adSpend: round(current?.ad_spend),
    acos: rate(current?.ad_spend, current?.ad_sales, current?.average_acos),
    grossMargin: rate(current?.margin_numerator, current?.margin_denominator, current?.average_gross_margin),
    sevenDaySales: dates.map((pointDate) => ({
      date: pointDate,
      salesAmount: round(byDate.get(pointDate)?.sales_amount)
    }))
  };
}

function rate(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  fallback: number | null | undefined
): number | null {
  if (numerator !== null && numerator !== undefined && denominator !== null && denominator !== undefined && denominator > 0) {
    return Math.round((numerator / denominator) * 10_000) / 10_000;
  }
  return fallback === null || fallback === undefined ? null : Math.round(fallback * 10_000) / 10_000;
}

function round(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Math.round(value * 100) / 100;
}
