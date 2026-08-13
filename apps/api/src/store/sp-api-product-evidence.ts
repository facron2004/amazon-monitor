import type {
  OwnedProductDailyMetric,
  OwnedProductDailyMetricField,
  OwnedProductDailyMetricFieldSource,
  SpApiProductEvidence,
  SpApiProductInventoryEvidence,
  SpApiProductSalesEvidence
} from "@amazon-monitor/shared";
import type { DatabaseSync } from "node:sqlite";
import {
  MAX_EFFECTIVE_METRIC_ROWS,
  SP_API_METRIC_FIELDS
} from "./product-metric-effective-store.js";

interface SalesEvidenceRow {
  id: number;
  data_source_id: number;
  sync_run_id: number;
  business_date: string;
  sessions: number | null;
  page_views: number | null;
  orders: number | null;
  units_sold: number | null;
  sales_amount: number | null;
  buy_box_percentage: number | null;
  conversion_rate: number | null;
  currency: string;
  synced_at: string;
}

interface InventoryEvidenceRow {
  data_source_id: number;
  sync_run_id: number;
  source_time: string | null;
  fulfillable_quantity: number | null;
  reserved_quantity: number | null;
  inbound_quantity: number | null;
  unfulfillable_quantity: number | null;
  total_quantity: number | null;
  synced_at: string;
}

/** Reads domain-specific evidence without mutating the legacy aggregate metric row. */
export function getSpApiProductEvidence(
  db: DatabaseSync,
  productId: number,
  endDate?: string
): SpApiProductEvidence {
  const sales = db.prepare(`
    SELECT id, data_source_id, sync_run_id, business_date, sessions, page_views, orders, units_sold,
           sales_amount, buy_box_percentage, conversion_rate, currency, synced_at
    FROM sp_api_sales_traffic_daily
    WHERE product_id = ?
      AND scope = 'sku_daily'
      AND status = 'success'
      AND (? IS NULL OR business_date <= ?)
    ORDER BY business_date DESC, synced_at DESC, id DESC
    LIMIT 1
  `).get(productId, endDate ?? null, endDate ?? null) as SalesEvidenceRow | undefined;
  return {
    sales: sales ? mapSalesEvidence(sales) : null,
    inventory: getSpApiProductInventoryEvidence(db, productId)
  };
}

/**
 * Returns SKU-level SP-API sales rows in the same metric shape used by
 * inventory and profit planning. The legacy daily metric table stays
 * untouched; callers decide whether a manual row should override a date.
 */
export function listSpApiProductSalesMetrics(
  db: DatabaseSync,
  productId: number,
  endDate?: string,
  limit = 30,
  startDate?: string
): OwnedProductDailyMetric[] {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_EFFECTIVE_METRIC_ROWS) : 30;
  const rows = db.prepare(`
    SELECT id, data_source_id, sync_run_id, business_date, sessions, page_views, orders, units_sold,
           sales_amount, buy_box_percentage, conversion_rate, currency, synced_at
    FROM sp_api_sales_traffic_daily
    WHERE product_id = ?
      AND scope = 'sku_daily'
      AND status = 'success'
      AND (? IS NULL OR business_date <= ?)
      AND (? IS NULL OR business_date >= ?)
    ORDER BY business_date DESC, synced_at DESC, id DESC
    LIMIT ?
  `).all(productId, endDate ?? null, endDate ?? null, startDate ?? null, startDate ?? null, safeLimit) as unknown as SalesEvidenceRow[];
  return rows.map((row) => mapSalesMetric(row, productId));
}

