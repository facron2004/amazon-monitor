import type { DatabaseSync } from "node:sqlite";
import type {
  InventoryPlanListFilter,
  InventoryReplenishmentPlan,
  InventoryReplenishmentSetting,
  OwnedProductDailyMetric,
  ProductDataFreshness,
  ProductSyncStatus
} from "@amazon-monitor/shared";
import { buildInventoryReplenishmentPlan } from "../services/inventory-planning-service.js";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq, type WhereBuilder } from "./sql-utils.js";
import {
  getSpApiProductInventoryEvidence,
  listSpApiProductSalesMetrics
} from "./sp-api-product-evidence.js";
import { resolveEffectiveProductMetrics } from "./product-metric-effective-store.js";
import type { Store } from "./types.js";

type InventoryStoreMethods = Pick<
  Store,
  "upsertInventorySetting" | "getInventorySetting" | "getInventoryPlan" | "listInventoryPlans"
>;

interface InventoryProductRow {
  product_id: number;
  org_id: number;
  sku: string;
  asin: string;
  marketplace: string;
  brand: string | null;
  product_title: string;
  product_data_source: string;
  product_last_synced_at: string | null;
  product_sync_status: string;
  product_sync_error: string | null;
}

interface InventorySettingRow {
  id: number;
  product_id: number;
  lead_time_days: number;
  production_lead_time_days: number | null;
  inbound_lead_time_days: number | null;
  safety_stock_days: number;
  target_stock_days: number;
  min_order_quantity: number | null;
  pack_size: number | null;
  supplier_name: string | null;
  reorder_point_units: number | null;
  in_transit_units: number | null;
  local_warehouse_units: number | null;
  expected_arrival_date: string | null;
  data_source: string;
  last_synced_at: string | null;
  sync_status: string;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

interface ProductMetricRow {
  id: number;
  product_id: number;
  metric_date: string;
  sessions: number | null;
  page_views: number | null;
  orders: number | null;
  units_sold: number | null;
  sales_amount: number | null;
  buy_box_percentage: number | null;
  conversion_rate: number | null;
  rating: number | null;
  review_count: number | null;
  bsr_rank: number | null;
  inventory_available: number | null;
  inventory_days: number | null;
  ad_spend: number | null;
  ad_sales: number | null;
  acos: number | null;
  tacos: number | null;
  gross_margin: number | null;
  keyword_rank: number | null;
  data_source: string;
  last_synced_at: string | null;
  sync_status: string;
  sync_error: string | null;
  created_at: string;
}

export function createInventoryStore(db: DatabaseSync): InventoryStoreMethods {
  return {
    upsertInventorySetting(input) {
      const now = nowIso();
      db.prepare(
        `INSERT INTO product_inventory_settings
         (product_id, lead_time_days, production_lead_time_days, inbound_lead_time_days,
          safety_stock_days, target_stock_days, min_order_quantity, pack_size, supplier_name,
          reorder_point_units, in_transit_units, local_warehouse_units, expected_arrival_date,
          data_source, last_synced_at, sync_status, sync_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET
          lead_time_days = excluded.lead_time_days,
          production_lead_time_days = excluded.production_lead_time_days,
          inbound_lead_time_days = excluded.inbound_lead_time_days,
          safety_stock_days = excluded.safety_stock_days,
          target_stock_days = excluded.target_stock_days,
          min_order_quantity = excluded.min_order_quantity,
          pack_size = excluded.pack_size,
          supplier_name = excluded.supplier_name,
          reorder_point_units = excluded.reorder_point_units,
          in_transit_units = excluded.in_transit_units,
          local_warehouse_units = excluded.local_warehouse_units,
          expected_arrival_date = excluded.expected_arrival_date,
          data_source = excluded.data_source,
          last_synced_at = excluded.last_synced_at,
          sync_status = excluded.sync_status,
          sync_error = excluded.sync_error,
          updated_at = excluded.updated_at`
      ).run(
        input.productId,
        input.leadTimeDays ?? 21,
        input.productionLeadTimeDays ?? null,
        input.inboundLeadTimeDays ?? null,
        input.safetyStockDays ?? 14,
        input.targetStockDays ?? 60,
        input.minOrderQuantity ?? null,
        input.packSize ?? null,
        input.supplierName ?? null,
        input.reorderPointUnits ?? null,
        input.inTransitUnits ?? null,
        input.localWarehouseUnits ?? null,
        input.expectedArrivalDate ?? null,
        input.dataSource ?? "manual",
        input.lastSyncedAt ?? now,
        input.syncStatus ?? "manual",
        input.syncError ?? null,
        now,
        now
      );
      const row = db
        .prepare("SELECT * FROM product_inventory_settings WHERE product_id = ?")
        .get(input.productId) as unknown as InventorySettingRow;
      return mapSetting(row);
    },

    getInventorySetting(productId) {
      const row = db
        .prepare("SELECT * FROM product_inventory_settings WHERE product_id = ?")
        .get(productId) as unknown as InventorySettingRow | undefined;
      return row ? mapSetting(row) : null;
    },

    getInventoryPlan(productId, filter = {}) {
      const product = getProductRow(db, productId, filter.orgId);
      if (!product) return null;
      return buildPlan(db, product, filter);
    },

    listInventoryPlans(filter = {}) {
      const plans = listProductRows(db, filter).map((product) => buildPlan(db, product, filter));
      return filter.level ? plans.filter((plan) => plan.level === filter.level) : plans;
    }
  };
}

function buildPlan(db: DatabaseSync, product: InventoryProductRow, filter: InventoryPlanListFilter): InventoryReplenishmentPlan {
  return buildInventoryReplenishmentPlan({
    product: {
      productId: product.product_id,
      orgId: product.org_id,
      sku: product.sku,
      asin: product.asin,
      marketplace: product.marketplace,
      brand: product.brand,
      productTitle: product.product_title,
      freshness: productFreshness(product)
    },
    metrics: listMetrics(db, product.product_id, filter.date),
    spApiInventoryEvidence: getSpApiProductInventoryEvidence(db, product.product_id),
    setting: getSetting(db, product.product_id),
    date: filter.date
  });
}

function listProductRows(db: DatabaseSync, filter: InventoryPlanListFilter): InventoryProductRow[] {
  const { sql, params } = buildWhere(
    whereEq("p.org_id", filter.orgId),
    whereEq("p.id", filter.productId),
    qWhere(filter.q)
  );
  const limit = clampLimit(filter.limit ?? 100);
  const offset = clampOffset(filter.offset);
  return db.prepare(
    `SELECT p.id AS product_id, p.org_id, p.sku, p.asin, p.marketplace, p.brand,
      p.title AS product_title, p.data_source AS product_data_source,
      p.last_synced_at AS product_last_synced_at, p.sync_status AS product_sync_status,
      p.sync_error AS product_sync_error
     FROM own_products p
     ${sql}
     ORDER BY p.updated_at DESC, p.id DESC
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as unknown as InventoryProductRow[];
}

function getProductRow(db: DatabaseSync, productId: number, orgId: number | undefined): InventoryProductRow | null {
  const { sql, params } = buildWhere(whereEq("p.id", productId), whereEq("p.org_id", orgId));
  const row = db.prepare(
    `SELECT p.id AS product_id, p.org_id, p.sku, p.asin, p.marketplace, p.brand,
      p.title AS product_title, p.data_source AS product_data_source,
      p.last_synced_at AS product_last_synced_at, p.sync_status AS product_sync_status,
      p.sync_error AS product_sync_error
     FROM own_products p
     ${sql}
     LIMIT 1`
  ).get(...params) as unknown as InventoryProductRow | undefined;
  return row ?? null;
}

function listMetrics(db: DatabaseSync, productId: number, date: string | undefined): OwnedProductDailyMetric[] {
  const { sql, params } = buildWhere(
    whereEq("product_id", productId),
    date ? { clause: "metric_date <= ?", param: date } : null
  );
  const rows = db.prepare(
    `SELECT * FROM own_product_daily_metrics
     ${sql}
     ORDER BY metric_date DESC
     LIMIT 30`
  ).all(...params) as unknown as ProductMetricRow[];
  const manualMetrics = rows.map(mapMetric);
  return resolveEffectiveProductMetrics(
    db,
    productId,
    manualMetrics,
    listSpApiProductSalesMetrics(db, productId, date, 30),
    30
  );
}

function getSetting(db: DatabaseSync, productId: number): InventoryReplenishmentSetting | null {
  const row = db
    .prepare("SELECT * FROM product_inventory_settings WHERE product_id = ?")
    .get(productId) as unknown as InventorySettingRow | undefined;
  return row ? mapSetting(row) : null;
}

function qWhere(q: string | undefined): WhereBuilder | null {
  const value = q?.trim().toLowerCase();
  if (!value) return null;
  return {
    clause: "(LOWER(p.sku) LIKE ? OR LOWER(p.asin) LIKE ? OR LOWER(p.title) LIKE ? OR LOWER(COALESCE(p.brand, '')) LIKE ?)",
    params: [`%${value}%`, `%${value}%`, `%${value}%`, `%${value}%`]
  };
}

function mapSetting(row: InventorySettingRow): InventoryReplenishmentSetting {
  return {
    id: row.id,
    productId: row.product_id,
    leadTimeDays: row.lead_time_days,
    productionLeadTimeDays: row.production_lead_time_days,
    inboundLeadTimeDays: row.inbound_lead_time_days,
    safetyStockDays: row.safety_stock_days,
    targetStockDays: row.target_stock_days,
    minOrderQuantity: row.min_order_quantity,
    packSize: row.pack_size,
    supplierName: row.supplier_name,
    reorderPointUnits: row.reorder_point_units,
    inTransitUnits: row.in_transit_units,
    localWarehouseUnits: row.local_warehouse_units,
    expectedArrivalDate: row.expected_arrival_date,
    dataSource: row.data_source,
    lastSyncedAt: row.last_synced_at,
    syncStatus: mapSyncStatus(row.sync_status),
    syncError: row.sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMetric(row: ProductMetricRow): OwnedProductDailyMetric {
  return {
    id: row.id,
    productId: row.product_id,
    date: row.metric_date,
    sessions: row.sessions,
    pageViews: row.page_views,
    orders: row.orders,
    unitsSold: row.units_sold,
    salesAmount: row.sales_amount,
    buyBoxPercentage: row.buy_box_percentage,
    conversionRate: row.conversion_rate,
    rating: row.rating,
    reviewCount: row.review_count,
    bsrRank: row.bsr_rank,
    inventoryAvailable: row.inventory_available,
    inventoryDays: row.inventory_days,
    adSpend: row.ad_spend,
    adSales: row.ad_sales,
    acos: row.acos,
    tacos: row.tacos,
    grossMargin: row.gross_margin,
    keywordRank: row.keyword_rank,
    dataSource: row.data_source,
    lastSyncedAt: row.last_synced_at,
    syncStatus: mapSyncStatus(row.sync_status),
    syncError: row.sync_error,
    createdAt: row.created_at
  };
}

function productFreshness(row: InventoryProductRow): ProductDataFreshness {
  return {
    dataSource: row.product_data_source,
    lastSyncedAt: row.product_last_synced_at,
    syncStatus: mapSyncStatus(row.product_sync_status),
    syncError: row.product_sync_error
  };
}

function mapSyncStatus(value: string): ProductSyncStatus {
  if (value === "pending" || value === "success" || value === "partial" || value === "failed" || value === "manual") {
    return value;
  }
  return "manual";
}

export type { InventoryProductRow, InventorySettingRow };
