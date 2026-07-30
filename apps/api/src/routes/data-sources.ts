import type { Express, Request, Response } from "express";
import {
  dataSourceStatuses,
  dataSourceMappingIssueStatuses,
  dataSourceMappingIssueTypes,
  dataSourceSyncRunStatuses,
  dataSourceSyncStatuses,
  dataSourceTypes,
  hasBusinessCapability,
  spApiRegions,
  spApiSyncDomains,
  type DataSourceConfig,
  type DataSourceImportPayload,
  type DataSourceMappingIssueStatus,
  type DataSourceMappingIssueType,
  type DataSourceStatus,
  type DataSourceType,
  type SpApiConnectionHealth,
  type SpApiSyncDomain,
  type SpApiRegion,
  type SessionContext
} from "@amazon-monitor/shared";
import { z } from "zod";
import type { Store } from "../store.js";
import { importDataSourceAds } from "../services/data-source-ads-import.js";
import { importDataSourceCosts } from "../services/data-source-cost-import.js";
import { runDataSourceFileImport } from "../services/data-source-import-runner.js";
import { importDataSourceInventory } from "../services/data-source-inventory-import.js";
import { importDataSourceProducts } from "../services/data-source-product-import.js";
import { encryptSpApiCredentials } from "../services/sp-api-credentials.js";
import { spApiLwaTokenCache } from "../services/sp-api-lwa-client.js";
import { asyncHandler } from "./http-utils.js";
import { validateBody, validateIdParam, validateQuery } from "./validation.js";

const dataSourceTypeSchema = z.enum(dataSourceTypes);
const dataSourceStatusSchema = z.enum(dataSourceStatuses);
const dataSourceSyncStatusSchema = z.enum(dataSourceSyncStatuses);
const spApiRegionSchema = z.enum(spApiRegions);
const mappingIssueStatusSchema = z.enum(dataSourceMappingIssueStatuses);
const mappingIssueTypeSchema = z.enum(dataSourceMappingIssueTypes);
const spApiSyncDomainSchema = z.enum(spApiSyncDomains);

