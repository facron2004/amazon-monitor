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
const originalConnectorEnabled = process.env.SP_API_CONNECTOR_ENABLED;
const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
let db: DatabaseSync;
let store: Store;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
  process.env.DATA_SOURCE_CREDENTIALS_KEY = Buffer.alloc(32, 5).toString("base64");
  process.env.SP_API_CONNECTOR_ENABLED = "true";
  spApiLwaTokenCache.clearAll();
});

afterEach(() => {
  vi.restoreAllMocks();
  spApiLwaTokenCache.clearAll();
  restoreEnv("DATA_SOURCE_CREDENTIALS_KEY", originalCredentialsKey);
  restoreEnv("SP_API_SYNC_FIXTURE_DIR", originalFixtureDirectory);
  restoreEnv("SP_API_CONNECTOR_ENABLED", originalConnectorEnabled);
  db.close();
});

describe("SP-API sync worker", () => {
  it("fails a queued run without making an API request when the connector is disabled", async () => {
    const { source, run, job } = setupConnectionTest();
    store.updateDataSource(source.id, { status: "connected", syncStatus: "pending" });
    process.env.SP_API_CONNECTOR_ENABLED = "false";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const log = await runSpApiSyncJob(store, job);

    expect(log).toMatchObject({ status: "failed", errorMessage: "SP-API connector is disabled", retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.getDataSourceSyncRun(run.id, 1)).toMatchObject({
      status: "failed",
      errorCode: "connector_disabled",
      retryCount: 1,
      errorSummary: "SP-API connector is disabled"
    });
    expect(store.getDataSource(source.id)).toMatchObject({
      status: "connected",
      syncStatus: "manual",
      syncError: null
    });
  });

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
    expect(store.getDataSourceSyncRun(run.id, 1)).toMatchObject({ status: "success", errorCode: null, retryCount: 0 });
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
    expect(store.getDataSourceSyncRun(run.id, 1)).toMatchObject({ status: "failed", errorCode: "credentials_invalid", retryCount: 1 });
  });

  it("marks rate-limited SP-API runs as retryable", async () => {
    const { run, job } = setupLiveFbaSync();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "rate-limited-access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ code: "QuotaExceeded" }] }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "2" }
      }));

    const log = await runSpApiSyncJob(store, job);

    expect(log).toMatchObject({
      status: "failed",
      retryable: true,
      retryAfterMs: 2_000,
      errorMessage: "SP-API is rate limited"
    });
    expect(store.getDataSourceSyncRun(run.id, 1)).toMatchObject({
      status: "failed",
      errorCode: "rate_limited",
      retryCount: 1,
      errorSummary: "SP-API is rate limited"
    });
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
      errorCode: null,
      retryCount: 0,
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

  it("records a partial run with a mapping error code without discarding imported facts", async () => {
    const { source, run, job } = setupFixtureSync();
    process.env.SP_API_SYNC_FIXTURE_DIR = fixtureDirectory;

    const log = await runSpApiSyncJob(store, job);

    expect(log).toMatchObject({ status: "success" });
    expect(store.getDataSourceSyncRun(run.id, 1)).toMatchObject({
      status: "partial",
      errorCode: "mapping_blocked",
      retryCount: 0,
      totalRows: 2,
      importedRows: 1,
      failedRows: 1
    });
    expect(store.getDataSource(source.id)).toMatchObject({ status: "attention", syncStatus: "partial" });
    expect(store.listDataSourceMappingIssues({ orgId: 1, dataSourceId: source.id })).toHaveLength(1);
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
      errorCode: null,
      retryCount: 0,
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
    expect(store.getDataSourceSyncRun(run.id, 1)).toMatchObject({ status: "success", errorCode: null, retryCount: 0, importedRows: 1 });
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

  it("refreshes an expired SP-API access token once without restarting the FBA page stream", async () => {
    const { run, storeAccount, job } = setupLiveFbaSync();
    store.createProduct({
      orgId: 1,
      storeId: storeAccount.id,
      marketplace: "US",
      sku: "REFRESH-FBA-SKU-1",
      asin: "B0REFRESH01",
      title: "Refreshed FBA product"
    });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "expired-access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "refreshed-access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        payload: {
          inventorySummaries: [inventorySummary("REFRESH-FBA-SKU-1", "B0REFRESH01", 6)]
        }
      }));

    const log = await runSpApiSyncJob(store, job);

    expect(log).toMatchObject({ status: "success" });
    expect(store.getDataSourceSyncRun(run.id, 1)).toMatchObject({
      status: "success",
      importedRows: 1,
      errorCode: null
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({
      "x-amz-access-token": "expired-access-token"
    });
    expect((fetchMock.mock.calls[3][1] as RequestInit).headers).toMatchObject({
      "x-amz-access-token": "refreshed-access-token"
    });
  });

  it("resumes a failed FBA page from its persisted token and preserves the original window", async () => {
    const { run, storeAccount, job } = setupLiveFbaSync();
    store.createProduct({
      orgId: 1,
      storeId: storeAccount.id,
      marketplace: "US",
      sku: "RESUME-FBA-SKU-1",
      asin: "B0RESUME001",
      title: "Resumed FBA product 1"
    });
    store.createProduct({
      orgId: 1,
      storeId: storeAccount.id,
      marketplace: "US",
      sku: "RESUME-FBA-SKU-2",
      asin: "B0RESUME002",
      title: "Resumed FBA product 2"
    });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "resume-access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        payload: {
          inventorySummaries: [inventorySummary("RESUME-FBA-SKU-1", "B0RESUME001", 10)],
          nextToken: "page-2"
        }
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 429,
        headers: { "Retry-After": "2" }
      }));

    const firstLog = await runSpApiSyncJob(store, job);

    expect(firstLog).toMatchObject({ status: "failed", retryable: true, retryAfterMs: 2_000 });
    const firstRun = store.getDataSourceSyncRun(run.id, 1);
    expect(firstRun).toMatchObject({ status: "failed", errorCode: "rate_limited" });
    const checkpoint = JSON.parse(firstRun?.checkpointSummary ?? "null") as Record<string, unknown>;
    expect(checkpoint).toMatchObject({
      version: 1,
      nextToken: "page-2",
      pagesCompleted: 1,
      rowsSeen: 1,
      importedRows: 1,
      completed: false,
      startDateTime: expect.any(String)
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM sp_api_inventory_latest").get()).toEqual({ count: 1 });

    expect(store.failJob(job.id, job.leaseOwner, job.leaseToken, "retry now", 5, 0)).toBe(true);
    const retryJob = store.claimNextJob("sp-api-resume-worker", 60_000);
    expect(retryJob).not.toBeNull();
    fetchMock.mockResolvedValueOnce(jsonResponse({
      payload: {
        inventorySummaries: [inventorySummary("RESUME-FBA-SKU-2", "B0RESUME002", 7)]
      }
    }));

    const secondLog = await runSpApiSyncJob(store, retryJob!);

    expect(secondLog).toMatchObject({ status: "success" });
    expect(store.getDataSourceSyncRun(run.id, 1)).toMatchObject({
      status: "success",
      totalRows: 2,
      importedRows: 2,
      createdRecords: 2,
      errorCode: null
    });
    const finalCheckpoint = JSON.parse(store.getDataSourceSyncRun(run.id, 1)?.checkpointSummary ?? "null") as Record<string, unknown>;
    expect(finalCheckpoint).toMatchObject({
      nextToken: null,
      pagesCompleted: 2,
      rowsSeen: 2,
      importedRows: 2,
      completed: true,
      startDateTime: checkpoint.startDateTime
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM sp_api_inventory_latest").get()).toEqual({ count: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const resumedUrl = new URL(String(fetchMock.mock.calls[3][0]));
    expect(resumedUrl.searchParams.get("nextToken")).toBe("page-2");
    expect(resumedUrl.searchParams.get("startDateTime")).toBe(checkpoint.startDateTime);
  });

  it("rolls back a page promotion when its checkpoint cannot be persisted", async () => {
    const { run, storeAccount, job } = setupLiveFbaSync();
    store.createProduct({
      orgId: 1,
      storeId: storeAccount.id,
      marketplace: "US",
      sku: "ATOMIC-FBA-SKU-1",
      asin: "B0ATOMIC001",
      title: "Atomic FBA product"
    });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ access_token: "atomic-access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        payload: {
          inventorySummaries: [inventorySummary("ATOMIC-FBA-SKU-1", "B0ATOMIC001", 8)]
        }
      }));
    const persistCheckpoint = store.setDataSourceSyncRunCheckpoint.bind(store);
    let checkpointCalls = 0;
    vi.spyOn(store, "setDataSourceSyncRunCheckpoint").mockImplementation((id, orgId, summary) => {
      checkpointCalls += 1;
      return checkpointCalls === 2 ? null : persistCheckpoint(id, orgId, summary);
    });

    const log = await runSpApiSyncJob(store, job);

    expect(log).toMatchObject({
      status: "failed",
      retryable: true,
      errorMessage: "FBA page checkpoint could not be persisted"
    });
    expect(checkpointCalls).toBe(2);
    expect(db.prepare("SELECT COUNT(*) AS count FROM sp_api_inventory_latest").get()).toEqual({ count: 0 });
    const checkpoint = JSON.parse(store.getDataSourceSyncRun(run.id, 1)?.checkpointSummary ?? "null") as Record<string, unknown>;
    expect(checkpoint).toMatchObject({
      nextToken: null,
      pagesCompleted: 0,
      rowsSeen: 0,
      importedRows: 0,
      completed: false
    });
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

function inventorySummary(sellerSku: string, asin: string, totalQuantity: number): unknown {
  return {
    sellerSku,
    asin,
    totalQuantity,
    lastUpdatedTime: "2026-07-28T07:30:00.000Z",
    inventoryDetails: {
      fulfillableQuantity: totalQuantity - 3,
      reservedQuantity: 2,
      inboundWorkingQuantity: 1,
      inboundShippedQuantity: 0,
      inboundReceivingQuantity: 0,
      unfulfillableQuantity: 0
    }
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
