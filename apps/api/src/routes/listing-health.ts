import type { Express, Request } from "express";
import type { SessionContext } from "@amazon-monitor/shared";
import { z } from "zod";
import type { Store } from "../store.js";
import { asyncHandler } from "./http-utils.js";
import { validateBody, validateIdParam, validateQuery } from "./validation.js";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const stringArraySchema = z.array(z.string().max(1000)).max(50).optional();

const listingHealthQuerySchema = z.object({
  date: isoDateSchema.optional(),
  productId: z.coerce.number().int().min(1).optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const listingSnapshotSchema = z.object({
  date: isoDateSchema,
  title: z.string().min(1).max(500),
  bulletPoints: stringArraySchema,
  description: z.string().max(5000).nullable().optional(),
  imageUrls: stringArraySchema,
  coreKeywords: stringArraySchema,
  reviewHighlights: stringArraySchema,
  qaGaps: stringArraySchema,
  rawJson: z.string().max(30000).nullable().optional(),
  dataSource: z.string().max(80).optional(),
  lastSyncedAt: z.string().max(80).nullable().optional(),
  syncStatus: z.enum(["pending", "success", "partial", "failed", "manual"]).optional(),
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
    throw Object.assign(new Error("Forbidden: only operator or admin can manage Listing snapshots"), { statusCode: 403 });
  }
}

export function registerListingHealthRoutes(app: Express, store: Store): void {
  app.get("/api/listing-health", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(listingHealthQuerySchema, request.query);
    response.json(store.listProductListingHealth({
      orgId: ctx.organization.id,
      productId: query.productId,
      date: query.date,
      q: query.q,
      limit: query.limit,
      offset: query.offset
    }));
  }));

  app.get("/api/products/:id/listing-health", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    const query = validateQuery(listingHealthQuerySchema.pick({ date: true }), request.query);
    const item = store.getProductListingHealth(id, query.date);
    if (!item || item.orgId !== ctx.organization.id) {
      response.status(404).json({ message: "Listing health item not found" });
      return;
    }
    response.json(item);
  }));

  app.post("/api/products/:id/listing-snapshots", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    const product = store.getProduct(id);
    if (!product || product.orgId !== ctx.organization.id) {
      response.status(404).json({ message: "Product not found" });
      return;
    }
    const data = validateBody(listingSnapshotSchema, request.body);
    const snapshot = store.upsertProductListingSnapshot({
      productId: id,
      date: data.date,
      title: data.title,
      bulletPoints: cleanList(data.bulletPoints),
      description: data.description ?? null,
      imageUrls: cleanList(data.imageUrls),
      coreKeywords: cleanList(data.coreKeywords),
      reviewHighlights: cleanList(data.reviewHighlights),
      qaGaps: cleanList(data.qaGaps),
      rawJson: data.rawJson ?? null,
      dataSource: data.dataSource,
      lastSyncedAt: data.lastSyncedAt ?? null,
      syncStatus: data.syncStatus,
      syncError: data.syncError ?? null
    });
    response.status(201).json({
      snapshot,
      health: store.getProductListingHealth(id, data.date)
    });
  }));
}

function cleanList(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}
