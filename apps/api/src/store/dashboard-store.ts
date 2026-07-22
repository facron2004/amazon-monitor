import type { DatabaseSync } from "node:sqlite";
import { isoDateOffset, type DashboardMarketplaceOperations } from "@amazon-monitor/shared";
import type { Store } from "./types.js";

type DashboardStoreMethods = Pick<Store, "getDashboardSummary" | "getDashboardOperationsSummary">;

interface OperationsStatsRow {
  active_product_count: number;
  product_metric_count: number;
  inventory_risk_sku_count: number;
  open_task_count: number;
  last_synced_at: string | null;
}

interface MarketplaceMetricRow {
  marketplace: string;
  metric_date: string;
  metric_product_count: number;
  sales_amount: number | null;
  orders: number | null;
  ad_spend: number | null;
  ad_sales: number | null;
  average_acos: number | null;
  margin_numerator: number | null;
  margin_denominator: number | null;
  average_gross_margin: number | null;
}

export function createDashboardStore(db: DatabaseSync): DashboardStoreMethods {
  return {
    getDashboardSummary(date, orgId) {
      const scope = orgId ?? null;
      const row = db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM amazon_keyword_monitor WHERE (? IS NULL OR org_id = ?)) AS keyword_count,
            (SELECT COUNT(*) FROM amazon_keyword_monitor WHERE status = 1 AND (? IS NULL OR org_id = ?)) AS active_keyword_count,
            (SELECT COUNT(*) FROM amazon_bestseller_category_monitor WHERE (? IS NULL OR org_id = ?)) AS category_monitor_count,
            (SELECT COUNT(*) FROM amazon_bestseller_category_monitor WHERE status = 1 AND (? IS NULL OR org_id = ?)) AS active_category_count,
            (SELECT COUNT(*) FROM amazon_keyword_serp_snapshot s
              INNER JOIN amazon_keyword_monitor m ON m.id = s.keyword_id
              WHERE s.snapshot_date = ? AND (? IS NULL OR m.org_id = ?)) AS today_snapshot_count,
            (SELECT COUNT(*) FROM amazon_bestseller_rank_snapshot s
              INNER JOIN amazon_bestseller_category_monitor m ON m.id = s.category_id
              WHERE s.snapshot_date = ? AND (? IS NULL OR m.org_id = ?)) AS category_snapshot_count,
            (SELECT COUNT(*) FROM amazon_competitor_pool WHERE status = 1 AND (? IS NULL OR org_id = ?)) AS competitor_count,
            (SELECT COUNT(*) FROM amazon_alert_log WHERE alert_date = ? AND (? IS NULL OR org_id = ?)) AS alert_count,
            (SELECT COUNT(*) FROM amazon_competitor_signal_log s
              INNER JOIN amazon_bestseller_category_monitor m ON m.id = s.category_id
              WHERE s.source_type = 'category' AND s.signal_date = ? AND (? IS NULL OR m.org_id = ?)) AS category_signal_count,
            (SELECT COUNT(*) FROM amazon_alert_log WHERE alert_date = ? AND alert_level IN ('critical', 'high') AND (? IS NULL OR org_id = ?)) AS critical_alert_count,
            (SELECT MAX(report_date) FROM amazon_daily_report WHERE (? IS NULL OR org_id = ?)) AS latest_report_date`
        )
        .get(
          scope, scope,
          scope, scope,
          scope, scope,
          scope, scope,
          date, scope, scope,
          date, scope, scope,
          scope, scope,
          date, scope, scope,
          date, scope, scope,
          date, scope, scope,
          scope, scope
        ) as {
        keyword_count: number;
        active_keyword_count: number;
        category_monitor_count: number;
        active_category_count: number;
        today_snapshot_count: number;
        category_snapshot_count: number;
        competitor_count: number;
        alert_count: number;
        category_signal_count: number;
        critical_alert_count: number;
        latest_report_date: string | null;
      };
      return {
        keywordCount: row.keyword_count,
        activeKeywordCount: row.active_keyword_count,
        categoryMonitorCount: row.category_monitor_count,
        activeCategoryCount: row.active_category_count,
        todaySnapshotCount: row.today_snapshot_count,
        categorySnapshotCount: row.category_snapshot_count,
        competitorCount: row.competitor_count,
        alertCount: row.alert_count,
        categorySignalCount: row.category_signal_count,
        criticalAlertCount: row.critical_alert_count,
        latestReportDate: row.latest_report_date
      };
    },

    getDashboardOperationsSummary(orgId, date) {
      const startDate = isoDateOffset(date, -6);
      const previousDate = isoDateOffset(date, -1);
      const stats = db.prepare(
        `SELECT
          (SELECT COUNT(*) FROM own_products WHERE org_id = ? AND status = 'active') AS active_product_count,
          (SELECT COUNT(*)
             FROM own_product_daily_metrics m
             JOIN own_products p ON p.id = m.product_id
            WHERE p.org_id = ? AND p.status = 'active' AND m.metric_date = ?) AS product_metric_count,
          (SELECT COUNT(*)
             FROM own_product_daily_metrics m
             JOIN own_products p ON p.id = m.product_id
             LEFT JOIN product_inventory_settings s ON s.product_id = p.id
            WHERE p.org_id = ? AND p.status = 'active' AND m.metric_date = ?
              AND (
                (m.inventory_days IS NOT NULL AND m.inventory_days <= COALESCE(s.lead_time_days, 21) + COALESCE(s.safety_stock_days, 14))
                OR (s.reorder_point_units IS NOT NULL AND m.inventory_available IS NOT NULL AND m.inventory_available <= s.reorder_point_units)
                OR m.inventory_available = 0
              )) AS inventory_risk_sku_count,
          (SELECT COUNT(*) FROM tasks
            WHERE org_id = ? AND status IN ('pending', 'in_progress', 'awaiting_review')) AS open_task_count,
          (SELECT MAX(COALESCE(m.last_synced_at, m.created_at))
             FROM own_product_daily_metrics m
             JOIN own_products p ON p.id = m.product_id
            WHERE p.org_id = ? AND p.status = 'active' AND m.metric_date = ?) AS last_synced_at`
      ).get(orgId, orgId, date, orgId, date, orgId, orgId, date) as unknown as OperationsStatsRow;

      const marketplaces = db.prepare(
        `SELECT DISTINCT marketplace
           FROM own_products
          WHERE org_id = ? AND status = 'active'
          ORDER BY marketplace ASC`
      ).all(orgId) as unknown as Array<{ marketplace: string }>;

      const metricRows = db.prepare(
        `SELECT
          p.marketplace,
          m.metric_date,
          COUNT(*) AS metric_product_count,
          SUM(m.sales_amount) AS sales_amount,
          SUM(m.orders) AS orders,
          SUM(m.ad_spend) AS ad_spend,
          SUM(m.ad_sales) AS ad_sales,
          AVG(m.acos) AS average_acos,
          SUM(CASE WHEN m.sales_amount IS NOT NULL AND m.gross_margin IS NOT NULL
                   THEN m.sales_amount * m.gross_margin END) AS margin_numerator,
          SUM(CASE WHEN m.sales_amount IS NOT NULL AND m.gross_margin IS NOT NULL
                   THEN m.sales_amount END) AS margin_denominator,
          AVG(m.gross_margin) AS average_gross_margin
         FROM own_product_daily_metrics m
         JOIN own_products p ON p.id = m.product_id
         WHERE p.org_id = ? AND p.status = 'active' AND m.metric_date BETWEEN ? AND ?
         GROUP BY p.marketplace, m.metric_date
         ORDER BY p.marketplace ASC, m.metric_date ASC`
      ).all(orgId, startDate, date) as unknown as MarketplaceMetricRow[];

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
  };
}

function buildMarketplaceOperations(
  marketplace: string,
  date: string,
  previousDate: string,
  dates: string[],
  rows: MarketplaceMetricRow[]
): DashboardMarketplaceOperations {
  const byDate = new Map(rows.map((row) => [row.metric_date, row]));
  const current = byDate.get(date);
  const previous = byDate.get(previousDate);
  return {
    marketplace,
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

function rate(numerator: number | null | undefined, denominator: number | null | undefined, fallback: number | null | undefined): number | null {
  if (numerator !== null && numerator !== undefined && denominator !== null && denominator !== undefined && denominator > 0) {
    return Math.round((numerator / denominator) * 10_000) / 10_000;
  }
  return fallback === null || fallback === undefined ? null : Math.round(fallback * 10_000) / 10_000;
}

function round(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Math.round(value * 100) / 100;
}
