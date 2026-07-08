import type { Express, Request } from "express";
import type { SessionContext } from "@amazon-monitor/shared";
import { z } from "zod";
import type { Store } from "../store.js";
import { asyncHandler } from "./http-utils.js";
import { validateBody, validateIdParam, validateQuery } from "./validation.js";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const productSyncStatusSchema = z.enum(["pending", "success", "partial", "failed", "manual"]);
const sentimentSchema = z.enum(["positive", "neutral", "negative"]);

const reviewVocQuerySchema = z.object({
  date: isoDateSchema.optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const productReviewSchema = z.object({
  reviewDate: isoDateSchema,
  externalReviewId: z.string().max(200).nullable().optional(),
  rating: z.number().min(1).max(5),
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(5000),
  reviewerName: z.string().max(200).nullable().optional(),
  variant: z.string().max(300).nullable().optional(),
  verifiedPurchase: z.boolean().optional(),
  helpfulVotes: z.number().int().min(0).nullable().optional(),
  sentiment: sentimentSchema.nullable().optional(),
  topics: z.array(z.string().min(1).max(80)).max(20).optional(),
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
    throw Object.assign(new Error("Forbidden: only operator or admin can manage reviews"), { statusCode: 403 });
  }
}

export function registerReviewVocRoutes(app: Express, store: Store): void {
  app.get("/api/review-voc", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(reviewVocQuerySchema, request.query);
    response.json(store.listReviewVocSummaries({
      orgId: ctx.organization.id,
      date: query.date,
      startDate: query.startDate,
      endDate: query.endDate,
      q: query.q,
      limit: query.limit,
      offset: query.offset
    }));
  }));

  app.get("/api/products/:id/review-voc", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    const query = validateQuery(reviewVocQuerySchema.pick({ date: true, startDate: true, endDate: true }), request.query);
    const summary = store.getReviewVocSummary(id, {
      orgId: ctx.organization.id,
      date: query.date,
      startDate: query.startDate,
      endDate: query.endDate
    });
    if (!summary) {
      response.status(404).json({ message: "Review VOC summary not found" });
      return;
    }
    response.json(summary);
  }));

  app.get("/api/products/:id/reviews", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    ensureProductInOrg(store, id, ctx.organization.id);
    const query = validateQuery(reviewVocQuerySchema, request.query);
    response.json(store.listProductReviews({
      orgId: ctx.organization.id,
      productId: id,
      date: query.date,
      startDate: query.startDate,
      endDate: query.endDate,
      q: query.q,
      limit: query.limit,
      offset: query.offset
    }));
  }));

  app.post("/api/products/:id/reviews", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    ensureProductInOrg(store, id, ctx.organization.id);
    const data = validateBody(productReviewSchema, request.body);
    const review = store.upsertProductReview({
      productId: id,
      reviewDate: data.reviewDate,
      externalReviewId: emptyToNull(data.externalReviewId),
      rating: data.rating,
      title: data.title.trim(),
      body: data.body.trim(),
      reviewerName: emptyToNull(data.reviewerName),
      variant: emptyToNull(data.variant),
      verifiedPurchase: data.verifiedPurchase ?? false,
      helpfulVotes: data.helpfulVotes ?? null,
      sentiment: data.sentiment ?? null,
      topics: cleanList(data.topics),
      dataSource: data.dataSource,
      lastSyncedAt: data.lastSyncedAt ?? null,
      syncStatus: data.syncStatus,
      syncError: data.syncError ?? null
    });
    response.status(201).json({
      review,
      summary: store.getReviewVocSummary(id, { orgId: ctx.organization.id, date: data.reviewDate })
    });
  }));
}

function ensureProductInOrg(store: Store, productId: number, orgId: number): void {
  const product = store.getProduct(productId);
  if (!product || product.orgId !== orgId) {
    throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  }
}

function cleanList(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
