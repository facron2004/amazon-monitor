import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ClaimedCollectJob, Store } from "../store.js";
import type { CollectTaskLog, DataSourceSyncRun } from "@amazon-monitor/shared";
import { decryptSpApiCredentials } from "./sp-api-credentials.js";
import { isSupportedMarketplaceCode, SpApiClient, type SupportedMarketplaceCode } from "./sp-api-client.js";
import { SpApiConnectorError, toSpApiConnectorError } from "./sp-api-errors.js";
import { promoteInventoryFixture, promoteSalesTrafficFixture } from "./sp-api-fixture-sync.js";
import { spApiLwaTokenCache } from "./sp-api-lwa-client.js";

export async function runSpApiSyncJob(
  store: Store,
  job: ClaimedCollectJob,
  options?: { signal?: AbortSignal }
): Promise<CollectTaskLog> {
  const ensureActive = () => {
    if (options?.signal?.aborted || !store.isJobLeaseActive(job.id, job.leaseOwner, job.leaseToken)) {
      throw new DOMException("SP-API job lease is no longer active", "AbortError");
    }
  };
  const startedAt = new Date().toISOString();
  let sourceName = "SP-API";
  let marketplace: string | null = null;
  let runId: number | null = null;
  let taskType = "sp_api_connection_test";

  try {
    ensureActive();
    const run = store.getDataSourceSyncRun(job.targetId, job.orgId);
    if (!run) throw new SpApiConnectorError("unknown", "SP-API sync run was not found", false);
    runId = run.id;
    taskType = run.operation;
    const source = store.getDataSource(run.dataSourceId);
    if (!source || source.orgId !== job.orgId || source.sourceType !== "amazon_sp_api") {
      throw new SpApiConnectorError("unknown", "SP-API data source was not found", false);
    }
    if (source.status === "disabled") {
      throw new SpApiConnectorError("credentials_invalid", "SP-API data source is disabled", false);
    }
    sourceName = source.name;
    marketplace = source.marketplace;
    const errorMessage = run.operation === "sp_api_connection_test"
      ? await runConnectionTest(store, source.id, job.orgId, run, ensureActive)
      : await runDataSync(store, source.id, job.orgId, run, ensureActive);
    return writeTaskLog(store, job, taskType, sourceName, marketplace, startedAt, "success", errorMessage);
  } catch (error) {
    if (options?.signal?.aborted || !store.isJobLeaseActive(job.id, job.leaseOwner, job.leaseToken)) {
      throw error;
    }
    const connectorError = toSpApiConnectorError(error);
    if (runId !== null) {
      store.finishDataSourceSyncRun(runId, failedRun(connectorError));
    }
    const run = runId === null ? null : store.getDataSourceSyncRun(runId, job.orgId);
    if (run) {
      const source = store.getDataSource(run.dataSourceId);
      if (source?.orgId === job.orgId) {
        store.updateDataSource(source.id, {
          status: "attention",
          syncStatus: "failed",
          syncError: connectorError.message
        });
      }
    }
    return writeTaskLog(store, job, taskType, sourceName, marketplace, startedAt, "failed", connectorError.message);
  }
}

