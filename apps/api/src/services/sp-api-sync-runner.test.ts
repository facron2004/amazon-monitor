import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore, initSchema } from "../store.js";
import type { Store } from "../store/types.js";
import { encryptSpApiCredentials } from "./sp-api-credentials.js";
import { spApiLwaTokenCache } from "./sp-api-lwa-client.js";
import { runSpApiSyncJob } from "./sp-api-sync-runner.js";

const originalCredentialsKey = process.env.DATA_SOURCE_CREDENTIALS_KEY;
const originalFixtureDirectory = process.env.SP_API_SYNC_FIXTURE_DIR;
const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
let db: DatabaseSync;
let store: Store;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
  process.env.DATA_SOURCE_CREDENTIALS_KEY = Buffer.alloc(32, 5).toString("base64");
  spApiLwaTokenCache.clearAll();
});

afterEach(() => {
  vi.restoreAllMocks();
  spApiLwaTokenCache.clearAll();
  restoreEnv("DATA_SOURCE_CREDENTIALS_KEY", originalCredentialsKey);
  restoreEnv("SP_API_SYNC_FIXTURE_DIR", originalFixtureDirectory);
  db.close();
});

describe("SP-API sync worker", () => {
  it("runs an LWA connection test under the queue lease and records only non-sensitive status", async () => {
    const { source, run, job } = setupConnectionTest();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-token-not-to-persist",
        expires_in: 3600
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(jsonResponse({ reportId: "connection-test-report" }, 202))
      .mockResolvedValueOnce(jsonResponse({ payload: { inventorySummaries: [] } }));

    const log = await runSpApiSyncJob(store, job);

    expect(log).toMatchObject({ taskType: "sp_api_connection_test", status: "success" });
    expect(store.getDataSourceSyncRun(run.id, 1)).toMatchObject({ status: "success" });
    expect(store.getSpApiConnection(source.id, 1)).toMatchObject({
      credentialVersion: 1,
      lastTestedAt: expect.any(String)
    });
    expect(store.getDataSource(source.id)).toMatchObject({
      status: "connected",
      syncStatus: "manual"
    });
    expect(store.listDataSourceDomainHealth(source.id, 1)).toEqual([
      expect.objectContaining({ domain: "fba_inventory", status: "success" }),
      expect.objectContaining({ domain: "sales_traffic", status: "success" })
    ]);
    expect(JSON.stringify(store.listTaskLogs(10, 0, 1))).not.toContain("access-token-not-to-persist");
  });

  it("fails an outdated credential-version run without using replacement credentials", async () => {
    const { source, storeAccount, run, job } = setupConnectionTest();
    store.replaceSpApiConnection({
      orgId: 1,
      dataSourceId: source.id,
      region: "NA",
      commerceStoreIds: [storeAccount.id],
      encryptedCredentials: encryptSpApiCredentials({
        lwaClientId: "replacement-client",
        lwaClientSecret: "replacement-secret",
        lwaRefreshToken: "replacement-refresh"
      }, { orgId: 1, dataSourceId: source.id })
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const log = await runSpApiSyncJob(store, job);

    expect(log).toMatchObject({ status: "failed", errorMessage: "SP-API credentials changed before this run started" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.getDataSourceSyncRun(run.id, 1)).toMatchObject({ status: "failed" });
  });

  it("promotes a queued fixture Sales sync through the active worker lease", async () => {
    const { source, storeAccount, run, job } = setupFixtureSync();
    store.createProduct({
      orgId: 1,
      storeId: storeAccount.id,
      marketplace: "US",
      sku: "FIXTURE-SKU-1",
      asin: "B0FIXTURE01",
      title: "Fixture product"
    });
    process.env.SP_API_SYNC_FIXTURE_DIR = fixtureDirectory;

    const log = await runSpApiSyncJob(store, job);

    expect(log).toMatchObject({ taskType: "sp_api_sales_traffic_daily_sync", status: "success" });
    expect(store.getDataSourceSyncRun(run.id, 1)).toMatchObject({
      status: "success",
      totalRows: 2,
      importedRows: 2,
      createdRecords: 2
    });
    expect(store.getDataSource(source.id)).toMatchObject({ status: "connected", syncStatus: "success" });
    expect(store.listDataSourceDomainHealth(source.id, 1)).toEqual([
      expect.objectContaining({ domain: "sales_traffic", status: "success" })
    ]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM sp_api_sales_traffic_daily").get()).toEqual({ count: 2 });
  });

  it("uses the Reports lifecycle once and checkpoints the report ID for a live Sales sync", async () => {
    const { source, storeAccount, run, job } = setupLiveSalesSync();
    store.createProduct({
      orgId: 1,
      storeId: storeAccount.id,
      marketplace: "US",
      sku: "LIVE-SKU-1",
      asin: "B0LIVE00001",
      title: "Live product"
    });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "live-access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ reportId: "report-live-1" }, 202))
      .mockResolvedValueOnce(jsonResponse({ processingStatus: "DONE", reportDocumentId: "document-live-1" }))
      .mockResolvedValueOnce(jsonResponse({ url: "https://documents.example.test/report-live-1" }))
      .mockResolvedValueOnce(jsonResponse(salesDocument("B0LIVE00001")));

    const log = await runSpApiSyncJob(store, job);

    expect(log).toMatchObject({ taskType: "sp_api_sales_traffic_daily_sync", status: "success" });
    expect(store.getDataSourceSyncRun(run.id, 1)).toMatchObject({
      status: "success",
      externalRequestId: "report-live-1",
      importedRows: 2
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.amazon.com/auth/o2/token",
      "https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports",
      "https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports/report-live-1",
      "https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports/documents/document-live-1",
      "https://documents.example.test/report-live-1"
    ]);
  });

  it("promotes a live FBA response and sends the incremental start time", async () => {
    const { source, storeAccount, run, job } = setupLiveFbaSync();
    store.createProduct({
      orgId: 1,
      storeId: storeAccount.id,
      marketplace: "US",
      sku: "LIVE-FBA-SKU-1",
      asin: "B0LIVEFBA01",
      title: "Live FBA product"
    });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "live-access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        payload: {
          inventorySummaries: [{
            sellerSku: "LIVE-FBA-SKU-1",
            asin: "B0LIVEFBA01",
            totalQuantity: 15,
            lastUpdatedTime: "2026-07-28T07:30:00.000Z",
            inventoryDetails: {
              fulfillableQuantity: 10,
              reservedQuantity: 2,
              inboundWorkingQuantity: 1,
              inboundShippedQuantity: 1,
              inboundReceivingQuantity: 1,
              unfulfillableQuantity: 0
            }
          }]
        }
      }));

    const log = await runSpApiSyncJob(store, job);

    expect(log).toMatchObject({ taskType: "sp_api_fba_inventory_incremental_sync", status: "success" });
    expect(store.getDataSourceSyncRun(run.id, 1)).toMatchObject({ status: "success", importedRows: 1 });
    const inventoryUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(inventoryUrl.pathname).toBe("/fba/inventory/v1/summaries");
    expect(inventoryUrl.searchParams.get("details")).toBe("true");
    expect(inventoryUrl.searchParams.get("startDateTime")).toEqual(expect.any(String));
    expect(db.prepare("SELECT inbound_quantity, total_quantity FROM sp_api_inventory_latest").get()).toEqual({
      inbound_quantity: 3,
      total_quantity: 15
    });
    expect(store.getDataSource(source.id)).toMatchObject({ status: "connected", syncStatus: "success" });
  });
});

