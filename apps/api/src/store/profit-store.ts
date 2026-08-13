import type { DatabaseSync } from "node:sqlite";
import type {
  OwnedProductDailyMetric,
  ProductDataFreshness,
  ProductProfitPlan,
  ProductProfitPlanFilter,
  ProductProfitSetting,
  ProductSyncStatus
} from "@amazon-monitor/shared";
import { buildProductProfitPlan } from "../services/profit-planning-service.js";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq, type WhereBuilder } from "./sql-utils.js";
import { listSpApiProductSalesMetrics } from "./sp-api-product-evidence.js";
import { resolveEffectiveProductMetrics } from "./product-metric-effective-store.js";
import type { Store } from "./types.js";

type ProfitStoreMethods = Pick<Store, "upsertProfitSetting" | "getProfitSetting" | "getProfitPlan" | "listProfitPlans">;

interface ProfitProductRow {
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

interface ProfitSettingRow {
  id: number;
  product_id: number;
  purchase_cost: number | null;
  inbound_freight: number | null;
  fba_fee: number | null;
  referral_fee_rate: number;
  storage_fee: number | null;
  return_loss_rate: number;
  target_margin_rate: number;
  minimum_margin_rate: number;
  deal_fee: number | null;
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

export function createProfitStore(db: DatabaseSync): ProfitStoreMethods {
  return {
    upsertProfitSetting(input) {
      const now = nowIso();
      db.prepare(
        `INSERT INTO product_profit_settings
         (product_id, purchase_cost, inbound_freight, fba_fee, referral_fee_rate,
          storage_fee, return_loss_rate, target_margin_rate, minimum_margin_rate,
          deal_fee, data_source, last_synced_at, sync_status, sync_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET
          purchase_cost = excluded.purchase_cost,
          inbound_freight = excluded.inbound_freight,
          fba_fee = excluded.fba_fee,
          referral_fee_rate = excluded.referral_fee_rate,
          storage_fee = excluded.storage_fee,
          return_loss_rate = excluded.return_loss_rate,
          target_margin_rate = excluded.target_margin_rate,
          minimum_margin_rate = excluded.minimum_margin_rate,
          deal_fee = excluded.deal_fee,
          data_source = excluded.data_source,
          last_synced_at = excluded.last_synced_at,
          sync_status = excluded.sync_status,
          sync_error = excluded.sync_error,
          updated_at = excluded.updated_at`
      ).run(
        input.productId,
        input.purchaseCost ?? null,
        input.inboundFreight ?? null,
        input.fbaFee ?? null,
        input.referralFeeRate ?? 0.15,
        input.storageFee ?? null,
        input.returnLossRate ?? 0.03,
        input.targetMarginRate ?? 0.3,
        input.minimumMarginRate ?? 0.2,
        input.dealFee ?? null,
        input.dataSource ?? "manual",
        input.lastSyncedAt ?? now,
        input.syncStatus ?? "manual",
        input.syncError ?? null,
        now,
        now
      );
      const row = db
        .prepare("SELECT * FROM product_profit_settings WHERE product_id = ?")
        .get(input.productId) as unknown as ProfitSettingRow;
      return mapSetting(row);
    },

    getProfitSetting(productId) {
      const row = db
        .prepare("SELECT * FROM product_profit_settings WHERE product_id = ?")
        .get(productId) as unknown as ProfitSettingRow | undefined;
      return row ? mapSetting(row) : null;
    },

    getProfitPlan(productId, filter = {}) {
      const product = getProductRow(db, productId, filter.orgId);
      if (!product) return null;
      return buildPlan(db, product, filter);
    },

    listProfitPlans(filter = {}) {
      const plans = listProductRows(db, filter).map((product) => buildPlan(db, product, filter));
      return filter.level ? plans.filter((plan) => plan.level === filter.level) : plans;
    }
  };
}

function buildPlan(db: DatabaseSync, product: ProfitProductRow, filter: ProductProfitPlanFilter): ProductProfitPlan {
  return buildProductProfitPlan({
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
    setting: getSetting(db, product.product_id),
    date: filter.date
  });
}

function listProductRows(db: DatabaseSync, filter: ProductProfitPlanFilter): ProfitProductRow[] {
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
  ).all(...params, limit, offset) as unknown as ProfitProductRow[];
}

function getProductRow(db: DatabaseSync, productId: number, orgId: number | undefined): ProfitProductRow | null {
  const { sql, params } = buildWhere(whereEq("p.id", productId), whereEq("p.org_id", orgId));
  const row = db.prepare(
    `SELECT p.id AS product_id, p.org_id, p.sku, p.asin, p.marketplace, p.brand,
      p.title AS product_title, p.data_source AS product_data_source,
      p.last_synced_at AS product_last_synced_at, p.sync_status AS product_sync_status,
      p.sync_error AS product_sync_error
     FROM own_products p
     ${sql}
     LIMIT 1`
  ).get(...params) as unknown as ProfitProductRow | undefined;
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

function getSetting(db: DatabaseSync, productId: number): ProductProfitSetting | null {
  const row = db
    .prepare("SELECT * FROM product_profit_settings WHERE product_id = ?")
    .get(productId) as unknown as ProfitSettingRow | undefined;
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

function mapSetting(row: ProfitSettingRow): ProductProfitSetting {
  return {
    id: row.id,
    productId: row.product_id,
    purchaseCost: row.purchase_cost,
    inboundFreight: row.inbound_freight,
    fbaFee: row.fba_fee,
    referralFeeRate: row.referral_fee_rate,
    storageFee: row.storage_fee,
    returnLossRate: row.return_loss_rate,
    targetMarginRate: row.target_margin_rate,
    minimumMarginRate: row.minimum_margin_rate,
    dealFee: row.deal_fee,
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

function productFreshness(row: ProfitProductRow): ProductDataFreshness {
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
