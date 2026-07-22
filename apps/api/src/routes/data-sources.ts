import type { Express, Request, Response } from "express";
import {
  dataSourceStatuses,
  dataSourceSyncRunStatuses,
  dataSourceSyncStatuses,
  dataSourceTypes,
  hasBusinessCapability,
  type DataSourceConfig,
  type DataSourceImportPayload,
  type DataSourceStatus,
  type DataSourceType,
  type SessionContext
} from "@amazon-monitor/shared";
import { z } from "zod";
import type { Store } from "../store.js";
import { importDataSourceAds } from "../services/data-source-ads-import.js";
import { importDataSourceCosts } from "../services/data-source-cost-import.js";
import { runDataSourceFileImport } from "../services/data-source-import-runner.js";
import { importDataSourceInventory } from "../services/data-source-inventory-import.js";
import { importDataSourceProducts } from "../services/data-source-product-import.js";
import { asyncHandler } from "./http-utils.js";
import { validateBody, validateIdParam, validateQuery } from "./validation.js";

const dataSourceTypeSchema = z.enum(dataSourceTypes);
const dataSourceStatusSchema = z.enum(dataSourceStatuses);
const dataSourceSyncStatusSchema = z.enum(dataSourceSyncStatuses);

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
