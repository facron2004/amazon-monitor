import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, initSchema, type ClaimedCollectJob, type Store } from "../apps/api/src/store.js";
import { encryptSpApiCredentials } from "../apps/api/src/services/sp-api-credentials.js";
import { spApiLwaTokenCache } from "../apps/api/src/services/sp-api-lwa-client.js";
import { runSpApiSyncJob } from "../apps/api/src/services/sp-api-sync-runner.js";

const orgId = 1;
const marketplace = "US";
const businessDate = "2026-07-27";

interface RequestEvidence {
  kind: "lwa" | "fba";
  nextToken?: string | null;
  startDateTime?: string | null;
  status: number;
}

interface RecoveryEvidence {
  ok: true;
  transport: "local-http-stub";
  processRestarted: true;
  requestCount: number;
  requests: RequestEvidence[];
  runId: number;
  firstLog: { status: string; retryable: boolean; retryAfterMs: number | null };
  firstCheckpoint: Record<string, unknown>;
  finalCheckpoint: Record<string, unknown>;
  finalRun: { status: string; totalRows: number; importedRows: number; createdRecords: number };
  inventoryLatestRows: number;
}

async function main(): Promise<void> {
  const originalEnvironment = captureEnvironment();
  const originalFetch = globalThis.fetch;
  const tempRoot = mkdtempSync(join(tmpdir(), "amazon-monitor-recovery-shadow-"));
  const dbPath = join(tempRoot, "shadow.sqlite");
  let db = new DatabaseSync(dbPath);
  let store: Store;
  const requests: RequestEvidence[] = [];
  let fbaPageCalls = 0;
  try {
    process.env.NODE_ENV = "development";
    process.env.SP_API_CONNECTOR_ENABLED = "true";
    delete process.env.SP_API_SYNC_FIXTURE_DIR;
    process.env.DATA_SOURCE_CREDENTIALS_KEY = Buffer.alloc(32, 9).toString("base64");
    spApiLwaTokenCache.clearAll();
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/o2/token") {
        requests.push({ kind: "lwa", status: 200 });
        return jsonResponse({ access_token: "shadow-access-token", expires_in: 3600 });
      }
      if (url.pathname !== "/fba/inventory/v1/summaries") {
        throw new Error(`Unexpected shadow request: ${url.toString()}`);
      }
      fbaPageCalls += 1;
      const nextToken = url.searchParams.get("nextToken");
      const requestedStartDateTime = url.searchParams.get("startDateTime");
      requests.push({ kind: "fba", nextToken, startDateTime: requestedStartDateTime, status: fbaPageCalls === 2 ? 429 : 200 });
      if (fbaPageCalls === 2) {
        return new Response(null, { status: 429, headers: { "Retry-After": "1" } });
      }
      if (fbaPageCalls === 1 && nextToken === null) {
        return jsonResponse({
          payload: {
            inventorySummaries: [inventorySummary("RECOVERY-SKU-1", "B0RECOVERY01", 10)],
            nextToken: "page-2"
          }
        });
      }
      if (fbaPageCalls === 3 && nextToken === "page-2") {
        return jsonResponse({
          payload: {
            inventorySummaries: [inventorySummary("RECOVERY-SKU-2", "B0RECOVERY02", 7)]
          }
        });
      }
      throw new Error(`Unexpected FBA page request ${fbaPageCalls} with token ${nextToken ?? "<none>"}`);
    };

    initSchema(db);
    store = createStore(db);
    const source = store.createDataSource({ orgId, name: "Live recovery shadow SP-API", sourceType: "amazon_sp_api" });
    const commerceStore = store.createCommerceStore({
      orgId,
      name: "Live recovery shadow US store",
      marketplace: "amazon.com",
      sellerId: "RECOVERY-SHADOW-SELLER"
    });
    store.replaceSpApiConnection({
      orgId,
      dataSourceId: source.id,
      region: "NA",
      commerceStoreIds: [commerceStore.id],
      encryptedCredentials: encryptSpApiCredentials({
        lwaClientId: "shadow-client",
        lwaClientSecret: "shadow-secret",
        lwaRefreshToken: "shadow-refresh"
      }, { orgId, dataSourceId: source.id })
    });
    for (const [sku, asin] of [["RECOVERY-SKU-1", "B0RECOVERY01"], ["RECOVERY-SKU-2", "B0RECOVERY02"]]) {
      store.createProduct({ orgId, storeId: commerceStore.id, marketplace, sku, asin, title: `Recovery ${sku}` });
    }

    const run = createRun(store, source.id);
    const firstJob = claimJob(store, run.id, "recovery-shadow-worker-1");
    const firstLog = await runSpApiSyncJob(store, firstJob);
    assert(firstLog.status === "failed" && firstLog.retryable === true, "First live FBA attempt did not fail retryably");
    assert(firstLog.retryAfterMs === 1_000, "Retry-After was not preserved as one second");
    const firstRun = store.getDataSourceSyncRun(run.id, orgId);
    assert(firstRun?.status === "failed" && firstRun.errorCode === "rate_limited", "First run did not record rate limiting");
    const firstCheckpoint = parseCheckpoint(firstRun?.checkpointSummary);
    assert(firstCheckpoint.nextToken === "page-2", "First page checkpoint did not persist nextToken");
    assert(firstCheckpoint.pagesCompleted === 1 && firstCheckpoint.rowsSeen === 1, "First page checkpoint counters are incorrect");
    assert(typeof firstCheckpoint.startDateTime === "string" && firstCheckpoint.startDateTime.length > 0, "Initial FBA startDateTime was not persisted");
    assert(countLatest(db) === 1, "First page was not promoted before the retry");
    assert(store.failJob(firstJob.id, firstJob.leaseOwner, firstJob.leaseToken, "shadow retry", 5, 0), "Could not requeue recovery shadow job");

    db.close();
    spApiLwaTokenCache.clearAll();
    db = new DatabaseSync(dbPath);
    store = createStore(db);

    const retryJob = claimJob(store, run.id, "recovery-shadow-worker-2");
    const secondLog = await runSpApiSyncJob(store, retryJob);
    assert(secondLog.status === "success", "Resumed live FBA attempt did not succeed");
    assert(store.completeJob(retryJob.id, retryJob.leaseOwner, retryJob.leaseToken), "Could not complete recovery shadow job");
    const finalRun = store.getDataSourceSyncRun(run.id, orgId);
    const finalCheckpoint = parseCheckpoint(finalRun?.checkpointSummary);
    assert(finalRun?.status === "success", "Resumed run did not finish successfully");
    assert(finalRun.totalRows === 2 && finalRun.importedRows === 2 && finalRun.createdRecords === 2, "Resumed run counters are incorrect");
    assert(finalCheckpoint.nextToken === null && finalCheckpoint.pagesCompleted === 2, "Final checkpoint did not close the page stream");
    assert(finalCheckpoint.startDateTime === firstCheckpoint.startDateTime, "Resumed run changed the original startDateTime");
    assert(countLatest(db) === 2, "Resumed page did not promote the second inventory fact");
    assert(requests.length === 5, "Unexpected number of local HTTP stub requests after process restart");
    assert(requests[3]?.kind === "lwa", "The restarted process did not reacquire its LWA token");
    assert(requests[4]?.nextToken === "page-2" && requests[4]?.startDateTime === firstCheckpoint.startDateTime, "Resume request did not carry checkpoint parameters");

    const evidence: RecoveryEvidence = {
      ok: true,
      transport: "local-http-stub",
      processRestarted: true,
      requestCount: requests.length,
      requests,
      runId: run.id,
      firstLog: { status: firstLog.status, retryable: firstLog.retryable, retryAfterMs: firstLog.retryAfterMs ?? null },
      firstCheckpoint,
      finalCheckpoint,
      finalRun: {
        status: finalRun.status,
        totalRows: finalRun.totalRows,
        importedRows: finalRun.importedRows,
        createdRecords: finalRun.createdRecords
      },
      inventoryLatestRows: countLatest(db)
    };
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(originalEnvironment);
    spApiLwaTokenCache.clearAll();
    db.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function createRun(store: Store, dataSourceId: number) {
  return store.createDataSourceSyncRun({
    orgId,
    dataSourceId,
    operation: "sp_api_fba_inventory_incremental_sync",
    domain: "fba_inventory",
    trigger: "manual",
    mode: "incremental",
    credentialVersion: 1,
    marketplaces: [marketplace],
    requestedFromDate: businessDate,
    requestedToDate: businessDate,
    idempotencyKey: "live-recovery-shadow-1"
  });
}

function claimJob(store: Store, runId: number, workerId: string): ClaimedCollectJob {
  store.pushJob("data_source_sync", runId, businessDate, orgId);
  const job = store.claimNextJob(workerId, 60_000);
  assert(job !== null, `Could not claim recovery shadow job ${runId}`);
  return job;
}

function parseCheckpoint(value: string | null | undefined): Record<string, unknown> {
  const parsed = value ? JSON.parse(value) as unknown : null;
  assert(typeof parsed === "object" && parsed !== null && !Array.isArray(parsed), "Missing recovery checkpoint");
  return parsed as Record<string, unknown>;
}

function countLatest(db: DatabaseSync): number {
  return Number((db.prepare("SELECT COUNT(*) AS count FROM sp_api_inventory_latest WHERE status = 'success'").get() as { count: number }).count);
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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
  console.error(`[sp-api-recovery-shadow] failed: ${message}`);
  process.exitCode = 1;
});