const dataSourceListQuerySchema = z.object({
  sourceType: dataSourceTypeSchema.optional(),
  status: dataSourceStatusSchema.optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const dataSourceCreateSchema = z.object({
  name: z.string().min(1).max(200),
  sourceType: dataSourceTypeSchema,
  marketplace: z.string().max(100).nullable().optional(),
  status: dataSourceStatusSchema.optional(),
  syncStatus: dataSourceSyncStatusSchema.optional(),
  lastSyncedAt: z.string().max(80).nullable().optional(),
  lastSuccessAt: z.string().max(80).nullable().optional(),
  syncError: z.string().max(1000).nullable().optional(),
  ownerId: z.number().int().min(1).nullable().optional(),
  notes: z.string().max(2000).nullable().optional()
});

const dataSourceUpdateSchema = dataSourceCreateSchema.partial();
const dataSourceImportSchema = z.union([
  z.object({ csv: z.string().min(1).max(1_000_000) }),
  z.object({ format: z.literal("csv"), content: z.string().min(1).max(1_000_000) }),
  z.object({
    format: z.literal("xlsx"),
    contentBase64: z.string().min(1).max(7_000_000),
    fileName: z.string().max(255).optional()
  })
]);
const syncRunListQuerySchema = z.object({
  status: z.enum(dataSourceSyncRunStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional()
});
const spApiCredentialsSchema = z.object({
  region: spApiRegionSchema,
  commerceStoreIds: z.array(z.number().int().min(1)).min(1).max(100)
    .refine((value) => new Set(value).size === value.length, "commerceStoreIds must not contain duplicates"),
  lwaClientId: z.string().trim().min(3).max(500),
  lwaClientSecret: z.string().min(8).max(2_000),
  lwaRefreshToken: z.string().min(8).max(4_000)
});
const spApiSyncRequestSchema = z.object({
  domains: z.array(spApiSyncDomainSchema).min(1).max(2)
    .refine((value) => new Set(value).size === value.length, "domains must not contain duplicates"),
  mode: z.enum(["incremental", "full", "backfill"]),
  marketplaces: z.array(z.string().trim().min(1).max(20)).min(1).max(20)
    .refine((value) => new Set(value.map((item) => item.toUpperCase())).size === value.length, "marketplaces must not contain duplicates")
    .optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});
const mappingIssueListQuerySchema = z.object({
  status: mappingIssueStatusSchema.optional(),
  domain: spApiSyncDomainSchema.optional(),
  marketplace: z.string().trim().min(1).max(100).optional(),
  issueType: mappingIssueTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(1_000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});
const mappingIssueUpdateSchema = z.object({
  status: mappingIssueStatusSchema,
  productId: z.number().int().min(1).nullable().optional(),
  note: z.string().trim().min(1).max(2_000).nullable().optional()
});

type SpApiSyncRequest = z.infer<typeof spApiSyncRequestSchema>;

function requireSessionContext(request: Request): SessionContext {
  const ctx = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!ctx) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  return ctx;
}

function requireDataSourceManagement(ctx: SessionContext): void {
  if (!hasBusinessCapability(ctx.user.role, "manage_data_sources")) {
    throw Object.assign(new Error("Forbidden: role cannot manage data sources"), { statusCode: 403 });
  }
}

function requireCollectionManagement(ctx: SessionContext): void {
  if (!hasBusinessCapability(ctx.user.role, "manage_collection")) {
    throw Object.assign(new Error("Forbidden: role cannot manage collection"), { statusCode: 403 });
  }
}

export function registerDataSourceRoutes(app: Express, store: Store): void {
  app.get("/api/data-sources", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(dataSourceListQuerySchema, request.query);
    response.json(store.listDataSources({
      orgId: ctx.organization.id,
      sourceType: query.sourceType as DataSourceType | undefined,
      status: query.status as DataSourceStatus | undefined,
      q: query.q,
      limit: query.limit,
      offset: query.offset
    }));
  }));

  app.post("/api/data-sources", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireDataSourceManagement(ctx);
    const data = validateBody(dataSourceCreateSchema, request.body);
    ensureOwnerInOrg(store, data.ownerId ?? undefined, ctx.organization.id);
    try {
      const item = store.createDataSource({
        orgId: ctx.organization.id,
        name: data.name,
        sourceType: data.sourceType,
        marketplace: emptyToNull(data.marketplace),
        status: data.status,
        syncStatus: data.syncStatus,
        lastSyncedAt: data.lastSyncedAt ?? null,
        lastSuccessAt: data.lastSuccessAt ?? null,
        syncError: data.syncError ?? null,
        ownerId: data.ownerId ?? null,
        notes: emptyToNull(data.notes)
      });
      response.status(201).json(item);
    } catch (error) {
      if ((error as Error).message.includes("UNIQUE")) {
        response.status(409).json({ message: "Data source name already exists in this organization" });
        return;
      }
      throw error;
    }
  }));

  app.post("/api/data-sources/:id/import/products", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireDataSourceManagement(ctx);
    const id = validateIdParam(request.params.id);
    const source = getRunnableFileSource(store, id, ctx.organization.id, response);
    if (!source) return;
    const input = normalizeImportPayload(validateBody(dataSourceImportSchema, request.body));
    response.json(await runDataSourceFileImport(
      store,
      source,
      ctx.user.id,
      input.format === "xlsx" ? "product_excel_import" : "product_csv_import",
      () => importDataSourceProducts(store, source, input)
    ));
  }));

  app.post("/api/data-sources/:id/import/ads", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireDataSourceManagement(ctx);
    const id = validateIdParam(request.params.id);
    const source = getRunnableFileSource(store, id, ctx.organization.id, response);
    if (!source) return;
    const input = normalizeImportPayload(validateBody(dataSourceImportSchema, request.body));
    response.json(await runDataSourceFileImport(
      store,
      source,
      ctx.user.id,
      input.format === "xlsx" ? "ads_excel_import" : "ads_csv_import",
      () => importDataSourceAds(store, source, input)
    ));
  }));

  app.post("/api/data-sources/:id/import/costs", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireDataSourceManagement(ctx);
    const id = validateIdParam(request.params.id);
    const source = getRunnableFileSource(store, id, ctx.organization.id, response);
    if (!source) return;
    const input = normalizeImportPayload(validateBody(dataSourceImportSchema, request.body));
    response.json(await runDataSourceFileImport(
      store,
      source,
      ctx.user.id,
      input.format === "xlsx" ? "cost_excel_import" : "cost_csv_import",
      () => importDataSourceCosts(store, source, input)
    ));
  }));

  app.post("/api/data-sources/:id/import/inventory", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireDataSourceManagement(ctx);
    const id = validateIdParam(request.params.id);
    const source = getRunnableFileSource(store, id, ctx.organization.id, response);
    if (!source) return;
    const input = normalizeImportPayload(validateBody(dataSourceImportSchema, request.body));
    response.json(await runDataSourceFileImport(
      store,
      source,
      ctx.user.id,
      input.format === "xlsx" ? "inventory_excel_import" : "inventory_csv_import",
      () => importDataSourceInventory(store, source, input)
    ));
  }));

  app.post("/api/data-sources/:id/sp-api/credentials", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireDataSourceManagement(ctx);
    const id = validateIdParam(request.params.id);
    const source = getSpApiSource(store, id, ctx.organization.id, response);
    if (!source) return;
    if (!isSpApiConnectorEnabled()) {
      response.status(409).json({ message: "SP-API connector is disabled" });
      return;
    }
    const input = validateBody(spApiCredentialsSchema, request.body);
    validateSpApiConnectionStores(store, input.commerceStoreIds, ctx.organization.id, input.region);
    const connection = store.replaceSpApiConnection({
      orgId: ctx.organization.id,
      dataSourceId: source.id,
      region: input.region,
      commerceStoreIds: input.commerceStoreIds,
      encryptedCredentials: encryptSpApiCredentials({
        lwaClientId: input.lwaClientId,
        lwaClientSecret: input.lwaClientSecret,
        lwaRefreshToken: input.lwaRefreshToken
      }, { orgId: ctx.organization.id, dataSourceId: source.id })
    });
    spApiLwaTokenCache.clearDataSource(connection.dataSourceId);
    store.updateDataSource(source.id, {
      status: "not_connected",
      syncStatus: "manual",
      syncError: null
    });
    response.status(204).end();
  }));

  app.post("/api/data-sources/:id/test-connection", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireDataSourceManagement(ctx);
    const id = validateIdParam(request.params.id);
    const source = getSpApiSource(store, id, ctx.organization.id, response);
    if (!source) return;
    if (!isSpApiConnectorEnabled()) {
      response.status(409).json({ message: "SP-API connector is disabled" });
      return;
    }
    if (source.status === "disabled") {
      response.status(409).json({ message: "Disabled SP-API data sources cannot be tested" });
      return;
    }
    const connection = store.getSpApiConnection(source.id, ctx.organization.id);
    if (!connection) {
      response.status(409).json({ message: "SP-API credentials are not configured" });
      return;
    }
    const run = store.createDataSourceSyncRun({
      orgId: ctx.organization.id,
      dataSourceId: source.id,
      operation: "sp_api_connection_test",
      trigger: "manual",
      credentialVersion: connection.credentialVersion,
      idempotencyKey: connectionTestIdempotencyKey(source.id, connection.credentialVersion),
      marketplaces: source.marketplace ? [source.marketplace] : [],
      initiatedById: ctx.user.id
    });
    store.pushJob("data_source_sync", run.id, todayIso(), ctx.organization.id);
    store.updateDataSource(source.id, { syncStatus: "pending", syncError: null });
    response.status(202).json({ runId: run.id, status: run.status });
  }));

  app.post("/api/data-sources/:id/sync", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireCollectionManagement(ctx);
    const id = validateIdParam(request.params.id);
    const source = getSpApiSource(store, id, ctx.organization.id, response);
    if (!source) return;
    if (!isSpApiConnectorEnabled()) {
      response.status(409).json({ message: "SP-API connector is disabled" });
      return;
    }
    if (source.status === "disabled") {
      response.status(409).json({ message: "Disabled SP-API data sources cannot be synchronized" });
      return;
    }
    const connection = store.getSpApiConnection(source.id, ctx.organization.id);
    if (!connection) {
      response.status(409).json({ message: "SP-API credentials are not configured" });
      return;
    }
    const input = validateBody(spApiSyncRequestSchema, request.body);
    validateSyncRequest(input);
    const linkedMarkets = resolveLinkedMarkets(store, connection.linkedStoreIds, ctx.organization.id, input.marketplaces);
    if (linkedMarkets.length === 0) {
      throw Object.assign(new Error("No linked commerce store matches the requested marketplaces"), { statusCode: 400 });
    }
    const triggerWindow = syncTriggerWindow(input.mode);
    const runs = linkedMarkets.flatMap((market) => input.domains.map((domain) => {
      const window = syncWindowForDomain(domain, input.mode, market.code, input.fromDate, input.toDate);
      const run = store.createDataSourceSyncRun({
        orgId: ctx.organization.id,
        dataSourceId: source.id,
        operation: syncOperationFor(domain, input.mode),
        domain,
        trigger: "manual",
        mode: input.mode,
        credentialVersion: connection.credentialVersion,
        idempotencyKey: `${source.id}:${domain}:${market.code}:${window.fromDate ?? "current"}:${window.toDate ?? "current"}:${input.mode}:${triggerWindow}`,
        marketplaces: [market.code],
        requestedFromDate: window.fromDate,
        requestedToDate: window.toDate,
        initiatedById: ctx.user.id
      });
      store.pushJob("data_source_sync", run.id, window.toDate ?? todayIso(), ctx.organization.id);
      return run;
    }));
    store.updateDataSource(source.id, { syncStatus: "pending", syncError: null });
    response.status(202).json({ runs });
  }));

  app.get("/api/data-sources/:id/mapping-issues", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    if (!getSpApiSource(store, id, ctx.organization.id, response)) return;
    const query = validateQuery(mappingIssueListQuerySchema, request.query);
    response.json(store.listDataSourceMappingIssues({
      orgId: ctx.organization.id,
      dataSourceId: id,
      status: query.status as DataSourceMappingIssueStatus | undefined,
      domain: query.domain as SpApiSyncDomain | undefined,
      marketplace: query.marketplace,
      issueType: query.issueType as DataSourceMappingIssueType | undefined,
      limit: query.limit,
      offset: query.offset
    }));
  }));

  app.patch("/api/data-sources/:id/mapping-issues/:issueId", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireDataSourceManagement(ctx);
    const id = validateIdParam(request.params.id);
    if (!getSpApiSource(store, id, ctx.organization.id, response)) return;
    const issueId = validateIdParam(request.params.issueId);
    const issue = store.getDataSourceMappingIssue(issueId, ctx.organization.id, id);
    if (!issue) {
      response.status(404).json({ message: "Mapping issue not found" });
      return;
    }
    const input = validateBody(mappingIssueUpdateSchema, request.body);
    if (input.status === "resolved") {
      if (!input.productId) {
        throw Object.assign(new Error("productId is required when resolving a mapping issue"), { statusCode: 400 });
      }
      const product = store.getProduct(input.productId);
      if (!product || product.orgId !== ctx.organization.id || product.storeId !== issue.commerceStoreId) {
        response.status(404).json({ message: "Owned product not found for this commerce store" });
        return;
      }
    }
    if (input.status === "ignored" && !input.note) {
      throw Object.assign(new Error("note is required when ignoring a mapping issue"), { statusCode: 400 });
    }
    const updated = store.updateDataSourceMappingIssue(issue.id, ctx.organization.id, id, {
      status: input.status,
      resolutionNote: input.note === undefined ? undefined : emptyToNull(input.note),
      resolvedProductId: input.status === "resolved" ? input.productId ?? null : null,
      resolvedById: input.status === "resolved" ? ctx.user.id : null
    });
    response.json(updated);
  }));

  app.get("/api/data-sources/:id/runs", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    const source = store.getDataSource(id);
    if (!source || source.orgId !== ctx.organization.id) {
      response.status(404).json({ message: "Data source not found" });
      return;
    }
    const query = validateQuery(syncRunListQuerySchema, request.query);
    response.json(store.listDataSourceSyncRuns({
      orgId: ctx.organization.id,
      dataSourceId: id,
      status: query.status,
      limit: query.limit,
      offset: query.offset
    }));
  }));

  app.get("/api/data-sources/:id/health", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    const source = store.getDataSource(id);
    if (!source || source.orgId !== ctx.organization.id) {
      response.status(404).json({ message: "Data source not found" });
      return;
    }
    if (source.sourceType !== "amazon_sp_api") {
      response.status(409).json({ message: "SP-API health is only available for Amazon SP-API data sources" });
      return;
    }
    response.json(buildSpApiConnectionHealth(
      source.id,
      source.status,
      store.getSpApiConnection(source.id, ctx.organization.id),
      store.countOpenDataSourceMappingIssues(source.id, ctx.organization.id),
      store.listDataSourceDomainHealth(source.id, ctx.organization.id)
    ));
  }));

  app.patch("/api/data-sources/:id", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireDataSourceManagement(ctx);
    const id = validateIdParam(request.params.id);
    const existing = store.getDataSource(id);
    if (!existing || existing.orgId !== ctx.organization.id) {
      response.status(404).json({ message: "Data source not found" });
      return;
    }
    const data = validateBody(dataSourceUpdateSchema, request.body);
    ensureOwnerInOrg(store, data.ownerId ?? undefined, ctx.organization.id);
    const updated = store.updateDataSource(id, {
      ...data,
      marketplace: data.marketplace !== undefined ? emptyToNull(data.marketplace) : undefined,
      notes: data.notes !== undefined ? emptyToNull(data.notes) : undefined,
      syncError: data.syncError !== undefined ? emptyToNull(data.syncError) : undefined
    });
    response.json(updated);
  }));
}

