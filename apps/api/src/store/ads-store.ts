import type { DatabaseSync } from "node:sqlite";
import type {
  AdDailyMetric,
  AdsMetricListFilter,
  AdsWorkflowSummary,
  ProductSyncStatus,
  UpsertAdDailyMetricInput
} from "@amazon-monitor/shared";
import { buildAdsWorkflowItem, type AdsMetricHistoryContext } from "../services/ads-workflow-service.js";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq, whereGte, whereLte, type WhereBuilder } from "./sql-utils.js";
import type { Store } from "./types.js";

type AdsStoreMethods = Pick<
  Store,
  "upsertAdDailyMetric" | "getAdDailyMetricByIdentity" | "listAdDailyMetrics" | "getAdsWorkflowSummary"
>;

interface AdMetricRow {
  id: number;
  org_id: number;
  product_id: number | null;
  metric_date: string;
  campaign_id: string;
  campaign_name: string;
  ad_group_name: string;
  target_text: string;
  search_term: string;
  match_type: string | null;
  impressions: number | null;
  clicks: number | null;
  spend: number | null;
  sales: number | null;
  orders: number | null;
  units_sold: number | null;
  acos: number | null;
  roas: number | null;
  cpc: number | null;
  ctr: number | null;
  cvr: number | null;
  budget: number | null;
  budget_usage_rate: number | null;
  data_source: string;
  last_synced_at: string | null;
  sync_status: string;
  sync_error: string | null;
  created_at: string;
}

interface AdMetricJoinedRow extends AdMetricRow {
  product_sku: string | null;
  product_asin: string | null;
}

interface AdMetricHistoryRow {
  avg_spend: number | null;
  avg_sales: number | null;
}

export function createAdsStore(db: DatabaseSync): AdsStoreMethods {
  return {
    upsertAdDailyMetric(input) {
      const now = nowIso();
      db.prepare(
        `INSERT INTO ad_daily_metrics
         (org_id, product_id, metric_date, campaign_id, campaign_name, ad_group_name, target_text,
          search_term, match_type, impressions, clicks, spend, sales, orders, units_sold, acos,
          roas, cpc, ctr, cvr, budget, budget_usage_rate, data_source, last_synced_at,
          sync_status, sync_error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(org_id, metric_date, campaign_id, ad_group_name, target_text, search_term) DO UPDATE SET
          product_id = excluded.product_id,
          campaign_name = excluded.campaign_name,
          match_type = excluded.match_type,
          impressions = excluded.impressions,
          clicks = excluded.clicks,
          spend = excluded.spend,
          sales = excluded.sales,
          orders = excluded.orders,
          units_sold = excluded.units_sold,
          acos = excluded.acos,
          roas = excluded.roas,
          cpc = excluded.cpc,
          ctr = excluded.ctr,
          cvr = excluded.cvr,
          budget = excluded.budget,
          budget_usage_rate = excluded.budget_usage_rate,
          data_source = excluded.data_source,
          last_synced_at = excluded.last_synced_at,
          sync_status = excluded.sync_status,
          sync_error = excluded.sync_error`
      ).run(
        input.orgId,
        input.productId ?? null,
        input.date,
        input.campaignId,
        input.campaignName,
        input.adGroupName ?? "",
        input.targetText ?? "",
        input.searchTerm ?? "",
        input.matchType ?? null,
        input.impressions ?? null,
        input.clicks ?? null,
        input.spend ?? null,
        input.sales ?? null,
        input.orders ?? null,
        input.unitsSold ?? null,
        input.acos ?? inferAcos(input.spend, input.sales),
        input.roas ?? inferRoas(input.spend, input.sales),
        input.cpc ?? inferRate(input.spend, input.clicks),
        input.ctr ?? inferRate(input.clicks, input.impressions),
        input.cvr ?? inferRate(input.orders, input.clicks),
        input.budget ?? null,
        input.budgetUsageRate ?? inferRate(input.spend, input.budget),
        input.dataSource ?? "manual",
        input.lastSyncedAt ?? now,
        input.syncStatus ?? "manual",
        input.syncError ?? null,
        now
      );
      const row = db
        .prepare(
          `SELECT * FROM ad_daily_metrics
           WHERE org_id = ? AND metric_date = ? AND campaign_id = ?
            AND ad_group_name = ? AND target_text = ? AND search_term = ?`
        )
        .get(input.orgId, input.date, input.campaignId, input.adGroupName ?? "", input.targetText ?? "", input.searchTerm ?? "") as unknown as AdMetricRow;
      return mapAdMetric(row);
    },

    getAdDailyMetricByIdentity(input) {
      const row = db.prepare(
        `SELECT * FROM ad_daily_metrics
         WHERE org_id = ? AND metric_date = ? AND campaign_id = ?
          AND ad_group_name = ? AND target_text = ? AND search_term = ?`
      ).get(
        input.orgId,
        input.date,
        input.campaignId,
        input.adGroupName ?? "",
        input.targetText ?? "",
        input.searchTerm ?? ""
      ) as unknown as AdMetricRow | undefined;
      return row ? mapAdMetric(row) : null;
    },

    listAdDailyMetrics(filter = {}) {
      return listJoinedRows(db, filter).map(({ product_sku: _sku, product_asin: _asin, ...row }) => mapAdMetric(row));
    },

    getAdsWorkflowSummary(filter = {}) {
      const rows = listJoinedRows(db, filter);
      const items = rows.map((row) => buildAdsWorkflowItem(
        mapAdMetric(row),
        row.product_sku && row.product_asin ? { sku: row.product_sku, asin: row.product_asin } : null,
        getMetricHistory(db, row)
      ));
      const totalSpend = sum(items.map((item) => item.metric.spend));
      const totalSales = sum(items.map((item) => item.metric.sales));
      return {
        date: filter.date ?? "",
        totalSpend,
        totalSales,
        averageAcos: totalSales > 0 ? totalSpend / totalSales : null,
        riskCount: items.filter((item) => item.level === "risk").length,
        scaleCount: items.filter((item) => item.level === "scale").length,
        items: filter.level ? items.filter((item) => item.level === filter.level) : items
      } satisfies AdsWorkflowSummary;
    }
  };
}