function setupConnectionTest() {
  const source = store.createDataSource({
    orgId: 1,
    name: "Worker SP-API source",
    sourceType: "amazon_sp_api"
  });
  const storeAccount = store.createCommerceStore({
    orgId: 1,
    name: "Worker SP-API store",
    marketplace: "amazon.com",
    sellerId: "WORKER-SELLER"
  });
  store.replaceSpApiConnection({
    orgId: 1,
    dataSourceId: source.id,
    region: "NA",
    commerceStoreIds: [storeAccount.id],
    encryptedCredentials: encryptSpApiCredentials({
      lwaClientId: "test-client",
      lwaClientSecret: "test-secret",
      lwaRefreshToken: "test-refresh"
    }, { orgId: 1, dataSourceId: source.id })
  });
  const run = store.createDataSourceSyncRun({
    orgId: 1,
    dataSourceId: source.id,
    operation: "sp_api_connection_test",
    trigger: "manual",
    credentialVersion: 1,
    idempotencyKey: `connection-test-${Date.now()}`
  });
  store.pushJob("data_source_sync", run.id, "2026-07-28", 1);
  const job = store.claimNextJob("sp-api-test-worker", 60_000)!;
  return { source, storeAccount, run, job };
}

function setupFixtureSync() {
  const source = store.createDataSource({
    orgId: 1,
    name: "Worker fixture source",
    sourceType: "amazon_sp_api"
  });
  const storeAccount = store.createCommerceStore({
    orgId: 1,
    name: "Worker fixture store",
    marketplace: "amazon.com",
    sellerId: "FIXTURE-SELLER"
  });
  store.replaceSpApiConnection({
    orgId: 1,
    dataSourceId: source.id,
    region: "NA",
    commerceStoreIds: [storeAccount.id],
    encryptedCredentials: encryptSpApiCredentials({
      lwaClientId: "test-client",
      lwaClientSecret: "test-secret",
      lwaRefreshToken: "test-refresh"
    }, { orgId: 1, dataSourceId: source.id })
  });
  const run = store.createDataSourceSyncRun({
    orgId: 1,
    dataSourceId: source.id,
    operation: "sp_api_sales_traffic_daily_sync",
    domain: "sales_traffic",
    trigger: "manual",
    mode: "incremental",
    credentialVersion: 1,
    marketplaces: ["US"],
    idempotencyKey: `fixture-sync-${Date.now()}`
  });
  store.pushJob("data_source_sync", run.id, "2026-07-28", 1);
  const job = store.claimNextJob("sp-api-fixture-worker", 60_000)!;
  return { source, storeAccount, run, job };
}