function getRunnableFileSource(
  store: Store,
  id: number,
  orgId: number,
  response: Response
): DataSourceConfig | null {
  const source = store.getDataSource(id);
  if (!source || source.orgId !== orgId) {
    response.status(404).json({ message: "Data source not found" });
    return null;
  }
  if (source.sourceType !== "csv_import") {
    response.status(409).json({ message: "File import requires a File Import data source" });
    return null;
  }
  if (source.status === "disabled") {
    response.status(409).json({ message: "Disabled data sources cannot run imports" });
    return null;
  }
  return source;
}

function buildSpApiConnectionHealth(
  dataSourceId: number,
  sourceStatus: DataSourceStatus,
  connection: { region: SpApiRegion; credentialsConfigured: boolean; linkedStoreIds: number[]; lastTestedAt: string | null } | null,
  mappingIssueCount: number,
  domains: SpApiConnectionHealth["domains"]
): SpApiConnectionHealth {
  const statuses = domains.map((item) => item.status);
  const status = sourceStatus === "disabled"
    ? "disabled"
    : statuses.includes("failed")
      ? "attention"
      : statuses.includes("partial") || statuses.includes("stale")
        ? "degraded"
        : statuses.includes("pending")
          ? "testing"
          : statuses.includes("success")
            ? "healthy"
            : "not_configured";
  return {
    dataSourceId,
    region: connection?.region ?? null,
    credentialsConfigured: connection?.credentialsConfigured ?? false,
    status,
    linkedStoreIds: connection?.linkedStoreIds ?? [...new Set(domains.map((item) => item.commerceStoreId))],
    lastTestedAt: connection?.lastTestedAt ?? null,
    mappingIssueCount,
    domains
  };
}

