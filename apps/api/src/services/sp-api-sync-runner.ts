import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ClaimedCollectJob, Store } from "../store.js";
import type { SpApiConnectionCredentials } from "../store/data-source-sp-api-store.js";
import type { DataSourceSyncRun } from "@amazon-monitor/shared";
import { decryptSpApiCredentials } from "./sp-api-credentials.js";
import type { SpApiCredentials } from "./sp-api-credentials.js";
import {
  isSupportedMarketplaceCode,
  SpApiClient,
  type SpApiFbaInventoryPage,
  type SupportedMarketplaceCode
} from "./sp-api-client.js";
import { SpApiConnectorError, toSpApiConnectorError } from "./sp-api-errors.js";
import { isSpApiConnectorEnabled } from "./sp-api-feature-flag.js";
import {
  promoteInventoryFixture,
  promoteSalesTrafficFixture,
  type SpApiFixtureSyncResult
} from "./sp-api-fixture-sync.js";
import { spApiLwaTokenCache } from "./sp-api-lwa-client.js";
import type { CollectJobResult } from "../worker-types.js";

export async function runSpApiSyncJob(
  store: Store,
  job: ClaimedCollectJob,
  options?: { signal?: AbortSignal }
): Promise<CollectJobResult> {
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
    if (!isSpApiConnectorEnabled()) {
      throw new SpApiConnectorError("connector_disabled", "SP-API connector is disabled", false);
    }
    if (source.status === "disabled") {
      throw new SpApiConnectorError("credentials_invalid", "SP-API data source is disabled", false);
    }
    sourceName = source.name;
    marketplace = source.marketplace;
    const errorMessage = run.operation === "sp_api_connection_test"
      ? await runConnectionTest(store, source.id, job.orgId, run, ensureActive, job.retryCount)
      : await runDataSync(store, source.id, job.orgId, run, ensureActive, job.retryCount);
    return writeTaskLog(store, job, taskType, sourceName, marketplace, startedAt, "success", errorMessage);
  } catch (error) {
    if (options?.signal?.aborted || !store.isJobLeaseActive(job.id, job.leaseOwner, job.leaseToken)) {
      throw error;
    }
    const connectorError = toSpApiConnectorError(error);
    if (runId !== null) {
      store.finishDataSourceSyncRun(runId, failedRun(connectorError, job.retryCount + 1));
    }
    const run = runId === null ? null : store.getDataSourceSyncRun(runId, job.orgId);
    if (run) {
      const source = store.getDataSource(run.dataSourceId);
      if (source?.orgId === job.orgId) {
        if (connectorError.category === "connector_disabled") {
          store.updateDataSource(source.id, { syncStatus: "manual", syncError: null });
        } else {
          store.updateDataSource(source.id, {
            status: "attention",
            syncStatus: "failed",
            syncError: connectorError.message
          });
        }
      }
    }
    return writeTaskLog(
      store,
      job,
      taskType,
      sourceName,
      marketplace,
      startedAt,
      "failed",
      connectorError.message,
      connectorError.retryable,
      connectorError.retryAfterMs
    );
  }
}

