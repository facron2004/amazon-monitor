import type { Express, RequestHandler } from "express";
import type { AmazonSearchCollector } from "../amazon-collector.js";
import { ts } from "../log.js";
import { isoDate, runCollectionForAll, runCollectionForKeyword } from "../pipeline.js";
import type { Store } from "../store.js";
import { asyncHandler, getDate, optionalNumber, optionalString } from "./http-utils.js";
import { keywordInputSchema, keywordPatchSchema, validateBody, validateIdParam } from "./validation.js";

export function registerKeywordRoutes(app: Express, store: Store, options: { collector?: AmazonSearchCollector; collectLimiter?: RequestHandler } = {}): void {
  app.get("/api/keywords", (_request, response) => {
    response.json(store.listKeywords());
  });

  app.post("/api/keywords", asyncHandler(async (request, response) => {
    const data = validateBody(keywordInputSchema, request.body);
    response.status(201).json(
      store.createKeyword({
        keyword: data.keyword,
        marketplace: data.marketplace,
        zipCode: data.zipCode ?? null,
        language: data.language ?? "en_US",
        categoryTag: data.categoryTag ?? null,
        crawlPages: data.crawlPages ?? 3,
        status: data.status === "disabled" ? "disabled" : "enabled"
      })
    );
  }));

  app.patch("/api/keywords/:id", asyncHandler(async (request, response) => {
    const id = validateIdParam(request.params.id);
    const data = validateBody(keywordPatchSchema, request.body);
    response.json(
      store.updateKeyword(id, {
        keyword: data.keyword,
        marketplace: data.marketplace,
        zipCode: data.zipCode,
        language: data.language,
        categoryTag: data.categoryTag,
        crawlPages: data.crawlPages,
        status: data.status
      })
    );
  }));

  app.delete("/api/keywords/:id", asyncHandler(async (request, response) => {
    const id = validateIdParam(request.params.id);
    store.deleteKeyword(id);
    response.status(204).end();
  }));

  app.get("/api/keywords/:id/detail", asyncHandler(async (request, response) => {
    const id = validateIdParam(request.params.id);
    response.json(store.getKeywordDetail(id, getDate(request)));
  }));

  const collectGuard: RequestHandler[] = options.collectLimiter ? [options.collectLimiter] : [];

  app.post("/api/collect/run", ...collectGuard, asyncHandler(async (request, response) => {
    const date = optionalString(request.body?.date) ?? isoDate();
    if (request.body?.keywordId) {
      const job = store.pushJob("keyword", Number(request.body.keywordId), date);
      console.log(`[${ts()}] [API] Collect requested: keyword_id=${job.targetId}, date=${date}, job_id=${job.id}`);
      response.status(202).json(job);
      return;
    }
    const keywords = store.listKeywords().filter((keyword) => keyword.status === "enabled");
    const jobs = keywords.map((k) => store.pushJob("keyword", k.id, date));
    console.log(`[${ts()}] [API] Collect all requested: ${jobs.length} keyword jobs queued, date=${date}`);
    response.status(202).json(jobs);
  }));

  app.get("/api/snapshots", (request, response) => {
    response.json(
      store.listSnapshots({
        date: optionalString(request.query.date),
        keywordId: optionalNumber(request.query.keywordId),
        keyword: optionalString(request.query.keyword),
        limit: optionalNumber(request.query.limit),
        offset: optionalNumber(request.query.offset)
      })
    );
  });
}
