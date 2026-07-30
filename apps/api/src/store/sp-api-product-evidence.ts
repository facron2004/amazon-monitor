import type {
  SpApiProductEvidence,
  SpApiProductInventoryEvidence,
  SpApiProductSalesEvidence
} from "@amazon-monitor/shared";
import type { DatabaseSync } from "node:sqlite";

interface SalesEvidenceRow {
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
    SELECT data_source_id, sync_run_id, business_date, sessions, page_views, orders, units_sold,
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