async function runConnectionTest(
  store: Store,
  dataSourceId: number,
  orgId: number,
  run: DataSourceSyncRun,
  ensureActive: () => void,
  retryCount: number
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
  const client = new SpApiClient({
    region: stored.region,
    accessToken: token.accessToken,
    onUnauthorized: () => refreshSpApiAccessToken(stored, credentials)
  });
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
  store.finishDataSourceSyncRun(run.id, successfulRun(retryCount));
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
  ensureActive: () => void,
  retryCount: number
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
  const liveFba = run.domain === "fba_inventory" && !isFixtureSyncEnabled();
  const checkpoint = liveFba ? parseFbaCheckpoint(run) : null;
  const fbaAccumulator = liveFba ? fbaAccumulatorFrom(checkpoint) : null;
  const fbaStartDateTime = liveFba
    ? checkpoint?.startDateTime ?? resolveFbaStartDateTime(store, dataSourceId, orgId, run, commerceStoreId, marketplace)
    : undefined;
  if (liveFba && !checkpoint) {
    ensureActive();
    if (!store.setDataSourceSyncRunCheckpoint(run.id, orgId, JSON.stringify({
      version: 1,
      startDateTime: fbaStartDateTime ?? null,
      nextToken: null,
      pagesCompleted: 0,
      rowsSeen: 0,
      importedRows: 0,
      createdRecords: 0,
      updatedRecords: 0,
      unmappedRows: 0,
      completed: false
    }))) {
      throw new SpApiConnectorError("database_failed", "FBA sync checkpoint could not be initialized", true);
    }
  }
  const document = checkpoint?.completed
    ? { id: `fba-inventory:${run.id}:completed`, value: { payload: { inventorySummaries: [] } } }
    : await loadSyncDocument(
      store,
      dataSourceId,
      orgId,
      run,
      marketplace,
      commerceStoreId,
      ensureActive,
      fbaAccumulator
        ? {
          fbaNextToken: checkpoint?.nextToken,
          fbaPageNumberOffset: checkpoint?.pagesCompleted,
          fbaStartDateTime,
          onFbaPage: async (page, context) => {
            let pageResult: SpApiFixtureSyncResult | undefined;
            store.runInTransaction(() => {
              pageResult = promoteInventoryFixture(store, {
                orgId,
                dataSourceId,
                syncRunId: run.id,
                commerceStoreId,
                marketplace,
                document: { payload: { inventorySummaries: page.inventorySummaries } },
                documentId: `fba-inventory:${run.id}:page:${page.pageNumber}`,
                ensureActive
              });
              ensureActive();
              if (!store.setDataSourceSyncRunCheckpoint(run.id, orgId, JSON.stringify({
                version: 1,
                startDateTime: context.startDateTime,
                nextToken: page.nextToken,
                pagesCompleted: page.pageNumber,
                rowsSeen: fbaAccumulator.rowsSeen + pageResult.totalRows,
                importedRows: fbaAccumulator.importedRows + pageResult.importedRows,
                createdRecords: fbaAccumulator.createdRecords + pageResult.createdRecords,
                updatedRecords: fbaAccumulator.updatedRecords + pageResult.updatedRecords,
                unmappedRows: fbaAccumulator.unmappedRows + pageResult.unmappedRows,
                completed: page.nextToken === null
              }))) {
                throw new SpApiConnectorError("database_failed", "FBA page checkpoint could not be persisted", true);
              }
            }, ensureActive);
            if (!pageResult) {
              throw new SpApiConnectorError("database_failed", "FBA page promotion did not complete", true);
            }
            addFbaPromotion(fbaAccumulator, pageResult);
          }
        }
        : undefined
    );
  ensureActive();
  const result = fbaAccumulator
    ?? (run.domain === "sales_traffic"
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
      }));
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
    errorCode: partial ? "mapping_blocked" : null,
    errorSummary: partial ? `${result.unmappedRows} row(s) require product mapping` : null,
    retryCount
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

interface SyncDocumentLoadOptions {
  fbaNextToken?: string | null;
  fbaPageNumberOffset?: number;
  fbaStartDateTime?: string | null;
  onFbaPage?: (
    page: SpApiFbaInventoryPage,
    context: { startDateTime: string | null }
  ) => Promise<void> | void;
}

interface FbaSyncCheckpoint {
  version: 1;
  startDateTime: string | null;
  nextToken: string | null;
  pagesCompleted: number;
  rowsSeen: number;
  importedRows: number;
  createdRecords: number;
  updatedRecords: number;
  unmappedRows: number;
  completed: boolean;
}

interface FbaPromotionAccumulator extends SpApiFixtureSyncResult {
  rowsSeen: number;
}

function fbaAccumulatorFrom(checkpoint: FbaSyncCheckpoint | null): FbaPromotionAccumulator {
  return {
    totalRows: checkpoint?.rowsSeen ?? 0,
    importedRows: checkpoint?.importedRows ?? 0,
    createdRecords: checkpoint?.createdRecords ?? 0,
    updatedRecords: checkpoint?.updatedRecords ?? 0,
    unmappedRows: checkpoint?.unmappedRows ?? 0,
    rowsSeen: checkpoint?.rowsSeen ?? 0
  };
}

function addFbaPromotion(accumulator: FbaPromotionAccumulator, result: SpApiFixtureSyncResult): void {
  accumulator.rowsSeen += result.totalRows;
  accumulator.totalRows += result.totalRows;
  accumulator.importedRows += result.importedRows;
  accumulator.createdRecords += result.createdRecords;
  accumulator.updatedRecords += result.updatedRecords;
  accumulator.unmappedRows += result.unmappedRows;
}

