import type { Express, Request } from "express";
import { aiActionFeedbackValues, aiAgentTypes, aiRunStatuses, hasBusinessCapability, type BusinessCapability, type SessionContext } from "@amazon-monitor/shared";
import { z } from "zod";
import { generateDailyBrief } from "../services/ai-agent-service.js";
import { analyzeListing } from "../services/listing-optimizer-agent-service.js";
import { analyzeAds } from "../services/ads-agent-service.js";
import { analyzeCompetitor } from "../services/competitor-agent-service.js";
import { createReportWithAgent } from "../services/report-writer-agent-service.js";
import { analyzeReviewVoc } from "../services/review-voc-agent-service.js";
import { researchProductOpportunity } from "../services/product-research-agent-service.js";
import { buildAiQuality } from "../services/ai-quality.js";
import { createProductLaunchValidationTasks } from "../services/product-launch-validation-tasks.js";
import type { Store } from "../store.js";
import { asyncHandler, getDate, optionalNumber, optionalString } from "./http-utils.js";
import { validateBody, validateIdParam, validateQuery } from "./validation.js";

const dailyBriefSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const listingAnalysisSchema = z.object({
  productId: z.number().int().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const competitorAnalysisSchema = z.object({
  eventId: z.string().min(1).max(500),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const adsAnalysisSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const reviewVocAnalysisSchema = z.object({
  productId: z.number().int().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const productResearchSchema = z.object({
  categoryId: z.number().int().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const reportWriterSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reportType: z.enum(["daily", "weekly", "monthly"]).default("daily")
});

const aiRunListQuerySchema = z.object({
  agentType: z.enum(aiAgentTypes).optional(),
  status: z.enum(aiRunStatuses).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional()
});

const aiActionFeedbackSchema = z.object({
  value: z.enum(aiActionFeedbackValues)
});

const aiQualityQuerySchema = z.object({
  days: z.number().int().refine(
    (value): value is 7 | 30 | 90 => value === 7 || value === 30 || value === 90,
    "days must be 7, 30, or 90"
  ).default(30)
});

function requireSessionContext(request: Request): SessionContext {
  const ctx = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!ctx) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  return ctx;
}

function requireCapability(ctx: SessionContext, capability: BusinessCapability, message: string): void {
  if (!hasBusinessCapability(ctx.user.role, capability)) {
    throw Object.assign(new Error(message), { statusCode: 403 });
  }
}

function requireAdsManagement(ctx: SessionContext): void {
  requireCapability(ctx, "manage_ads", "Forbidden: role cannot run Ads analysis");
}

export function registerAiRoutes(app: Express, store: Store): void {
  app.get("/api/ai/quality", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireCapability(ctx, "assign_tasks", "Forbidden: role cannot view Agent quality");
    const { days } = validateQuery(aiQualityQuerySchema, {
      days: optionalNumber(request.query.days)
    });
    const generatedAt = new Date().toISOString();
    const rangeEnd = generatedAt;
    const rangeStart = new Date(
      Date.parse(generatedAt) - days * 24 * 60 * 60 * 1000
    ).toISOString();
    const runs = [];
    const tasks = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const page = store.listAiRuns({
        orgId: ctx.organization.id,
        limit: pageSize,
        offset
      });
      runs.push(...page);
      if (page.length < pageSize) break;
    }
    for (let offset = 0; ; offset += pageSize) {
      const page = store.listTasks({
        orgId: ctx.organization.id,
        sourceType: "ai_run",
        limit: pageSize,
        offset
      });
      tasks.push(...page);
      if (page.length < pageSize) break;
    }
    const feedback = [];
    for (let index = 0; index < runs.length; index += 500) {
      feedback.push(...store.listAiActionFeedbackForRuns({
        orgId: ctx.organization.id,
        runIds: runs.slice(index, index + 500).map((run) => run.id)
      }));
    }
    response.json(buildAiQuality(runs, feedback, tasks, {
      windowDays: days,
      rangeStart,
      rangeEnd,
      generatedAt
    }));
  }));

  app.get("/api/ai/runs", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(aiRunListQuerySchema, {
      agentType: optionalString(request.query.agentType),
      status: optionalString(request.query.status),
      limit: optionalNumber(request.query.limit),
      offset: optionalNumber(request.query.offset)
    });
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const filter = {
      orgId: ctx.organization.id,
      agentType: query.agentType,
      status: query.status
    };
    const runs = store.listAiRuns({
      ...filter,
      limit,
      offset
    });
    const total = store.countAiRuns(filter);
    const feedback = store.listAiActionFeedback({
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      runIds: runs.map((run) => run.id)
    });
    const feedbackByRun = new Map<number, typeof feedback>();
    for (const item of feedback) {
      const items = feedbackByRun.get(item.runId) ?? [];
      items.push(item);
      feedbackByRun.set(item.runId, items);
    }
    response.json({
      runs: runs.map((run) => ({ ...run, actionFeedback: feedbackByRun.get(run.id) ?? [] })),
      total,
      limit,
      offset
    });
  }));

  app.put("/api/ai/runs/:id/actions/:actionIndex/feedback", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireCapability(ctx, "manage_workflow", "Forbidden: role cannot provide Agent feedback");
    const runId = validateIdParam(request.params.id);
    const actionIndex = Number(request.params.actionIndex);
    const run = store.getAiRun(runId, ctx.organization.id);
    if (!run) {
      response.status(404).json({ message: "AI run not found" });
      return;
    }
    if (!Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex >= (run.output?.recommended_actions.length ?? 0)) {
      response.status(400).json({ message: "Invalid AI action index" });
      return;
    }
    const body = validateBody(aiActionFeedbackSchema, request.body);
    response.json(store.upsertAiActionFeedback({
      runId,
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      actionIndex,
      value: body.value
    }));
  }));

  app.post("/api/ai/runs/:id/product-launch-brief/tasks", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireCapability(ctx, "manage_workflow", "Forbidden: role cannot create launch validation tasks");
    const runId = validateIdParam(request.params.id);
    const run = store.getAiRun(runId, ctx.organization.id);
    if (!run) {
      response.status(404).json({ message: "AI run not found" });
      return;
    }
    const result = createProductLaunchValidationTasks(store, {
      run,
      orgId: ctx.organization.id,
      userId: ctx.user.id
    });
    response.status(result.createdCount > 0 ? 201 : 200).json(result);
  }));

  app.post("/api/ai/daily-brief", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireCapability(ctx, "manage_workflow", "Forbidden: role cannot run workflow Agents");
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
    requireCapability(ctx, "manage_workflow", "Forbidden: role cannot run workflow Agents");
    const body = validateBody(listingAnalysisSchema, request.body ?? {});
    response.status(201).json(analyzeListing(store, {
      productId: body.productId,
      orgId: ctx.organization.id,
      date: body.date ?? getDate(request)
    }));
  }));

  app.post("/api/ai/analyze-competitor", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireCapability(ctx, "manage_competitors", "Forbidden: role cannot run competitor analysis");
    const body = validateBody(competitorAnalysisSchema, request.body ?? {});
    response.status(201).json(analyzeCompetitor(store, {
      eventId: body.eventId,
      orgId: ctx.organization.id,
      date: body.date ?? getDate(request)
    }));
  }));

  app.post("/api/ai/analyze-ads", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireAdsManagement(ctx);
    const body = validateBody(adsAnalysisSchema, request.body ?? {});
    const query = validateBody(adsAnalysisSchema, { date: optionalString(request.query.date) });
    response.status(201).json(analyzeAds(store, {
      orgId: ctx.organization.id,
      date: body.date ?? query.date ?? getDate(request)
    }));
  }));

  app.post("/api/ai/analyze-review-voc", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireCapability(ctx, "manage_workflow", "Forbidden: role cannot run workflow Agents");
    const body = validateBody(reviewVocAnalysisSchema, request.body ?? {});
    response.status(201).json(analyzeReviewVoc(store, {
      productId: body.productId,
      orgId: ctx.organization.id,
      date: body.date ?? getDate(request)
    }));
  }));

  app.post("/api/ai/research-product", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireCapability(ctx, "manage_competitors", "Forbidden: role cannot run product research");
    const body = validateBody(productResearchSchema, request.body ?? {});
    response.status(201).json(researchProductOpportunity(store, {
      categoryId: body.categoryId,
      orgId: ctx.organization.id,
      date: body.date ?? getDate(request)
    }));
  }));

  app.post("/api/ai/create-report", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireCapability(ctx, "manage_reports", "Forbidden: role cannot run Report Writer");
    const body = validateBody(reportWriterSchema, request.body ?? {});
    response.status(201).json(createReportWithAgent(store, {
      date: body.date ?? getDate(request),
      orgId: ctx.organization.id,
      reportType: body.reportType
    }));
  }));
}