function getSpApiSource(
  store: Store,
  id: number,
  orgId: number,
  response: Response
): DataSourceConfig | null {
  const source = store.getDataSource(id);
  if (!source || source.orgId !== orgId) {
    response.status(404).json({ message: "Data source not found" });
    return null;
  }
  if (source.sourceType !== "amazon_sp_api") {
    response.status(409).json({ message: "SP-API credentials require an Amazon SP-API data source" });
    return null;
  }
  return source;
}

function validateSpApiConnectionStores(
  store: Store,
  commerceStoreIds: number[],
  orgId: number,
  region: SpApiRegion
): void {
  const stores = commerceStoreIds.map((id) => store.getCommerceStore(id));
  if (stores.some((item) => !item || item.orgId !== orgId)) {
    throw Object.assign(new Error("Commerce store not found"), { statusCode: 404 });
  }
  const resolvedStores = stores.filter((item): item is NonNullable<typeof item> => item !== null);
  if (new Set(resolvedStores.map((item) => item.sellerId)).size !== 1) {
    throw Object.assign(new Error("Linked commerce stores must share one seller"), { statusCode: 400 });
  }
  if (resolvedStores.some((item) => spApiRegionForMarketplace(item.marketplace) !== region)) {
    throw Object.assign(new Error("Commerce store marketplace does not match SP-API region"), { statusCode: 400 });
  }
}

