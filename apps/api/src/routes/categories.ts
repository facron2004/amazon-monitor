import type { Express, RequestHandler } from "express";
import { runCategoryCollectionForAll, runCategoryCollectionForMonitor, type AmazonBestSellerCollector } from "../category-pipeline.js";
import { ts } from "../log.js";
import { isoDate } from "../pipeline.js";
import type { Store } from "../store.js";
import { asyncHandler, getDate, optionalNumber, optionalString } from "./http-utils.js";
import { validateIdParam } from "./validation.js";

export function registerCategoryRoutes(app: Express, store: Store, options: { categoryCollector?: AmazonBestSellerCollector; collectLimiter?: RequestHandler } = {}): void {
  const collectGuard: RequestHandler[] = options.collectLimiter ? [options.collectLimiter] : [];

  app.get("/api/categories", (_request, response) => {
    response.json(store.listCategoryMonitors());
  });

  app.post("/api/categories", asyncHandler(async (request, response) => {
    const body = request.body ?? {};
    response.status(201).json(
      store.createCategoryMonitor({
        name: String(body.name ?? ""),
        marketplace: String(body.marketplace ?? "amazon.com"),
        categoryUrl: String(body.categoryUrl ?? ""),
        categoryPath: optionalString(body.categoryPath) ?? null,
        crawlTopN: body.crawlTopN === undefined ? 100 : Number(body.crawlTopN),
        status: body.status === "disabled" ? "disabled" : "enabled"
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
    response.json(
      store.updateCategoryMonitor(id, {
        name: request.body.name,
        marketplace: request.body.marketplace,
        categoryUrl: request.body.categoryUrl,
        categoryPath: request.body.categoryPath,
        crawlTopN: request.body.crawlTopN === undefined ? undefined : Number(request.body.crawlTopN),
        status: request.body.status
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
    response.json(
      store.listCategorySignals({
        date: optionalString(request.query.date),
        categoryId: optionalNumber(request.query.categoryId),
        limit: optionalNumber(request.query.limit),
        offset: optionalNumber(request.query.offset)
      })
    );
  });
}