/** Reads successful SKU-level SP-API rows for one organization in report order. */
export function listSpApiOrganizationProductSalesMetrics(
  db: DatabaseSync,
  orgId: number,
  endDate?: string,
  limit = 1_000,
  startDate?: string
): OwnedProductDailyMetric[] {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_EFFECTIVE_METRIC_ROWS) : 1_000;
  const rows = db.prepare(`
    SELECT s.id, s.product_id, s.data_source_id, s.sync_run_id, s.business_date, s.sessions,
           s.page_views, s.orders, s.units_sold, s.sales_amount, s.buy_box_percentage,
           s.conversion_rate, s.currency, s.synced_at
    FROM sp_api_sales_traffic_daily s
    JOIN own_products p ON p.id = s.product_id
    WHERE p.org_id = ?
      AND p.status = 'active'
      AND s.scope = 'sku_daily'
      AND s.status = 'success'
      AND (? IS NULL OR s.business_date <= ?)
      AND (? IS NULL OR s.business_date >= ?)
    ORDER BY s.business_date DESC, s.product_id ASC, s.synced_at DESC, s.id DESC
    LIMIT ?
  `).all(orgId, endDate ?? null, endDate ?? null, startDate ?? null, startDate ?? null, safeLimit) as unknown as Array<SalesEvidenceRow & { product_id: number }>;
  return rows.map((row) => mapSalesMetric(row, row.product_id));
}

export function getSpApiProductInventoryEvidence(
  db: DatabaseSync,
  productId: number
): SpApiProductInventoryEvidence | null {
  const inventory = db.prepare(`
    SELECT data_source_id, sync_run_id, source_time, fulfillable_quantity, reserved_quantity,
           inbound_quantity, unfulfillable_quantity, total_quantity, synced_at
    FROM sp_api_inventory_latest
    WHERE product_id = ? AND status = 'success'
    ORDER BY COALESCE(source_time, synced_at) DESC, id DESC
    LIMIT 1
  `).get(productId) as InventoryEvidenceRow | undefined;
  return inventory ? mapInventoryEvidence(inventory) : null;
}

function mapSalesEvidence(row: SalesEvidenceRow): SpApiProductSalesEvidence {
  return {
    dataSource: "sp_api",
    lastSyncedAt: row.synced_at,
    syncStatus: "success",
    syncError: null,
    dataSourceId: row.data_source_id,
    syncRunId: row.sync_run_id,
    businessDate: row.business_date,
    sessions: row.sessions,
    pageViews: row.page_views,
    orders: row.orders,
    unitsSold: row.units_sold,
    salesAmount: row.sales_amount,
    buyBoxPercentage: row.buy_box_percentage,
    conversionRate: row.conversion_rate,
    currency: row.currency
  };
}

function mapSalesMetric(row: SalesEvidenceRow, productId: number): OwnedProductDailyMetric {
  const source: OwnedProductDailyMetricFieldSource = {
    dataSource: "sp_api",
    lastSyncedAt: row.synced_at,
    syncStatus: "success",
    syncError: null,
    dataSourceId: row.data_source_id,
    syncRunId: row.sync_run_id
  };
  const fieldSources: Partial<Record<OwnedProductDailyMetricField, OwnedProductDailyMetricFieldSource>> = {};
  for (const field of SP_API_METRIC_FIELDS) fieldSources[field] = source;
  return {
    id: row.id,
    productId,
    date: row.business_date,
    sessions: row.sessions,
    pageViews: row.page_views,
    orders: row.orders,
    unitsSold: row.units_sold,
    salesAmount: row.sales_amount,
    buyBoxPercentage: row.buy_box_percentage,
    conversionRate: row.conversion_rate,
    rating: null,
    reviewCount: null,
    bsrRank: null,
    inventoryAvailable: null,
    inventoryDays: null,
    adSpend: null,
    adSales: null,
    acos: null,
    tacos: null,
    grossMargin: null,
    keywordRank: null,
    dataSource: "sp_api",
    lastSyncedAt: row.synced_at,
    syncStatus: "success",
    syncError: null,
    fieldSources,
    createdAt: row.synced_at
  };
}

function mapInventoryEvidence(row: InventoryEvidenceRow): SpApiProductInventoryEvidence {
  return {
    dataSource: "sp_api",
    lastSyncedAt: row.synced_at,
    syncStatus: "success",
    syncError: null,
    dataSourceId: row.data_source_id,
    syncRunId: row.sync_run_id,
    observedAt: row.source_time,
    fulfillableQuantity: row.fulfillable_quantity,
    reservedQuantity: row.reserved_quantity,
    inboundQuantity: row.inbound_quantity,
    unfulfillableQuantity: row.unfulfillable_quantity,
    totalQuantity: row.total_quantity
  };
}
