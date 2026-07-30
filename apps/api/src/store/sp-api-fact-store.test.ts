import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore, initSchema } from "../store.js";
import type { Store } from "./types.js";

let db: DatabaseSync;
let store: Store;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
});

afterEach(() => {
  db.close();
});

describe("SP-API fact promotion", () => {
  it("upserts sales facts by business identity and preserves source/run provenance", () => {
    const context = createFactContext();
    const first = store.promoteSpApiSalesTrafficFacts([
      {
        ...context,
        businessDate: "2026-07-27",
        marketplace: "US",
        scope: "store_daily",
        salesAmount: 120.5,
        orders: 3,
        unitsSold: 4,
        sessions: 70,
        pageViews: 90,
        currency: "USD",
        sourceDocumentId: "report-1",
        contentHash: "hash-1"
      },
      {
        ...context,
        businessDate: "2026-07-27",
        marketplace: "US",
        scope: "sku_daily",
        sellerSku: "SKU-1",
        sourceAsin: "B0FACT0001",
        salesAmount: 120.5,
        orders: 3,
        unitsSold: 4,
        currency: "USD"
      }
    ]);
    expect(first).toEqual({ importedRows: 2, createdRecords: 2, updatedRecords: 0 });

    const secondRun = store.createDataSourceSyncRun({
      orgId: context.orgId,
      dataSourceId: context.dataSourceId,
      operation: "sp_api_sales_traffic_daily_sync",
      domain: "sales_traffic",
      credentialVersion: 1,
      idempotencyKey: "sales-run-2"
    });
    const second = store.promoteSpApiSalesTrafficFacts([{
      ...context,
      syncRunId: secondRun.id,
      businessDate: "2026-07-27",
      marketplace: "US",
      scope: "store_daily",
      salesAmount: 125,
      orders: 4,
      unitsSold: 5,
      currency: "USD",
      sourceDocumentId: "report-2",
      contentHash: "hash-2"
    }]);
    expect(second).toEqual({ importedRows: 1, createdRecords: 0, updatedRecords: 1 });
    expect(db.prepare(
      `SELECT sales_amount, orders, sync_run_id, source_document_id, content_hash
       FROM sp_api_sales_traffic_daily WHERE scope = 'store_daily'`
    ).get()).toEqual({
      sales_amount: 125,
      orders: 4,
      sync_run_id: secondRun.id,
      source_document_id: "report-2",
      content_hash: "hash-2"
    });
  });

  it("promotes inventory snapshots and latest state with calculated inbound quantity", () => {
    const context = createFactContext();
    const inventoryRun = store.createDataSourceSyncRun({
      orgId: context.orgId,
      dataSourceId: context.dataSourceId,
      operation: "sp_api_fba_inventory_incremental_sync",
      domain: "fba_inventory",
      credentialVersion: 1,
      idempotencyKey: "inventory-run-1"
    });
    const result = store.promoteSpApiInventoryFacts([{
      ...context,
      syncRunId: inventoryRun.id,
      marketplace: "US",
      sellerSku: "SKU-1",
      sourceAsin: "B0FACT0001",
      fulfillableQuantity: 8,
      reservedQuantity: 2,
      inboundWorkingQuantity: 3,
      inboundShippedQuantity: 4,
      inboundReceivingQuantity: 5,
      unfulfillableQuantity: 1,
      totalQuantity: 23,
      sourceTime: "2026-07-28T00:00:00.000Z",
      sourceDocumentId: "inventory-request-1"
    }]);
    expect(result).toEqual({ importedRows: 1, createdRecords: 1, updatedRecords: 0 });
    expect(db.prepare(
      `SELECT inbound_quantity, sync_run_id, source_document_id
       FROM sp_api_inventory_latest WHERE seller_sku = 'SKU-1'`
    ).get()).toEqual({
      inbound_quantity: 12,
      sync_run_id: inventoryRun.id,
      source_document_id: "inventory-request-1"
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM sp_api_inventory_snapshots").get()).toEqual({ count: 1 });
  });

  it("exposes sales and FBA evidence on owned SKUs without overwriting manual metrics", () => {
    const context = createFactContext();
    const product = store.createProduct({
      orgId: context.orgId,
      storeId: context.commerceStoreId,
      marketplace: "US",
      sku: "SKU-1",
      asin: "B0FACT0001",
      title: "SP-API mapped SKU"
    });
    store.promoteSpApiSalesTrafficFacts([{
      ...context,
      businessDate: "2026-07-27",
      marketplace: "US",
      scope: "sku_daily",
      sellerSku: product.sku,
      productId: product.id,
      sourceAsin: product.asin,
      sessions: 70,
      pageViews: 90,
      orders: 3,
      unitsSold: 4,
      salesAmount: 120.5,
      currency: "USD"
    }]);
    const inventoryRun = store.createDataSourceSyncRun({
      orgId: context.orgId,
      dataSourceId: context.dataSourceId,
      operation: "sp_api_fba_inventory_incremental_sync",
      domain: "fba_inventory",
      credentialVersion: 1,
      idempotencyKey: "inventory-product-evidence"
    });
    store.promoteSpApiInventoryFacts([{
      ...context,
      syncRunId: inventoryRun.id,
      marketplace: "US",
      sellerSku: product.sku,
      productId: product.id,
      sourceAsin: product.asin,
      fulfillableQuantity: 8,
      reservedQuantity: 2,
      inboundQuantity: 12,
      totalQuantity: 23,
      sourceTime: "2026-07-28T00:00:00.000Z"
    }]);

    const detail = store.getProductDetail(product.id, "2026-07-27");

    expect(detail?.latestMetric).toBeNull();
    expect(detail?.spApiEvidence).toMatchObject({
      sales: {
        dataSource: "sp_api",
        businessDate: "2026-07-27",
        salesAmount: 120.5,
        orders: 3,
        sessions: 70
      },
      inventory: {
        dataSource: "sp_api",
        fulfillableQuantity: 8,
        inboundQuantity: 12,
        totalQuantity: 23
      }
    });
    expect(store.getInventoryPlan(product.id, { orgId: context.orgId, date: "2026-07-27" })).toMatchObject({
      inventoryAvailable: 8,
      freshness: { dataSource: "sp_api", syncStatus: "success" },
      spApiInventoryEvidence: {
        fulfillableQuantity: 8,
        inboundQuantity: 12,
        totalQuantity: 23
      }
    });
    expect(store.listProductDailyMetrics(product.id)).toEqual([]);
  });

  it("rolls back promotion when the worker lease guard is lost before commit", () => {
    const context = createFactContext();
    expect(() => store.promoteSpApiSalesTrafficFacts([{
      ...context,
      businessDate: "2026-07-27",
      marketplace: "US",
      scope: "store_daily",
      currency: "USD"
    }], { ensureActive: () => { throw new DOMException("lost lease", "AbortError"); } })).toThrow("lost lease");
    expect(db.prepare("SELECT COUNT(*) AS count FROM sp_api_sales_traffic_daily").get()).toEqual({ count: 0 });
  });
});

function createFactContext() {
  const source = store.createDataSource({
    orgId: 1,
    name: `SP-API facts ${Date.now()}`,
    sourceType: "amazon_sp_api"
  });
  const commerceStore = store.createCommerceStore({
    orgId: 1,
    name: `SP-API fact store ${Date.now()}`,
    marketplace: "amazon.com",
    sellerId: "FACT-SELLER"
  });
  const run = store.createDataSourceSyncRun({
    orgId: 1,
    dataSourceId: source.id,
    operation: "sp_api_sales_traffic_daily_sync",
    domain: "sales_traffic",
    credentialVersion: 1,
    idempotencyKey: `sales-run-${Date.now()}`
  });
  return {
    orgId: 1,
    dataSourceId: source.id,
    syncRunId: run.id,
    commerceStoreId: commerceStore.id
  };
}