async function runConnectionTest(
  store: Store,
  dataSourceId: number,
  orgId: number,
  run: DataSourceSyncRun,
  ensureActive: () => void
): Promise<null> {
  const connection = store.getSpApiConnection(dataSourceId, orgId);
  if (!connection) throw new SpApiConnectorError("credentials_invalid", "SP-API credentials are not configured", false);
  const stored = store.getSpApiConnectionCredentials(dataSourceId, orgId);
  if (!stored) throw new SpApiConnectorError("credentials_invalid", "SP-API credentials are not configured", false);
  if (run.credentialVersion !== stored.credentialVersion) {
    throw new SpApiConnectorError("credentials_invalid", "SP-API credentials changed before this run started", false);
  }
  const credentials = decryptSpApiCredentials(stored, { orgId, dataSourceId });
  const token = await spApiLwaTokenCache.get({
    dataSourceId,
    credentialVersion: stored.credentialVersion,
    region: stored.region,
    credentials
  });
  const commerceStoreId = connection.linkedStoreIds[0];
  const commerceStore = commerceStoreId ? store.getCommerceStore(commerceStoreId) : null;
  const marketplace = commerceStore ? marketplaceCode(commerceStore.marketplace) : null;
  if (!commerceStore || !marketplace || !isSupportedMarketplaceCode(marketplace)) {
    throw new SpApiConnectorError("marketplace_mismatch", "SP-API connection has no supported linked marketplace", false);
  }
  const client = new SpApiClient({ region: stored.region, accessToken: token.accessToken });
  const salesDate = marketplaceBusinessDateOffset(marketplace, -1);
  const [salesResult, inventoryResult] = await Promise.allSettled([
    client.createSalesTrafficReport({ marketplace, fromDate: salesDate, toDate: salesDate }),
    client.listFbaInventorySummaries({ marketplace, startDateTime: new Date().toISOString() })
  ]);
  ensureActive();
  const now = new Date().toISOString();
  recordConnectionDomainHealth(store, {
    orgId,
    dataSourceId,
    commerceStoreId,
    marketplace,
    domain: "sales_traffic",
    result: salesResult,
    now
  });
  recordConnectionDomainHealth(store, {
    orgId,
    dataSourceId,
    commerceStoreId,
    marketplace,
    domain: "fba_inventory",
    result: inventoryResult,
    now
  });
  const failure = firstConnectionFailure(salesResult, inventoryResult);
  if (failure) throw failure;
  store.markSpApiConnectionTested(dataSourceId, orgId);
  store.finishDataSourceSyncRun(run.id, successfulRun());
  store.updateDataSource(dataSourceId, {
    status: "connected",
    syncStatus: "manual",
    syncError: null
  });
  return null;
}

function recordConnectionDomainHealth(
  store: Store,
  input: {
    orgId: number;
    dataSourceId: number;
    commerceStoreId: number;
    marketplace: SupportedMarketplaceCode;
    domain: "sales_traffic" | "fba_inventory";
    result: PromiseSettledResult<unknown>;
    now: string;
  }
): void {
  const failure = input.result.status === "rejected" ? toSpApiConnectorError(input.result.reason) : null;
  store.upsertDataSourceDomainHealth({
    orgId: input.orgId,
    dataSourceId: input.dataSourceId,
    commerceStoreId: input.commerceStoreId,
    marketplace: input.marketplace,
    domain: input.domain,
    status: failure ? "failed" : "success",
    lastAttemptAt: input.now,
    lastSuccessAt: failure ? null : input.now,
    errorCode: failure?.category ?? null,
    errorMessage: failure?.message ?? null
  });
}

function firstConnectionFailure(...results: PromiseSettledResult<unknown>[]): SpApiConnectorError | null {
  const failed = results.find((result) => result.status === "rejected");
  return failed?.status === "rejected" ? toSpApiConnectorError(failed.reason) : null;
}

