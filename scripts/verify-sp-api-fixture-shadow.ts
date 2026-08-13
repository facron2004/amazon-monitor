import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore, initSchema, type ClaimedCollectJob, type Store } from "../apps/api/src/store.js";
import { encryptSpApiCredentials } from "../apps/api/src/services/sp-api-credentials.js";
import { runSpApiSyncJob } from "../apps/api/src/services/sp-api-sync-runner.js";

const orgId = 1;
const marketplace = "US";
const businessDate = "2026-07-27";
const fixtureDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
  "api",
  "src",
  "services",
  "fixtures"
);

interface ShadowEvidence {
  ok: true;
  networkCalls: number;
  sales: {
    firstRunId: number;
    replayRunId: number;
    factRows: number;
    businessDates: string[];
    currencies: string[];
    replayCreatedRecords: number;
    replayUpdatedRecords: number;
  };
  inventory: {
    runId: number;
    snapshotRows: number;
    latestRows: number;
    domainHealthStatus: string;
  };
  dashboard: {
    marketplace: string;
    currency: string | null;
    metricProductCount: number;
    salesAmount: number | null;
    orders: number | null;
  };
}

async function main(): Promise<void> {
  const originalEnvironment = captureEnvironment();
  const originalFetch = globalThis.fetch;
  const db = new DatabaseSync(":memory:");
  let networkCalls = 0;
  try {
    process.env.NODE_ENV = "development";
    process.env.SP_API_CONNECTOR_ENABLED = "true";
    process.env.SP_API_SYNC_FIXTURE_DIR = fixtureDirectory;
    process.env.DATA_SOURCE_CREDENTIALS_KEY = Buffer.alloc(32, 7).toString("base64");
    globalThis.fetch = (async () => {
      networkCalls += 1;
      throw new Error("Fixture shadow verifier must not make network requests");
    }) as typeof fetch;

    initSchema(db);
    const store = createStore(db);
    const source = store.createDataSource({ orgId, name: "Fixture shadow SP-API", sourceType: "amazon_sp_api" });
    const commerceStore = store.createCommerceStore({
      orgId,
      name: "Fixture shadow US store",
      marketplace: "amazon.com",
      sellerId: "FIXTURE-SHADOW-SELLER"
    });
    store.replaceSpApiConnection({
      orgId,
      dataSourceId: source.id,
      region: "NA",
      commerceStoreIds: [commerceStore.id],
      encryptedCredentials: encryptSpApiCredentials({
        lwaClientId: "fixture-shadow-client",
        lwaClientSecret: "fixture-shadow-secret",
        lwaRefreshToken: "fixture-shadow-refresh"
      }, { orgId, dataSourceId: source.id })
    });
    const product = store.createProduct({
      orgId,
      storeId: commerceStore.id,
      marketplace,
      sku: "FIXTURE-SKU-1",
      asin: "B0FIXTURE01",
      title: "Fixture shadow product"
    });

    const firstSalesRun = createRun(store, source.id, "sp_api_sales_traffic_daily_sync", "sales-shadow-1");
    const firstSalesResult = await runQueuedSync(store, firstSalesRun.id, "fixture-shadow-sales-1");
    assert(firstSalesResult.status === "success", "First Sales & Traffic fixture run did not succeed");

    const replaySalesRun = createRun(store, source.id, "sp_api_sales_traffic_daily_sync", "sales-shadow-2");
    const replaySalesResult = await runQueuedSync(store, replaySalesRun.id, "fixture-shadow-sales-2");
    assert(replaySalesResult.status === "success", "Replay Sales & Traffic fixture run did not succeed");
    const replayRun = store.getDataSourceSyncRun(replaySalesRun.id, orgId);
    assert(replayRun?.createdRecords === 0, "Sales replay created duplicate facts");
    assert(replayRun.updatedRecords === 2, "Sales replay did not update both store and SKU facts");

    const inventoryRun = createRun(store, source.id, "sp_api_fba_inventory_incremental_sync", "inventory-shadow-1");
    const inventoryResult = await runQueuedSync(store, inventoryRun.id, "fixture-shadow-inventory-1");
    assert(inventoryResult.status === "success", "FBA fixture run did not succeed");

    const salesFacts = db.prepare(`
      SELECT business_date, currency, data_source_id, sync_run_id
      FROM sp_api_sales_traffic_daily
      WHERE org_id = ?
      ORDER BY scope ASC
    `).all(orgId) as Array<{
      business_date: string;
      currency: string;
      data_source_id: number;
      sync_run_id: number;
    }>;
    assert(salesFacts.length === 2, "Expected one store and one SKU Sales & Traffic fact");
    assert(salesFacts.every((row) => row.business_date === businessDate), "Sales facts changed business date");
    assert(salesFacts.every((row) => row.currency === "USD"), "Sales facts changed currency");
    assert(salesFacts.every((row) => row.data_source_id === source.id), "Sales fact source lineage is incomplete");
    assert(salesFacts.every((row) => row.sync_run_id === replaySalesRun.id), "Sales replay did not replace run provenance");

    const inventoryRows = db.prepare(
      "SELECT COUNT(*) AS count FROM sp_api_inventory_snapshots WHERE org_id = ?"
    ).get(orgId) as { count: number };
    const latestInventoryRows = db.prepare(
      "SELECT COUNT(*) AS count FROM sp_api_inventory_latest WHERE org_id = ? AND status = 'success'"
    ).get(orgId) as { count: number };
    const health = store.listDataSourceDomainHealth(source.id, orgId).find((item) => item.domain === "fba_inventory");
    assert(inventoryRows.count === 1, "Expected one FBA inventory snapshot");
    assert(latestInventoryRows.count === 1, "Expected one current FBA inventory fact");
    assert(health?.status === "success", "FBA domain health was not successful");

    const dashboard = store.getDashboardOperationsSummary(orgId, businessDate);
    const dashboardMarketplace = dashboard.marketplaces.find((item) => item.marketplace === marketplace);
    assert(dashboardMarketplace !== undefined, "Dashboard did not expose the fixture marketplace");
    assert(dashboardMarketplace.salesAmount === 120.5, "Dashboard sales amount did not use STORE_DAILY authority");
    assert(dashboardMarketplace.orders === 3, "Dashboard orders did not use STORE_DAILY authority");
    assert(dashboardMarketplace.metricProductCount === 1, "Dashboard product coverage is incorrect");
    assert(networkCalls === 0, "Fixture shadow verifier made a network request");

    const evidence: ShadowEvidence = {
      ok: true,
      networkCalls,
      sales: {
        firstRunId: firstSalesRun.id,
        replayRunId: replaySalesRun.id,
        factRows: salesFacts.length,
        businessDates: [...new Set(salesFacts.map((row) => row.business_date))],
        currencies: [...new Set(salesFacts.map((row) => row.currency))],
        replayCreatedRecords: replayRun.createdRecords,
        replayUpdatedRecords: replayRun.updatedRecords
      },
      inventory: {
        runId: inventoryRun.id,
        snapshotRows: inventoryRows.count,
        latestRows: latestInventoryRows.count,
        domainHealthStatus: health?.status ?? "missing"
      },
      dashboard: {
        marketplace: dashboardMarketplace.marketplace,
        currency: dashboardMarketplace.currency ?? null,
        metricProductCount: dashboardMarketplace.metricProductCount,
        salesAmount: dashboardMarketplace.salesAmount,
        orders: dashboardMarketplace.orders
      }
    };
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(originalEnvironment);
    db.close();
  }
}