function listJoinedRows(db: DatabaseSync, filter: AdsMetricListFilter): AdMetricJoinedRow[] {
  const { sql, params } = buildWhere(
    whereEq("a.org_id", filter.orgId),
    whereEq("a.product_id", filter.productId),
    whereEq("a.metric_date", filter.date),
    whereGte("a.metric_date", filter.startDate),
    whereLte("a.metric_date", filter.endDate),
    qWhere(filter.q)
  );
  const limit = clampLimit(filter.limit ?? 200);
  const offset = clampOffset(filter.offset);
  return db
    .prepare(
      `SELECT a.*, p.sku AS product_sku, p.asin AS product_asin
       FROM ad_daily_metrics a
       LEFT JOIN own_products p ON p.id = a.product_id
       ${sql}
       ORDER BY a.metric_date DESC, COALESCE(a.spend, 0) DESC, a.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as unknown as AdMetricJoinedRow[];
}

function getMetricHistory(db: DatabaseSync, row: AdMetricJoinedRow): AdsMetricHistoryContext {
  const history = db
    .prepare(
      `SELECT AVG(spend) AS avg_spend, AVG(sales) AS avg_sales
       FROM ad_daily_metrics
       WHERE org_id = ?
        AND campaign_id = ?
        AND ad_group_name = ?
        AND target_text = ?
        AND search_term = ?
        AND metric_date < ?
        AND metric_date >= date(?, '-7 days')`
    )
    .get(
      row.org_id,
      row.campaign_id,
      row.ad_group_name,
      row.target_text,
      row.search_term,
      row.metric_date,
      row.metric_date
    ) as unknown as AdMetricHistoryRow | undefined;
  return {
    spend7dAvg: history?.avg_spend ?? null,
    sales7dAvg: history?.avg_sales ?? null
  };
}

function qWhere(q: string | undefined): WhereBuilder | null {
  const value = q?.trim().toLowerCase();
  if (!value) return null;
  return {
    clause: `(LOWER(a.campaign_name) LIKE ? OR LOWER(a.campaign_id) LIKE ? OR LOWER(a.target_text) LIKE ?
      OR LOWER(a.search_term) LIKE ? OR LOWER(COALESCE(p.sku, '')) LIKE ? OR LOWER(COALESCE(p.asin, '')) LIKE ?)`,
    params: [`%${value}%`, `%${value}%`, `%${value}%`, `%${value}%`, `%${value}%`, `%${value}%`]
  };
}

function mapAdMetric(row: AdMetricRow): AdDailyMetric {
  return {
    id: row.id,
    orgId: row.org_id,
    productId: row.product_id,
    date: row.metric_date,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    adGroupName: emptyToNull(row.ad_group_name),
    targetText: emptyToNull(row.target_text),
    searchTerm: emptyToNull(row.search_term),
    matchType: row.match_type,
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
    sales: row.sales,
    orders: row.orders,
    unitsSold: row.units_sold,
    acos: row.acos,
    roas: row.roas,
    cpc: row.cpc,
    ctr: row.ctr,
    cvr: row.cvr,
    budget: row.budget,
    budgetUsageRate: row.budget_usage_rate,
    dataSource: row.data_source,
    lastSyncedAt: row.last_synced_at,
    syncStatus: mapSyncStatus(row.sync_status),
    syncError: row.sync_error,
    createdAt: row.created_at
  };
}

function mapSyncStatus(value: string): ProductSyncStatus {
  if (value === "pending" || value === "success" || value === "partial" || value === "failed" || value === "manual") {
    return value;
  }
  return "manual";
}

function emptyToNull(value: string): string | null {
  return value.trim() ? value : null;
}

function inferAcos(spend: number | null | undefined, sales: number | null | undefined): number | null {
  if (spend == null || sales == null || sales <= 0) return null;
  return spend / sales;
}

function inferRoas(spend: number | null | undefined, sales: number | null | undefined): number | null {
  if (spend == null || spend <= 0 || sales == null) return null;
  return sales / spend;
}

function inferRate(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return numerator / denominator;
}

function sum(values: Array<number | null>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export type { AdMetricRow, AdMetricJoinedRow };