async function runDataSync(
  store: Store,
  dataSourceId: number,
  orgId: number,
  run: DataSourceSyncRun,
  ensureActive: () => void
): Promise<string | null> {
  const connection = store.getSpApiConnection(dataSourceId, orgId);
  if (!connection || run.credentialVersion !== connection.credentialVersion) {
    throw new SpApiConnectorError("credentials_invalid", "SP-API credentials changed before this run started", false);
  }
  const marketplace = run.marketplaces[0];
  if (!marketplace) throw new SpApiConnectorError("marketplace_mismatch", "SP-API sync run has no marketplace", false);
  const commerceStoreId = connection.linkedStoreIds.find((storeId) => {
    const commerceStore = store.getCommerceStore(storeId);
    return commerceStore && marketplaceCode(commerceStore.marketplace) === marketplace;
  });
  if (!commerceStoreId) {
    throw new SpApiConnectorError("marketplace_mismatch", "SP-API marketplace is not linked to this connection", false);
  }
  const document = await loadSyncDocument(store, dataSourceId, orgId, run, marketplace, commerceStoreId, ensureActive);
  ensureActive();
  const result = run.domain === "sales_traffic"
    ? promoteSalesTrafficFixture(store, {
      orgId,
      dataSourceId,
      syncRunId: run.id,
      commerceStoreId,
      marketplace,
      document: document.value,
      documentId: document.id,
      ensureActive
    })
    : promoteInventoryFixture(store, {
      orgId,
      dataSourceId,
      syncRunId: run.id,
      commerceStoreId,
      marketplace,
      document: document.value,
      documentId: document.id,
      ensureActive
    });
  const now = new Date().toISOString();
  const partial = result.unmappedRows > 0;
  ensureActive();
  store.finishDataSourceSyncRun(run.id, {
    status: partial ? "partial" : "success",
    totalRows: result.totalRows,
    importedRows: result.importedRows,
    failedRows: result.unmappedRows,
    createdRecords: result.createdRecords,
    updatedRecords: result.updatedRecords,
    errorSummary: partial ? `${result.unmappedRows} row(s) require product mapping` : null
  });
  store.upsertDataSourceDomainHealth({
    orgId,
    dataSourceId,
    commerceStoreId,
    marketplace,
    domain: run.domain ?? domainForOperation(run),
    status: partial ? "partial" : "success",
    lastAttemptAt: now,
    lastSuccessAt: now,
    errorCode: partial ? "mapping_blocked" : null,
    errorMessage: partial ? `${result.unmappedRows} row(s) require product mapping` : null
  });
  store.updateDataSource(dataSourceId, {
    status: partial ? "attention" : "connected",
    syncStatus: partial ? "partial" : "success",
    lastSyncedAt: now,
    lastSuccessAt: now,
    syncError: partial ? `${result.unmappedRows} row(s) require product mapping` : null
  });
  return partial ? `${result.unmappedRows} row(s) require product mapping` : null;
}

async function loadSyncDocument(
  store: Store,
  dataSourceId: number,
  orgId: number,
  run: DataSourceSyncRun,
  marketplace: string,
  commerceStoreId: number,
  ensureActive: () => void
): Promise<{ id: string; value: unknown }> {
  const fixtureDirectory = process.env.SP_API_SYNC_FIXTURE_DIR?.trim();
  if (fixtureDirectory && process.env.NODE_ENV !== "production") {
    const fixtureName = fixtureNameFor(run);
    return { id: fixtureName, value: readFixture(join(fixtureDirectory, fixtureName)) };
  }
  if (!isSupportedMarketplaceCode(marketplace)) {
    throw new SpApiConnectorError("marketplace_mismatch", "SP-API marketplace is unsupported", false);
  }
  const stored = store.getSpApiConnectionCredentials(dataSourceId, orgId);
  if (!stored || stored.credentialVersion !== run.credentialVersion) {
    throw new SpApiConnectorError("credentials_invalid", "SP-API credentials changed before this run started", false);
  }
  const credentials = decryptSpApiCredentials(stored, { orgId, dataSourceId });
  const token = await spApiLwaTokenCache.get({
    dataSourceId,
    credentialVersion: stored.credentialVersion,
    region: stored.region,
    credentials
  });
  ensureActive();
  const client = new SpApiClient({ region: stored.region, accessToken: token.accessToken });
  if (run.domain === "sales_traffic") {
    return loadSalesTrafficDocument(store, client, run, orgId, marketplace, ensureActive);
  }
  const previous = store.listDataSourceDomainHealth(dataSourceId, orgId).find((health) => (
    health.commerceStoreId === commerceStoreId
    && health.marketplace === marketplace
    && health.domain === "fba_inventory"
  ));
  const startDateTime = run.mode === "full"
    ? null
    : previous?.lastSuccessAt ?? new Date(Date.now() - 30 * 60_000).toISOString();
  const value = await client.listFbaInventorySummaries({
    marketplace,
    startDateTime,
    fullReconcile: run.mode === "full"
  });
  return { id: `fba-inventory:${new Date().toISOString()}`, value };
}

