import type { Express, Request } from "express";
import type { SessionContext } from "@amazon-monitor/shared";
import { z } from "zod";
import { analyzeListing, generateDailyBrief } from "../services/ai-agent-service.js";
import { analyzeAds } from "../services/ads-agent-service.js";
import { analyzeReviewVoc } from "../services/review-voc-agent-service.js";
import type { Store } from "../store.js";
import { asyncHandler, getDate, optionalString } from "./http-utils.js";
import { validateBody } from "./validation.js";

const dailyBriefSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const listingAnalysisSchema = z.object({
  productId: z.number().int().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const adsAnalysisSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const reviewVocAnalysisSchema = z.object({
  productId: z.number().int().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
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
    throw Object.assign(new Error("Forbidden: only operator or admin can run AI Agents"), { statusCode: 403 });
  }
}

export function registerAiRoutes(app: Express, store: Store): void {
  app.post("/api/ai/daily-brief", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const body = validateBody(dailyBriefSchema, request.body ?? {});
    const query = validateBody(dailyBriefSchema, { date: optionalString(request.query.date) });
    const date = body.date ?? query.date ?? getDate(request);
    response.status(201).json(generateDailyBrief(store, {
      date,
      orgId: ctx.organization.id
    }));
  }));

  app.post("/api/ai/analyze-listing", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const body = validateBody(listingAnalysisSchema, request.body ?? {});
    response.status(201).json(analyzeListing(store, {
      productId: body.productId,
      orgId: ctx.organization.id,
      date: body.date ?? getDate(request)
    }));
  }));

  app.post("/api/ai/analyze-ads", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const body = validateBody(adsAnalysisSchema, request.body ?? {});
    const query = validateBody(adsAnalysisSchema, { date: optionalString(request.query.date) });
    response.status(201).json(analyzeAds(store, {
      orgId: ctx.organization.id,
      date: body.date ?? query.date ?? getDate(request)
    }));
  }));

  app.post("/api/ai/analyze-review-voc", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const body = validateBody(reviewVocAnalysisSchema, request.body ?? {});
    response.status(201).json(analyzeReviewVoc(store, {
      productId: body.productId,
      orgId: ctx.organization.id,
      date: body.date ?? getDate(request)
    }));
  }));
}
