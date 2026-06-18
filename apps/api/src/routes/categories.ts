import type { Express, RequestHandler } from "express";
import { runCategoryCollectionForAll, runCategoryCollectionForMonitor, type AmazonBestSellerCollector } from "../category-pipeline.js";
import { ts } from "../log.js";
import { isoDate } from "../pipeline.js";
import type { Store } from "../store.js";
import { asyncHandler, getDate, optionalString } from "./http-utils.js";
import { categoryInputSchema, categoryPatchSchema, categorySignalQuerySchema, validateBody, validateIdParam, validateQuery } from "./validation.js";

export function registerCategoryRoutes(app: Express, store: Store, options: { categoryCollector?: AmazonBestSellerCollector; collectLimiter?: RequestHandler } = {}): void {
  const collectGuard: RequestHandler[] = options.collectLimiter ? [options.collectLimiter] : [];

  app.get("/api/categories", (_request, response) => {
    response.json(store.listCategoryMonitors());
  });

  app.post("/api/categories", asyncHandler(async (request, response) => {
    const data = validateBody(categoryInputSchema, request.body);
    response.status(201).json(
      store.createCategoryMonitor({
        name: data.name,
        marketplace: data.marketplace,
        categoryUrl: data.categoryUrl,
        categoryPath: data.categoryPath ?? null,
        crawlTopN: data.crawlTopN ?? 100,
        status: data.status === "disabled" ? "disabled" : "enabled"
      })
    );
  }));

  app.post("/api/categories/collect/run", ...collectGuard, asyncHandler(async (request, response) => {
    const date = optionalString(request.body?.date) ?? isoDate();
    const categories = store.listCategoryMonitors().filter((category) => category.status === "enabled");
    const jobs = categories.map((c) => store.pushJob("category", c.id, date));
    console.log(`[${ts()}] [API] Category collect all requested: ${jobs.length} category jobs queued, date=${date}`);
    response.status(202).json(jobs);
  }));

  app.patch("/api/categories/:id", asyncHandler(async (request, response) => {
    const id = validateIdParam(request.params.id);
    const data = validateBody(categoryPatchSchema, request.body);
    response.json(
      store.updateCategoryMonitor(id, {
        name: data.name,
        marketplace: data.marketplace,
        categoryUrl: data.categoryUrl,
        categoryPath: data.categoryPath,
        crawlTopN: data.crawlTopN,
        status: data.status
      })
    );
  }));

  app.delete("/api/categories/:id", asyncHandler(async (request, response) => {
    const id = validateIdParam(request.params.id);
    store.deleteCategoryMonitor(id);
    response.status(204).end();
  }));

  app.post("/api/categories/:id/collect", ...collectGuard, asyncHandler(async (request, response) => {
    const id = validateIdParam(request.params.id);
    const date = optionalString(request.body?.date) ?? isoDate();
    const job = store.pushJob("category", id, date);
    console.log(`[${ts()}] [API] Category collect requested: category_id=${id}, date=${date}, job_id=${job.id}`);
    response.status(202).json(job);
  }));

  app.get("/api/categories/:id/detail", asyncHandler(async (request, response) => {
    const id = validateIdParam(request.params.id);
    response.json(store.getCategoryDetail(id, getDate(request)));
  }));

  app.get("/api/category-signals", (request, response) => {
    const query = validateQuery(categorySignalQuerySchema, request.query);
    response.json(
      store.listCategorySignals({
        date: query.date,
        categoryId: query.categoryId,
        limit: query.limit,
        offset: query.offset
      })
    );
  });
}