async function loadSalesTrafficDocument(
  store: Store,
  client: SpApiClient,
  run: DataSourceSyncRun,
  orgId: number,
  marketplace: SupportedMarketplaceCode,
  ensureActive: () => void
): Promise<{ id: string; value: unknown }> {
  const fromDate = run.requestedFromDate;
  const toDate = run.requestedToDate;
  if (!fromDate || !toDate) {
    throw new SpApiConnectorError("schema_invalid", "Sales & Traffic sync run has no date window", false);
  }
  let reportId = run.externalRequestId;
  if (!reportId) {
    reportId = await client.createSalesTrafficReport({ marketplace, fromDate, toDate });
    ensureActive();
    if (!store.setDataSourceSyncRunExternalRequest(run.id, orgId, reportId)) {
      throw new SpApiConnectorError("database_failed", "SP-API report request could not be checkpointed", true);
    }
  }
  const status = await client.getReportStatus(reportId);
  ensureActive();
  if (status.processingStatus === "DONE" && status.reportDocumentId) {
    return { id: `report:${reportId}:${status.reportDocumentId}`, value: await client.downloadJsonReportDocument(status.reportDocumentId) };
  }
  if (status.processingStatus === "CANCELLED") {
    throw new SpApiConnectorError("report_cancelled", "SP-API Sales & Traffic report was cancelled", false);
  }
  if (status.processingStatus === "FATAL") {
    throw new SpApiConnectorError("report_fatal", "SP-API Sales & Traffic report failed", false);
  }
  throw new SpApiConnectorError("unknown", "SP-API Sales & Traffic report is still processing", true);
}

function fixtureNameFor(run: DataSourceSyncRun): string {
  if (run.domain === "sales_traffic") return "sp-api-sales-traffic.single-day.json";
  if (run.domain === "fba_inventory") return "sp-api-inventory.page.json";
  throw new SpApiConnectorError("unknown", "SP-API sync run has no supported domain", false);
}

function domainForOperation(run: DataSourceSyncRun): "sales_traffic" | "fba_inventory" {
  if (run.operation === "sp_api_sales_traffic_daily_sync" || run.operation === "sp_api_sales_traffic_backfill") {
    return "sales_traffic";
  }
  return "fba_inventory";
}

function readFixture(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new SpApiConnectorError("schema_invalid", "Configured SP-API fixture could not be read", false);
  }
}

function marketplaceCode(marketplace: string): string | null {
  const normalized = marketplace.trim().toLowerCase().replace(/^www\./, "");
  if (normalized === "us" || normalized === "amazon.com") return "US";
  if (normalized === "uk" || normalized === "gb" || normalized === "amazon.co.uk") return "UK";
  if (normalized === "de" || normalized === "amazon.de") return "DE";
  if (normalized === "jp" || normalized === "amazon.co.jp") return "JP";
  return null;
}

function marketplaceBusinessDateOffset(marketplace: SupportedMarketplaceCode, offsetDays: number): string {
  const timeZone = marketplace === "US"
    ? "America/Los_Angeles"
    : marketplace === "UK"
      ? "Europe/London"
      : marketplace === "DE"
        ? "Europe/Berlin"
        : "Asia/Tokyo";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}

function successfulRun() {
  return {
    status: "success" as const,
    totalRows: 0,
    importedRows: 0,
    failedRows: 0,
    createdRecords: 0,
    updatedRecords: 0,
    errorSummary: null
  };
}

function failedRun(error: SpApiConnectorError) {
  return {
    status: "failed" as const,
    totalRows: 0,
    importedRows: 0,
    failedRows: 0,
    createdRecords: 0,
    updatedRecords: 0,
    errorSummary: error.message
  };
}

function writeTaskLog(
  store: Store,
  job: ClaimedCollectJob,
  taskType: string,
  sourceName: string,
  marketplace: string | null,
  startedAt: string,
  status: "success" | "failed",
  errorMessage: string | null
): CollectTaskLog {
  return store.insertTaskLog({
    orgId: job.orgId,
    taskType,
    keywordId: null,
    keyword: sourceName,
    marketplace,
    status,
    startTime: startedAt,
    endTime: new Date().toISOString(),
    pageCount: 0,
    successCount: status === "success" ? 1 : 0,
    failCount: status === "failed" ? 1 : 0,
    errorMessage,
    retryCount: job.retryCount
  });
}