function spApiRegionForMarketplace(marketplace: string): SpApiRegion | null {
  const normalized = marketplace.trim().toLowerCase().replace(/^www\./, "");
  if (normalized === "us" || normalized === "amazon.com") return "NA";
  if (normalized === "uk" || normalized === "gb" || normalized === "de" || normalized === "amazon.co.uk" || normalized === "amazon.de") return "EU";
  if (normalized === "jp" || normalized === "amazon.co.jp") return "FE";
  return null;
}

function validateSyncRequest(input: SpApiSyncRequest): void {
  const hasSales = input.domains.includes("sales_traffic");
  const hasInventory = input.domains.includes("fba_inventory");
  if (input.mode === "backfill" && (!hasSales || hasInventory)) {
    throw Object.assign(new Error("backfill mode is only available for Sales & Traffic"), { statusCode: 400 });
  }
  if (input.mode === "full" && (!hasInventory || hasSales)) {
    throw Object.assign(new Error("full mode is only available for FBA Inventory"), { statusCode: 400 });
  }
  if ((input.fromDate === undefined) !== (input.toDate === undefined)) {
    throw Object.assign(new Error("fromDate and toDate must be provided together"), { statusCode: 400 });
  }
  if (input.mode === "backfill" && (!input.fromDate || !input.toDate)) {
    throw Object.assign(new Error("Sales & Traffic backfill requires fromDate and toDate"), { statusCode: 400 });
  }
  if (input.fromDate && input.toDate) {
    const days = dateRangeDays(input.fromDate, input.toDate);
    if (days < 1 || days > 90) {
      throw Object.assign(new Error("Sales & Traffic sync date range must be between 1 and 90 days"), { statusCode: 400 });
    }
  }
}

