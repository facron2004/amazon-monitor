import type { Express, Request, RequestHandler } from "express";
import type { SessionContext } from "@amazon-monitor/shared";
import type { AmazonSearchCollector } from "../amazon-collector.js";
import { ts } from "../log.js";
import { isoDate } from "../pipeline.js";
import type { Store } from "../store.js";
import { asyncHandler, getDate, optionalNumber, optionalString } from "./http-utils.js";
import {
  keywordInputSchema,
  keywordPatchSchema,
  keywordRankMatrixQuerySchema,
  validateBody,
  validateIdParam,
  validateQuery
} from "./validation.js";

function requireSessionContext(request: Request): SessionContext {
  const context = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!context) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  return context;
}

export function registerKeywordRoutes(app: Express, store: Store, options: { collector?: AmazonSearchCollector; collectLimiter?: RequestHandler } = {}): void {
  app.get("/api/keywords", (request, response) => {
    const context = requireSessionContext(request);
    response.json(store.listKeywords({ orgId: context.organization.id }));
  });

  app.post("/api/keywords", asyncHandler(async (request, response) => {
    const context = requireSessionContext(request);
    const data = validateBody(keywordInputSchema, request.body);
    response.status(201).json(
      store.createKeyword({
        orgId: context.organization.id,
        keyword: data.keyword,
        marketplace: data.marketplace,
        priority: data.priority ?? "C",
        zipCode: data.zipCode ?? null,
        language: data.language ?? "en_US",
        categoryTag: data.categoryTag ?? null,
        crawlPages: data.crawlPages ?? 3,
        status: data.status === "disabled" ? "disabled" : "enabled"
      })
    );
  }));

  app.get("/api/keywords/rank-matrix", asyncHandler(async (request, response) => {
    const context = requireSessionContext(request);
    const query = validateQuery(keywordRankMatrixQuerySchema, request.query);
    response.json(store.getKeywordRankMatrix(context.organization.id, query.date ?? isoDate()));
  }));

  const updateKeywordHandler = asyncHandler(async (request, response) => {
    const context = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    if (!store.getKeyword(id, context.organization.id)) {
      response.status(404).json({ message: "Keyword not found" });
      return;
    }
    const data = validateBody(keywordPatchSchema, request.body);
    response.json(
      store.updateKeyword(id, {
        keyword: data.keyword,
        marketplace: data.marketplace,
        priority: data.priority,
        zipCode: data.zipCode,
        language: data.language,
        categoryTag: data.categoryTag,
        crawlPages: data.crawlPages,
        status: data.status
      }, context.organization.id)
    );
  });

  app.patch("/api/keywords/:id", updateKeywordHandler);
  app.put("/api/keywords/:id", updateKeywordHandler);

  app.delete("/api/keywords/:id", asyncHandler(async (request, response) => {
    const context = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    if (!store.getKeyword(id, context.organization.id)) {
      response.status(404).json({ message: "Keyword not found" });
      return;
    }
    store.deleteKeyword(id, context.organization.id);
    response.status(204).end();
  }));

  const keywordDetailHandler = asyncHandler(async (request, response) => {
    const context = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    const detail = store.getKeywordDetail(id, getDate(request), context.organization.id);
    if (!detail.keyword) {
      response.status(404).json({ message: "Keyword not found" });
      return;
    }
    response.json(detail);
  });

  app.get("/api/keywords/:id/detail", keywordDetailHandler);
  app.get("/api/keywords/:id/history", keywordDetailHandler);

  const collectGuard: RequestHandler[] = options.collectLimiter ? [options.collectLimiter] : [];

  app.post("/api/collect/run", ...collectGuard, asyncHandler(async (request, response) => {
    const context = requireSessionContext(request);
    const date = optionalString(request.body?.date) ?? isoDate();
    if (request.body?.keywordId) {
      const keywordId = Number(request.body.keywordId);
      const keyword = store.getKeyword(keywordId, context.organization.id);
      if (!keyword) {
        response.status(404).json({ message: "Keyword not found" });
        return;
      }
      const job = store.pushJob("keyword", keywordId, date, context.organization.id);
      console.log(`[${ts()}] [API] Collect requested: keyword_id=${job.targetId}, date=${date}, job_id=${job.id}`);
      response.status(202).json(job);
      return;
    }
    const keywords = store.listKeywords({ orgId: context.organization.id, status: "enabled" });
    const jobs = keywords.map((k) => store.pushJob("keyword", k.id, date, context.organization.id));
    console.log(`[${ts()}] [API] Collect all requested: ${jobs.length} keyword jobs queued, date=${date}`);
    response.status(202).json(jobs);
  }));

  app.get("/api/snapshots", (request, response) => {
    const context = requireSessionContext(request);
    response.json(
      store.listSnapshots({
        orgId: context.organization.id,
        date: optionalString(request.query.date),
        keywordId: optionalNumber(request.query.keywordId),
        keyword: optionalString(request.query.keyword),
        limit: optionalNumber(request.query.limit),
        offset: optionalNumber(request.query.offset)
      })
    );
  });
}