function createRun(
  store: Store,
  dataSourceId: number,
  operation: "sp_api_sales_traffic_daily_sync" | "sp_api_fba_inventory_incremental_sync",
  idempotencyKey: string
) {
  return store.createDataSourceSyncRun({
    orgId,
    dataSourceId,
    operation,
    domain: operation.includes("sales") ? "sales_traffic" : "fba_inventory",
    trigger: "manual",
    mode: "incremental",
    credentialVersion: 1,
    marketplaces: [marketplace],
    requestedFromDate: businessDate,
    requestedToDate: businessDate,
    idempotencyKey
  });
}

async function runQueuedSync(store: Store, runId: number, workerId: string) {
  store.pushJob("data_source_sync", runId, businessDate, orgId);
  const job = store.claimNextJob(workerId, 60_000);
  assert(job !== null, `Could not claim shadow run ${runId}`);
  const result = await runSpApiSyncJob(store, job);
  assert(store.completeJob(job.id, job.leaseOwner, job.leaseToken), `Could not complete shadow job ${job.id}`);
  return result;
}

function captureEnvironment(): Record<string, string | undefined> {
  return {
    NODE_ENV: process.env.NODE_ENV,
    SP_API_CONNECTOR_ENABLED: process.env.SP_API_CONNECTOR_ENABLED,
    SP_API_SYNC_FIXTURE_DIR: process.env.SP_API_SYNC_FIXTURE_DIR,
    DATA_SOURCE_CREDENTIALS_KEY: process.env.DATA_SOURCE_CREDENTIALS_KEY
  };
}

function restoreEnvironment(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sp-api-fixture-shadow] failed: ${message}`);
  process.exitCode = 1;
});