function resolveLinkedMarkets(
  store: Store,
  linkedStoreIds: number[],
  orgId: number,
  requestedMarkets: string[] | undefined
): Array<{ commerceStoreId: number; code: string }> {
  const requested = requestedMarkets ? new Set(requestedMarkets.map((item) => item.toUpperCase())) : null;
  const markets = linkedStoreIds.flatMap((storeId) => {
    const commerceStore = store.getCommerceStore(storeId);
    if (!commerceStore || commerceStore.orgId !== orgId) return [];
    const code = marketplaceCode(commerceStore.marketplace);
    return code && (!requested || requested.has(code)) ? [{ commerceStoreId: commerceStore.id, code }] : [];
  });
  if (requested && markets.length !== requested.size) {
    throw Object.assign(new Error("One or more marketplaces are not linked to this SP-API connection"), { statusCode: 400 });
  }
  return markets;
}

function marketplaceCode(marketplace: string): string | null {
  const normalized = marketplace.trim().toLowerCase().replace(/^www\./, "");
  if (normalized === "us" || normalized === "amazon.com") return "US";
  if (normalized === "uk" || normalized === "gb" || normalized === "amazon.co.uk") return "UK";
  if (normalized === "de" || normalized === "amazon.de") return "DE";
  if (normalized === "jp" || normalized === "amazon.co.jp") return "JP";
  return null;
}

