import type { Express, Request, RequestHandler } from "express";
import type { SessionContext } from "@amazon-monitor/shared";
import type { AmazonBestSellerCollector } from "../category-pipeline.js";
import { ts } from "../log.js";
import { isoDate } from "../pipeline.js";
import type { Store } from "../store.js";
import { asyncHandler, getDate, optionalString } from "./http-utils.js";
import {
  categoryDiffQuerySchema,
  categoryInputSchema,
  categoryPatchSchema,
  categorySignalQuerySchema,
  validateBody,
  validateIdParam,
  validateQuery
} from "./validation.js";

export function registerCategoryRoutes(app: Express, store: Store, options: { categoryCollector?: AmazonBestSellerCollector; collectLimiter?: RequestHandler } = {}): void {
  const collectGuard: RequestHandler[] = options.collectLimiter ? [options.collectLimiter] : [];

  app.get("/api/categories", (request, response) => {
    response.json(store.listCategoryMonitors({ orgId: sessionOrganizationId(request) }));
  });

  app.post("/api/categories", asyncHandler(async (request, response) => {
    const organizationId = sessionOrganizationId(request);
    const data = validateBody(categoryInputSchema, request.body);
    response.status(201).json(
      store.createCategoryMonitor({
        orgId: organizationId,
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
    const organizationId = sessionOrganizationId(request);
    const date = optionalString(request.body?.date) ?? isoDate();
    const categories = store.listCategoryMonitors({ orgId: organizationId, status: "enabled" });
    const jobs = categories.map((c) => store.pushJob("category", c.id, date, organizationId));
    console.log(`[${ts()}] [API] Category collect all requested: ${jobs.length} category jobs queued, date=${date}`);
    response.status(202).json(jobs);
  }));

  app.patch("/api/categories/:id", asyncHandler(async (request, response) => {
    const organizationId = sessionOrganizationId(request);
    const id = validateIdParam(request.params.id);
    if (!store.getCategoryMonitor(id, organizationId)) {
      response.status(404).json({ message: "Category not found" });
      return;
    }
    const data = validateBody(categoryPatchSchema, request.body);
    response.json(
      store.updateCategoryMonitor(id, {
        name: data.name,
        marketplace: data.marketplace,
        categoryUrl: data.categoryUrl,
        categoryPath: data.categoryPath,
        crawlTopN: data.crawlTopN,
        status: data.status
      }, organizationId)
    );
  }));

  app.delete("/api/categories/:id", asyncHandler(async (request, response) => {
    const organizationId = sessionOrganizationId(request);
    const id = validateIdParam(request.params.id);
    if (!store.getCategoryMonitor(id, organizationId)) {
      response.status(404).json({ message: "Category not found" });
      return;
    }
    store.deleteCategoryMonitor(id, organizationId);
    response.status(204).end();
  }));

  app.post("/api/categories/:id/collect", ...collectGuard, asyncHandler(async (request, response) => {
    const organizationId = sessionOrganizationId(request);
    const id = validateIdParam(request.params.id);
    if (!store.getCategoryMonitor(id, organizationId)) {
      response.status(404).json({ message: "Category not found" });
      return;
    }
    const date = optionalString(request.body?.date) ?? isoDate();
    const job = store.pushJob("category", id, date, organizationId);
    console.log(`[${ts()}] [API] Category collect requested: category_id=${id}, date=${date}, job_id=${job.id}`);
    response.status(202).json(job);
  }));

  app.get("/api/categories/:id/detail", asyncHandler(async (request, response) => {
    const organizationId = sessionOrganizationId(request);
    const id = validateIdParam(request.params.id);
    const detail = store.getCategoryDetail(id, getDate(request), organizationId);
    if (!detail.category) {
      response.status(404).json({ message: "Category not found" });
      return;
    }
    response.json(detail);
  }));

  app.get("/api/categories/:id/diff", asyncHandler(async (request, response) => {
    const organizationId = sessionOrganizationId(request);
    const id = validateIdParam(request.params.id);
    if (!store.getCategoryMonitor(id, organizationId)) {
      response.status(404).json({ message: "Category not found" });
      return;
    }
    const query = validateQuery(categoryDiffQuerySchema, request.query);
    const date = query.date ?? isoDate();
    if (query.compareDate >= date) {
      throw Object.assign(new Error("compareDate must be earlier than date"), { statusCode: 400 });
    }
    response.json(store.getCategoryDiff(id, date, query.compareDate, organizationId));
  }));

  app.get("/api/category-signals", (request, response) => {
    const organizationId = sessionOrganizationId(request);
    const query = validateQuery(categorySignalQuerySchema, request.query);
    response.json(
      store.listCategorySignals({
        orgId: organizationId,
        date: query.date,
        categoryId: query.categoryId,
        limit: query.limit,
        offset: query.offset
      })
    );
  });
}

function sessionOrganizationId(request: Request): number {
  const context = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  return context?.organization.id ?? 1;
}
