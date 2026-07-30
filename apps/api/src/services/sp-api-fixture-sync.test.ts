import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore, initSchema } from "../store.js";
import type { Store } from "../store/types.js";
import { promoteInventoryFixture, promoteSalesTrafficFixture } from "./sp-api-fixture-sync.js";

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
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

describe("SP-API fixture promotion", () => {
  it("promotes store and mapped ASIN sales facts", () => {
    const context = createContext("sp_api_sales_traffic_daily_sync", "sales_traffic");
    store.createProduct({
      orgId: 1,
      storeId: context.commerceStoreId,
      marketplace: "US",
      sku: "FIXTURE-SKU-1",
      asin: "B0FIXTURE01",
      title: "Fixture product"
    });

    const result = promoteSalesTrafficFixture(store, {
      ...context,
      marketplace: "US",
      document: readFixture("sp-api-sales-traffic.single-day.json"),
      documentId: "sales-report-1"
    });

    expect(result).toEqual({ totalRows: 2, importedRows: 2, createdRecords: 2, updatedRecords: 0, unmappedRows: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM sp_api_sales_traffic_daily").get()).toEqual({ count: 2 });
    expect(store.countOpenDataSourceMappingIssues(context.dataSourceId, 1)).toBe(0);
  });

  it("keeps store sales when an ASIN cannot be mapped and records a data-quality issue", () => {
    const context = createContext("sp_api_sales_traffic_daily_sync", "sales_traffic");
    const document = readFixture("sp-api-sales-traffic.single-day.json") as {
      salesAndTrafficByAsin: Array<{ childAsin: string }>;
    };
    document.salesAndTrafficByAsin[0].childAsin = "B0UNKNOWN01";

    const result = promoteSalesTrafficFixture(store, {
      ...context,
      marketplace: "US",
      document,
      documentId: "sales-report-unmapped"
    });

    expect(result).toEqual({ totalRows: 2, importedRows: 1, createdRecords: 1, updatedRecords: 0, unmappedRows: 1 });
    expect(store.listDataSourceMappingIssues({ orgId: 1, dataSourceId: context.dataSourceId })).toEqual([
      expect.objectContaining({ issueType: "unknown_asin", sourceAsin: "B0UNKNOWN01", status: "open" })
    ]);
  });

  it("promotes inventory raw evidence while flagging an unknown seller SKU", () => {
    const context = createContext("sp_api_fba_inventory_incremental_sync", "fba_inventory");

    const result = promoteInventoryFixture(store, {
      ...context,
      marketplace: "US",
      document: readFixture("sp-api-inventory.page.json"),
      documentId: "inventory-page-1"
    });

    expect(result).toEqual({ totalRows: 1, importedRows: 1, createdRecords: 1, updatedRecords: 0, unmappedRows: 1 });
    expect(db.prepare(
      "SELECT product_id, inbound_quantity FROM sp_api_inventory_latest WHERE seller_sku = 'FIXTURE-SKU-1'"
    ).get()).toEqual({ product_id: null, inbound_quantity: 12 });
    expect(store.listDataSourceMappingIssues({ orgId: 1, dataSourceId: context.dataSourceId })).toEqual([
      expect.objectContaining({ issueType: "unknown_sku", sellerSku: "FIXTURE-SKU-1" })
    ]);
  });
});

function createContext(
  operation: "sp_api_sales_traffic_daily_sync" | "sp_api_fba_inventory_incremental_sync",
  domain: "sales_traffic" | "fba_inventory"
) {
  const source = store.createDataSource({
    orgId: 1,
    name: `Fixture ${operation} ${Date.now()}`,
    sourceType: "amazon_sp_api"
  });
  const commerceStore = store.createCommerceStore({
    orgId: 1,
    name: `Fixture store ${Date.now()}`,
    marketplace: "amazon.com",
    sellerId: "FIXTURE-SELLER"
  });
  const run = store.createDataSourceSyncRun({
    orgId: 1,
    dataSourceId: source.id,
    operation,
    domain,
    credentialVersion: 1,
    idempotencyKey: `${operation}-${Date.now()}`
  });
  return {
    orgId: 1,
    dataSourceId: source.id,
    syncRunId: run.id,
    commerceStoreId: commerceStore.id
  };
}

function readFixture(fileName: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDirectory, fileName), "utf8")) as unknown;
}