function syncWindowForDomain(
  domain: SpApiSyncDomain,
  mode: SpApiSyncRequest["mode"],
  marketplace: string,
  fromDate: string | undefined,
  toDate: string | undefined
): { fromDate: string | null; toDate: string | null } {
  if (domain === "fba_inventory") return { fromDate: null, toDate: null };
  if (mode === "backfill") return { fromDate: fromDate!, toDate: toDate! };
  const date = marketplaceBusinessDateOffset(marketplace, -1);
  return { fromDate: date, toDate: date };
}

function syncOperationFor(domain: SpApiSyncDomain, mode: SpApiSyncRequest["mode"]) {
  if (domain === "sales_traffic") {
    return mode === "backfill" ? "sp_api_sales_traffic_backfill" : "sp_api_sales_traffic_daily_sync";
  }
  return mode === "full" ? "sp_api_fba_inventory_full_reconcile" : "sp_api_fba_inventory_incremental_sync";
}

function syncTriggerWindow(mode: SpApiSyncRequest["mode"]): string {
  const now = new Date();
  if (mode === "incremental") {
    const minuteBucket = Math.floor(now.getUTCMinutes() / 30) * 30;
    return `${now.toISOString().slice(0, 13)}:${String(minuteBucket).padStart(2, "0")}`;
  }
  return now.toISOString().slice(0, 16);
}

function marketplaceBusinessDateOffset(marketplace: string, offsetDays: number): string {
  const timezone = marketplace === "US"
    ? "America/Los_Angeles"
    : marketplace === "UK"
      ? "Europe/London"
      : marketplace === "DE"
        ? "Europe/Berlin"
        : "Asia/Tokyo";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return date.toISOString().slice(0, 10);
}

function dateRangeDays(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00.000Z`);
  const to = Date.parse(`${toDate}T00:00:00.000Z`);
  return Number.isFinite(from) && Number.isFinite(to) ? Math.floor((to - from) / 86_400_000) + 1 : 0;
}

function isSpApiConnectorEnabled(): boolean {
  return process.env.SP_API_CONNECTOR_ENABLED === "true";
}

function connectionTestIdempotencyKey(dataSourceId: number, credentialVersion: number): string {
  const triggerWindow = new Date().toISOString().slice(0, 16);
  return `connection-test:${dataSourceId}:${credentialVersion}:${triggerWindow}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeImportPayload(
  input: { csv: string } | DataSourceImportPayload
): DataSourceImportPayload {
  return "csv" in input ? { format: "csv", content: input.csv } : input;
}

function ensureOwnerInOrg(store: Store, ownerId: number | undefined, orgId: number): void {
  if (ownerId === undefined) return;
  const owner = store.listUsers().find((user) => user.id === ownerId);
  if (!owner || owner.orgId !== orgId) {
    throw Object.assign(new Error("Owner not found"), { statusCode: 404 });
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
