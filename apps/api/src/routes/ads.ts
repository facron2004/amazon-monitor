import type { Express, Request } from "express";
import type { AdsWorkflowLevel, SessionContext } from "@amazon-monitor/shared";
import { z } from "zod";
import type { Store } from "../store.js";
import { asyncHandler } from "./http-utils.js";
import { validateBody, validateQuery } from "./validation.js";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const productSyncStatusSchema = z.enum(["pending", "success", "partial", "failed", "manual"]);

const adsQuerySchema = z.object({
  date: isoDateSchema.optional(),
  productId: z.coerce.number().int().min(1).optional(),
  q: z.string().max(200).optional(),
  level: z.enum(["healthy", "watch", "risk", "scale"]).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const adMetricSchema = z.object({
  productId: z.number().int().min(1).nullable().optional(),
  date: isoDateSchema,
  campaignId: z.string().min(1).max(200),
  campaignName: z.string().min(1).max(300),
  adGroupName: z.string().max(300).nullable().optional(),
  targetText: z.string().max(500).nullable().optional(),
  searchTerm: z.string().max(500).nullable().optional(),
  matchType: z.string().max(80).nullable().optional(),
  impressions: z.number().int().min(0).nullable().optional(),
  clicks: z.number().int().min(0).nullable().optional(),
  spend: z.number().min(0).nullable().optional(),
  sales: z.number().min(0).nullable().optional(),
  orders: z.number().int().min(0).nullable().optional(),
  unitsSold: z.number().int().min(0).nullable().optional(),
  acos: z.number().min(0).nullable().optional(),
  roas: z.number().min(0).nullable().optional(),
  cpc: z.number().min(0).nullable().optional(),
  ctr: z.number().min(0).nullable().optional(),
  cvr: z.number().min(0).nullable().optional(),
  budget: z.number().min(0).nullable().optional(),
  budgetUsageRate: z.number().min(0).nullable().optional(),
  dataSource: z.string().max(80).optional(),
  lastSyncedAt: z.string().max(80).nullable().optional(),
  syncStatus: productSyncStatusSchema.optional(),
  syncError: z.string().max(1000).nullable().optional()
});

function requireSessionContext(request: Request): SessionContext {
  const ctx = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!ctx) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  return ctx;
}

function requireOperatorOrAdmin(ctx: SessionContext): void {
  if (ctx.user.role !== "admin" && ctx.user.role !== "operator") {
    throw Object.assign(new Error("Forbidden: only operator or admin can manage Ads metrics"), { statusCode: 403 });
  }
}

export function registerAdsRoutes(app: Express, store: Store): void {
  app.get("/api/ads/summary", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(adsQuerySchema, request.query);
    ensureProductInOrg(store, query.productId, ctx.organization.id);
    response.json(store.getAdsWorkflowSummary({
      orgId: ctx.organization.id,
      productId: query.productId,
      date: query.date,
      q: query.q,
      level: query.level as AdsWorkflowLevel | undefined,
      limit: query.limit,
      offset: query.offset
    }));
  }));

  app.get("/api/ads/metrics", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(adsQuerySchema.omit({ level: true }), request.query);
    ensureProductInOrg(store, query.productId, ctx.organization.id);
    response.json(store.listAdDailyMetrics({
      orgId: ctx.organization.id,
      productId: query.productId,
      date: query.date,
      q: query.q,
      limit: query.limit,
      offset: query.offset
    }));
  }));

  app.post("/api/ads/metrics", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const data = validateBody(adMetricSchema, request.body);
    ensureProductInOrg(store, data.productId ?? undefined, ctx.organization.id);
    const metric = store.upsertAdDailyMetric({
      orgId: ctx.organization.id,
      productId: data.productId ?? null,
      date: data.date,
      campaignId: data.campaignId,
      campaignName: data.campaignName,
      adGroupName: emptyToNull(data.adGroupName),
      targetText: emptyToNull(data.targetText),
      searchTerm: emptyToNull(data.searchTerm),
      matchType: emptyToNull(data.matchType),
      impressions: data.impressions ?? null,
      clicks: data.clicks ?? null,
      spend: data.spend ?? null,
      sales: data.sales ?? null,
      orders: data.orders ?? null,
      unitsSold: data.unitsSold ?? null,
      acos: data.acos ?? null,
      roas: data.roas ?? null,
      cpc: data.cpc ?? null,
      ctr: data.ctr ?? null,
      cvr: data.cvr ?? null,
      budget: data.budget ?? null,
      budgetUsageRate: data.budgetUsageRate ?? null,
      dataSource: data.dataSource,
      lastSyncedAt: data.lastSyncedAt ?? null,
      syncStatus: data.syncStatus,
      syncError: data.syncError ?? null
    });
    response.status(201).json(metric);
  }));
}

function ensureProductInOrg(store: Store, productId: number | undefined, orgId: number): void {
  if (productId === undefined) return;
  const product = store.getProduct(productId);
  if (!product || product.orgId !== orgId) {
    throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