function setupLiveSalesSync() {
  const source = store.createDataSource({
    orgId: 1,
    name: "Worker live Sales source",
    sourceType: "amazon_sp_api"
  });
  const storeAccount = store.createCommerceStore({
    orgId: 1,
    name: "Worker live Sales store",
    marketplace: "amazon.com",
    sellerId: "LIVE-SELLER"
  });
  store.replaceSpApiConnection({
    orgId: 1,
    dataSourceId: source.id,
    region: "NA",
    commerceStoreIds: [storeAccount.id],
    encryptedCredentials: encryptSpApiCredentials({
      lwaClientId: "live-client",
      lwaClientSecret: "live-secret",
      lwaRefreshToken: "live-refresh"
    }, { orgId: 1, dataSourceId: source.id })
  });
  const run = store.createDataSourceSyncRun({
    orgId: 1,
    dataSourceId: source.id,
    operation: "sp_api_sales_traffic_daily_sync",
    domain: "sales_traffic",
    trigger: "manual",
    mode: "incremental",
    credentialVersion: 1,
    marketplaces: ["US"],
    requestedFromDate: "2026-07-27",
    requestedToDate: "2026-07-27",
    idempotencyKey: `live-sales-sync-${Date.now()}`
  });
  store.pushJob("data_source_sync", run.id, "2026-07-28", 1);
  const job = store.claimNextJob("sp-api-live-sales-worker", 60_000)!;
  return { source, storeAccount, run, job };
}

function setupLiveFbaSync() {
  const source = store.createDataSource({
    orgId: 1,
    name: "Worker live FBA source",
    sourceType: "amazon_sp_api"
  });
  const storeAccount = store.createCommerceStore({
    orgId: 1,
    name: "Worker live FBA store",
    marketplace: "amazon.com",
    sellerId: "LIVE-FBA-SELLER"
  });
  store.replaceSpApiConnection({
    orgId: 1,
    dataSourceId: source.id,
    region: "NA",
    commerceStoreIds: [storeAccount.id],
    encryptedCredentials: encryptSpApiCredentials({
      lwaClientId: "live-fba-client",
      lwaClientSecret: "live-fba-secret",
      lwaRefreshToken: "live-fba-refresh"
    }, { orgId: 1, dataSourceId: source.id })
  });
  const run = store.createDataSourceSyncRun({
    orgId: 1,
    dataSourceId: source.id,
    operation: "sp_api_fba_inventory_incremental_sync",
    domain: "fba_inventory",
    trigger: "manual",
    mode: "incremental",
    credentialVersion: 1,
    marketplaces: ["US"],
    idempotencyKey: `live-fba-sync-${Date.now()}`
  });
  store.pushJob("data_source_sync", run.id, "2026-07-28", 1);
  const job = store.claimNextJob("sp-api-live-fba-worker", 60_000)!;
  return { source, storeAccount, run, job };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function salesDocument(asin: string): unknown {
  return {
    salesAndTrafficByDate: [{
      date: "2026-07-27",
      salesByDate: {
        orderedProductSales: { amount: 120.5, currencyCode: "USD" },
        totalOrderItems: 3,
        unitsOrdered: 4
      },
      trafficByDate: { sessions: 70, pageViews: 90, buyBoxPercentage: 98.5, unitSessionPercentage: 5.7 }
    }],
    salesAndTrafficByAsin: [{
      childAsin: asin,
      salesByAsin: {
        orderedProductSales: { amount: 120.5, currencyCode: "USD" },
        totalOrderItems: 3,
        unitsOrdered: 4
      },
      trafficByAsin: { sessions: 70, pageViews: 90, buyBoxPercentage: 98.5, unitSessionPercentage: 5.7 }
    }]
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