function parseFbaCheckpoint(run: DataSourceSyncRun): FbaSyncCheckpoint | null {
  if (!run.checkpointSummary) return null;
  try {
    const value: unknown = JSON.parse(run.checkpointSummary);
    if (!isRecord(value) || value.version !== 1) return null;
    const pagesCompleted = nonNegativeInteger(value.pagesCompleted);
    const rowsSeen = nonNegativeInteger(value.rowsSeen);
    const importedRows = nonNegativeInteger(value.importedRows);
    const createdRecords = nonNegativeInteger(value.createdRecords);
    const updatedRecords = nonNegativeInteger(value.updatedRecords);
    const unmappedRows = nonNegativeInteger(value.unmappedRows);
    if ([pagesCompleted, rowsSeen, importedRows, createdRecords, updatedRecords, unmappedRows].some(Number.isNaN)) {
      return null;
    }
    const nextToken = nullableText(value.nextToken);
    const completed = value.completed === true;
    if (completed && nextToken !== null) return null;
    return {
      version: 1,
      startDateTime: nullableText(value.startDateTime),
      nextToken,
      pagesCompleted,
      rowsSeen,
      importedRows,
      createdRecords,
      updatedRecords,
      unmappedRows,
      completed
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : NaN;
}

async function loadSyncDocument(
  store: Store,
  dataSourceId: number,
  orgId: number,
  run: DataSourceSyncRun,
  marketplace: string,
  commerceStoreId: number,
  ensureActive: () => void,
  options?: SyncDocumentLoadOptions
): Promise<{ id: string; value: unknown }> {
  const fixtureDirectory = process.env.SP_API_SYNC_FIXTURE_DIR?.trim();
  if (isFixtureSyncEnabled() && fixtureDirectory) {
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
  const client = new SpApiClient({
    region: stored.region,
    accessToken: token.accessToken,
    onUnauthorized: () => refreshSpApiAccessToken(stored, credentials)
  });
  if (run.domain === "sales_traffic") {
    return loadSalesTrafficDocument(store, client, run, orgId, marketplace, ensureActive);
  }
  const startDateTime = resolveFbaStartDateTime(
    store,
    dataSourceId,
    orgId,
    run,
    commerceStoreId,
    marketplace,
    options?.fbaStartDateTime
  );
  const value = await client.listFbaInventorySummaries({
    marketplace,
    startDateTime,
    fullReconcile: run.mode === "full",
    nextToken: options?.fbaNextToken,
    pageNumberOffset: options?.fbaPageNumberOffset,
    onPage: options?.onFbaPage
      ? (page) => options.onFbaPage?.(page, { startDateTime })
      : undefined
  });
  return { id: `fba-inventory:${new Date().toISOString()}`, value };
}

function resolveFbaStartDateTime(
  store: Store,
  dataSourceId: number,
  orgId: number,
  run: DataSourceSyncRun,
  commerceStoreId: number,
  marketplace: string,
  override?: string | null
): string | null {
  if (run.mode === "full") return null;
  if (override !== undefined) return override;
  const previous = store.listDataSourceDomainHealth(dataSourceId, orgId).find((health) => (
    health.commerceStoreId === commerceStoreId
    && health.marketplace === marketplace
    && health.domain === "fba_inventory"
  ));
  return previous?.lastSuccessAt ?? new Date(Date.now() - 30 * 60_000).toISOString();
}

async function refreshSpApiAccessToken(
  stored: SpApiConnectionCredentials,
  credentials: SpApiCredentials
): Promise<string> {
  spApiLwaTokenCache.clearDataSource(stored.dataSourceId);
  const token = await spApiLwaTokenCache.get({
    dataSourceId: stored.dataSourceId,
    credentialVersion: stored.credentialVersion,
    region: stored.region,
    credentials
  });
  return token.accessToken;
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

function isFixtureSyncEnabled(): boolean {
  return Boolean(process.env.SP_API_SYNC_FIXTURE_DIR?.trim() && process.env.NODE_ENV !== "production");
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

function successfulRun(retryCount: number) {
  return {
    status: "success" as const,
    totalRows: 0,
    importedRows: 0,
    failedRows: 0,
    createdRecords: 0,
    updatedRecords: 0,
    errorCode: null,
    errorSummary: null,
    retryCount
  };
}

function failedRun(error: SpApiConnectorError, retryCount: number) {
  return {
    status: "failed" as const,
    totalRows: 0,
    importedRows: 0,
    failedRows: 0,
    createdRecords: 0,
    updatedRecords: 0,
    errorCode: error.category,
    errorSummary: error.message,
    retryCount
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
  errorMessage: string | null,
  retryable?: boolean,
  retryAfterMs?: number
): CollectJobResult {
  const log = store.insertTaskLog({
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
  if (retryable === undefined && retryAfterMs === undefined) return log;
  return { ...log, retryable, retryAfterMs };
}
