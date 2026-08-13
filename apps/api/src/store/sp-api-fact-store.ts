import type { DatabaseSync } from "node:sqlite";
import type {
  SpApiFactPromotionResult,
  SpApiInventoryFactInput,
  SpApiProductSalesEvidence,
  SpApiSalesTrafficFactInput,
  SpApiSyncDomain
} from "@amazon-monitor/shared";
import { nowIso, withTransaction } from "./sql-utils.js";
import type { Store } from "./types.js";

type SpApiFactStoreMethods = Pick<
  Store,
  "promoteSpApiSalesTrafficFacts" | "promoteSpApiInventoryFacts" | "getSpApiSalesTrafficFactForProductDate"
>;

interface SalesFactRow {
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

export function createSpApiFactStore(db: DatabaseSync): SpApiFactStoreMethods {
  return {
    getSpApiSalesTrafficFactForProductDate(orgId, productId, businessDate) {
      const row = db.prepare(`
        SELECT data_source_id, sync_run_id, business_date, sessions, page_views, orders, units_sold,
               sales_amount, buy_box_percentage, conversion_rate, currency, synced_at
        FROM sp_api_sales_traffic_daily
        WHERE org_id = ? AND product_id = ? AND business_date = ?
          AND scope = 'sku_daily' AND status = 'success'
        ORDER BY synced_at DESC, id DESC
        LIMIT 1
      `).get(orgId, productId, businessDate) as SalesFactRow | undefined;
      return row ? mapSalesFact(row) : null;
    },

    promoteSpApiSalesTrafficFacts(facts, options = {}) {
      if (facts.length === 0) return emptyPromotionResult();
      assertFactsBelongToSource(db, facts.map(factContext), "sales_traffic");
      let createdRecords = 0;
      let updatedRecords = 0;
      withTransaction(db, () => {
        for (const fact of facts) {
          options.ensureActive?.();
          const normalized = normalizeSalesFact(fact);
          const exists = db.prepare(
            `SELECT id FROM sp_api_sales_traffic_daily
             WHERE commerce_store_id = ? AND marketplace = ? AND seller_sku = ? AND business_date = ? AND scope = ?`
          ).get(
            normalized.commerceStoreId,
            normalized.marketplace,
            normalized.sellerSku,
            normalized.businessDate,
            normalized.scope
          );
          db.prepare(
            `INSERT INTO sp_api_sales_traffic_daily
             (org_id, data_source_id, sync_run_id, commerce_store_id, marketplace, business_date, seller_sku,
              product_id, asin, scope, sessions, page_views, orders, units_sold, sales_amount, buy_box_percentage,
              conversion_rate, currency, source_time, source_document_id, content_hash, synced_at, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')
             ON CONFLICT(commerce_store_id, marketplace, seller_sku, business_date, scope) DO UPDATE SET
               org_id = excluded.org_id,
               data_source_id = excluded.data_source_id,
               sync_run_id = excluded.sync_run_id,
               product_id = excluded.product_id,
               asin = excluded.asin,
               sessions = excluded.sessions,
               page_views = excluded.page_views,
               orders = excluded.orders,
               units_sold = excluded.units_sold,
               sales_amount = excluded.sales_amount,
               buy_box_percentage = excluded.buy_box_percentage,
               conversion_rate = excluded.conversion_rate,
               currency = excluded.currency,
               source_time = excluded.source_time,
               source_document_id = excluded.source_document_id,
               content_hash = excluded.content_hash,
               synced_at = excluded.synced_at,
               status = excluded.status`
          ).run(
            normalized.orgId,
            normalized.dataSourceId,
            normalized.syncRunId,
            normalized.commerceStoreId,
            normalized.marketplace,
            normalized.businessDate,
            normalized.sellerSku,
            normalized.productId,
            normalized.sourceAsin,
            normalized.scope,
            normalized.sessions,
            normalized.pageViews,
            normalized.orders,
            normalized.unitsSold,
            normalized.salesAmount,
            normalized.buyBoxPercentage,
            normalized.conversionRate,
            normalized.currency,
            normalized.sourceTime,
            normalized.sourceDocumentId,
            normalized.contentHash,
            nowIso()
          );
          if (exists) updatedRecords++;
          else createdRecords++;
        }
        options.ensureActive?.();
      });
      return { importedRows: facts.length, createdRecords, updatedRecords };
    },

    promoteSpApiInventoryFacts(facts, options = {}) {
      if (facts.length === 0) return emptyPromotionResult();
      assertFactsBelongToSource(db, facts.map(factContext), "fba_inventory");
      let createdRecords = 0;
      let updatedRecords = 0;
      withTransaction(db, () => {
        for (const fact of facts) {
          options.ensureActive?.();
          const normalized = normalizeInventoryFact(fact);
          const latestExists = db.prepare(
            `SELECT id FROM sp_api_inventory_latest
             WHERE commerce_store_id = ? AND marketplace = ? AND seller_sku = ?`
          ).get(normalized.commerceStoreId, normalized.marketplace, normalized.sellerSku);
          upsertInventorySnapshot(db, normalized);
          upsertInventoryLatest(db, normalized);
          if (latestExists) updatedRecords++;
          else createdRecords++;
        }
        options.ensureActive?.();
      });
      return { importedRows: facts.length, createdRecords, updatedRecords };
    }
  };
}

function mapSalesFact(row: SalesFactRow): SpApiProductSalesEvidence {
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

type FactContext = Pick<SpApiSalesTrafficFactInput, "orgId" | "dataSourceId" | "syncRunId" | "commerceStoreId">;

function factContext(fact: SpApiSalesTrafficFactInput | SpApiInventoryFactInput): FactContext {
  return {
    orgId: fact.orgId,
    dataSourceId: fact.dataSourceId,
    syncRunId: fact.syncRunId,
    commerceStoreId: fact.commerceStoreId
  };
}

function assertFactsBelongToSource(
  db: DatabaseSync,
  contexts: FactContext[],
  expectedDomain: SpApiSyncDomain
): void {
  const checked = new Set<string>();
  for (const context of contexts) {
    const key = `${context.orgId}:${context.dataSourceId}:${context.syncRunId}:${context.commerceStoreId}`;
    if (checked.has(key)) continue;
    checked.add(key);
    const row = db.prepare(
      `SELECT 1
       FROM data_source_sync_runs r
       JOIN data_source_configs s ON s.id = r.data_source_id AND s.org_id = r.org_id
       JOIN commerce_stores c ON c.id = ? AND c.org_id = r.org_id
       WHERE r.id = ? AND r.org_id = ? AND r.data_source_id = ? AND r.domain = ?`
    ).get(context.commerceStoreId, context.syncRunId, context.orgId, context.dataSourceId, expectedDomain);
    if (!row) {
      throw Object.assign(new Error("SP-API fact source, run, or commerce store was not found"), { statusCode: 404 });
    }
  }
}

function normalizeSalesFact(fact: SpApiSalesTrafficFactInput) {
  const scope = fact.scope;
  const sellerSku = scope === "store_daily" ? "" : requiredText(fact.sellerSku, "sellerSku");
  return {
    ...fact,
    scope,
    sellerSku,
    marketplace: requiredText(fact.marketplace, "marketplace"),
    businessDate: requiredDate(fact.businessDate),
    productId: positiveIntegerOrNull(fact.productId, "productId"),
    sourceAsin: optionalText(fact.sourceAsin),
    sessions: nonNegativeIntegerOrNull(fact.sessions, "sessions"),
    pageViews: nonNegativeIntegerOrNull(fact.pageViews, "pageViews"),
    orders: nonNegativeIntegerOrNull(fact.orders, "orders"),
    unitsSold: nonNegativeIntegerOrNull(fact.unitsSold, "unitsSold"),
    salesAmount: nonNegativeNumberOrNull(fact.salesAmount, "salesAmount"),
    buyBoxPercentage: percentageOrNull(fact.buyBoxPercentage, "buyBoxPercentage"),
    conversionRate: percentageOrNull(fact.conversionRate, "conversionRate"),
    currency: currencyCode(fact.currency),
    sourceTime: optionalText(fact.sourceTime),
    sourceDocumentId: optionalText(fact.sourceDocumentId),
    contentHash: optionalText(fact.contentHash)
  };
}

function normalizeInventoryFact(fact: SpApiInventoryFactInput) {
  const inboundWorkingQuantity = nonNegativeIntegerOrNull(fact.inboundWorkingQuantity, "inboundWorkingQuantity");
  const inboundShippedQuantity = nonNegativeIntegerOrNull(fact.inboundShippedQuantity, "inboundShippedQuantity");
  const inboundReceivingQuantity = nonNegativeIntegerOrNull(fact.inboundReceivingQuantity, "inboundReceivingQuantity");
  const calculatedInbound = sumKnown([inboundWorkingQuantity, inboundShippedQuantity, inboundReceivingQuantity]);
  const inboundQuantity = fact.inboundQuantity === undefined || fact.inboundQuantity === null
    ? calculatedInbound
    : nonNegativeIntegerOrNull(fact.inboundQuantity, "inboundQuantity");
  return {
    ...fact,
    marketplace: requiredText(fact.marketplace, "marketplace"),
    sellerSku: requiredText(fact.sellerSku, "sellerSku"),
    productId: positiveIntegerOrNull(fact.productId, "productId"),
    sourceAsin: optionalText(fact.sourceAsin),
    fulfillableQuantity: nonNegativeIntegerOrNull(fact.fulfillableQuantity, "fulfillableQuantity"),
    reservedQuantity: nonNegativeIntegerOrNull(fact.reservedQuantity, "reservedQuantity"),
    inboundWorkingQuantity,
    inboundShippedQuantity,
    inboundReceivingQuantity,
    inboundQuantity,
    unfulfillableQuantity: nonNegativeIntegerOrNull(fact.unfulfillableQuantity, "unfulfillableQuantity"),
    totalQuantity: nonNegativeIntegerOrNull(fact.totalQuantity, "totalQuantity"),
    sourceTime: optionalText(fact.sourceTime),
    sourceDocumentId: optionalText(fact.sourceDocumentId),
    contentHash: optionalText(fact.contentHash)
  };
}

function upsertInventorySnapshot(db: DatabaseSync, fact: ReturnType<typeof normalizeInventoryFact>): void {
  db.prepare(
    `INSERT INTO sp_api_inventory_snapshots
     (org_id, data_source_id, sync_run_id, commerce_store_id, marketplace, seller_sku, product_id, asin,
      fulfillable_quantity, reserved_quantity, inbound_working_quantity, inbound_shipped_quantity,
      inbound_receiving_quantity, inbound_quantity, unfulfillable_quantity, total_quantity, source_time,
      source_document_id, content_hash, synced_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')
     ON CONFLICT(sync_run_id, marketplace, seller_sku) DO UPDATE SET
       product_id = excluded.product_id, asin = excluded.asin, fulfillable_quantity = excluded.fulfillable_quantity,
       reserved_quantity = excluded.reserved_quantity, inbound_working_quantity = excluded.inbound_working_quantity,
       inbound_shipped_quantity = excluded.inbound_shipped_quantity, inbound_receiving_quantity = excluded.inbound_receiving_quantity,
       inbound_quantity = excluded.inbound_quantity, unfulfillable_quantity = excluded.unfulfillable_quantity,
       total_quantity = excluded.total_quantity, source_time = excluded.source_time,
       source_document_id = excluded.source_document_id, content_hash = excluded.content_hash,
       synced_at = excluded.synced_at, status = excluded.status`
  ).run(...inventoryValues(fact));
}

function upsertInventoryLatest(db: DatabaseSync, fact: ReturnType<typeof normalizeInventoryFact>): void {
  db.prepare(
    `INSERT INTO sp_api_inventory_latest
     (org_id, data_source_id, sync_run_id, commerce_store_id, marketplace, seller_sku, product_id, asin,
      fulfillable_quantity, reserved_quantity, inbound_working_quantity, inbound_shipped_quantity,
      inbound_receiving_quantity, inbound_quantity, unfulfillable_quantity, total_quantity, source_time,
      source_document_id, content_hash, synced_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')
     ON CONFLICT(commerce_store_id, marketplace, seller_sku) DO UPDATE SET
       org_id = excluded.org_id, data_source_id = excluded.data_source_id, sync_run_id = excluded.sync_run_id,
       product_id = excluded.product_id, asin = excluded.asin, fulfillable_quantity = excluded.fulfillable_quantity,
       reserved_quantity = excluded.reserved_quantity, inbound_working_quantity = excluded.inbound_working_quantity,
       inbound_shipped_quantity = excluded.inbound_shipped_quantity, inbound_receiving_quantity = excluded.inbound_receiving_quantity,
       inbound_quantity = excluded.inbound_quantity, unfulfillable_quantity = excluded.unfulfillable_quantity,
       total_quantity = excluded.total_quantity, source_time = excluded.source_time,
       source_document_id = excluded.source_document_id, content_hash = excluded.content_hash,
       synced_at = excluded.synced_at, status = excluded.status`
  ).run(...inventoryValues(fact));
}

function inventoryValues(fact: ReturnType<typeof normalizeInventoryFact>): [
  number, number, number, number, string, string, number | null, string | null,
  number | null, number | null, number | null, number | null, number | null, number | null,
  number | null, number | null, string | null, string | null, string | null, string
] {
  return [
    fact.orgId, fact.dataSourceId, fact.syncRunId, fact.commerceStoreId, fact.marketplace, fact.sellerSku,
    fact.productId, fact.sourceAsin, fact.fulfillableQuantity, fact.reservedQuantity,
    fact.inboundWorkingQuantity, fact.inboundShippedQuantity, fact.inboundReceivingQuantity,
    fact.inboundQuantity, fact.unfulfillableQuantity, fact.totalQuantity, fact.sourceTime,
    fact.sourceDocumentId, fact.contentHash, nowIso()
  ];
}

function emptyPromotionResult(): SpApiFactPromotionResult {
  return { importedRows: 0, createdRecords: 0, updatedRecords: 0 };
}

function requiredText(value: string | null | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function requiredDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("businessDate must be YYYY-MM-DD");
  return value;
}

function currencyCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("currency must be an ISO 4217 code");
  return normalized;
}

function nonNegativeIntegerOrNull(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

function positiveIntegerOrNull(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}

function nonNegativeNumberOrNull(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number`);
  return value;
}

function percentageOrNull(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${label} must be between 0 and 100`);
  return value;
}

function sumKnown(values: Array<number | null>): number | null {
  return values.every((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}
