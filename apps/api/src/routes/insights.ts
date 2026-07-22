import type { Express, Request } from "express";
import type { SessionContext } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { getDate, optionalBoolean, optionalNumber, optionalString } from "./http-utils.js";
import { validateQuery } from "./validation.js";
import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const productPriceHistoryQuerySchema = z.object({
  date: dateSchema.optional(),
  categoryId: z.coerce.number().int().min(1).optional(),
  asin: z.string().min(1).max(30).optional(),
  marketplace: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const bsrSnapshotQuerySchema = z.object({
  date: dateSchema.optional(),
  categoryId: z.coerce.number().int().min(1).optional(),
  asin: z.string().min(1).max(30).optional(),
  brand: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const bsrDiffQuerySchema = z.object({
  categoryId: z.coerce.number().int().min(1),
  date: dateSchema.optional(),
  compareDate: dateSchema
});

const bsrBrandMatrixQuerySchema = z.object({
  date: dateSchema.optional(),
  categoryId: z.coerce.number().int().min(1).optional(),
  brand: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional()
});

const bsrNewRisersQuerySchema = z.object({
  date: dateSchema.optional(),
  categoryId: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export function registerInsightRoutes(app: Express, store: Store): void {
  app.get("/api/bsr/categories", (request, response) => {
    response.json(store.listCategoryMonitors({ orgId: sessionOrganizationId(request) }));
  });

  app.get("/api/bsr/snapshots", (request, response) => {
    const query = validateQuery(bsrSnapshotQuerySchema, request.query);
    response.json(store.listCategorySnapshots({
      orgId: sessionOrganizationId(request),
      date: query.date,
      categoryId: query.categoryId,
      asin: query.asin,
      brand: query.brand,
      limit: query.limit,
      offset: query.offset
    }));
  });

  app.get("/api/bsr/diff", (request, response) => {
    const orgId = sessionOrganizationId(request);
    const query = validateQuery(bsrDiffQuerySchema, request.query);
    const date = query.date ?? getDate(request);
    if (!store.getCategoryMonitor(query.categoryId, orgId)) {
      response.status(404).json({ message: "Category not found" });
      return;
    }
    if (query.compareDate >= date) {
      response.status(400).json({ message: "compareDate must be earlier than date" });
      return;
    }
    response.json(store.getCategoryDiff(query.categoryId, date, query.compareDate, orgId));
  });

  app.get("/api/bsr/brand-matrix", (request, response) => {
    const query = validateQuery(bsrBrandMatrixQuerySchema, request.query);
    response.json(store.listBrandMatrix({
      orgId: sessionOrganizationId(request),
      date: query.date,
      categoryId: query.categoryId,
      brand: query.brand,
      limit: query.limit
    }));
  });

  app.get("/api/bsr/new-risers", (request, response) => {
    const query = validateQuery(bsrNewRisersQuerySchema, request.query);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    const events = store.listCategoryActivityEvents({
      orgId: sessionOrganizationId(request),
      date: query.date,
      categoryId: query.categoryId,
      limit: 1000
    }).filter((event) => (
      event.eventType === "rank_surge"
      || event.eventType === "new_entry_top100"
      || event.eventType === "new_entry_top50"
    ));
    response.json(events.slice(offset, offset + limit));
  });

  app.get("/api/product-price-history", (request, response) => {
    const orgId = sessionOrganizationId(request);
    const query = validateQuery(productPriceHistoryQuerySchema, request.query);
    response.json(
      store.listProductPriceHistory({
        orgId,
        date: query.date,
        categoryId: query.categoryId,
        asin: query.asin,
        marketplace: query.marketplace,
        limit: query.limit,
        offset: query.offset
      })
    );
  });

  app.get("/api/activity-events", (request, response) => {
    const orgId = sessionOrganizationId(request);
    response.json(
      store.listCategoryActivityEvents({
        orgId,
        date: optionalString(request.query.date),
        categoryId: optionalNumber(request.query.categoryId),
        asin: optionalString(request.query.asin),
        brand: optionalString(request.query.brand),
        eventType: optionalString(request.query.eventType),
        limit: optionalNumber(request.query.limit),
        offset: optionalNumber(request.query.offset)
      })
    );
  });

  app.get("/api/bsr/history", (request, response) => {
    const orgId = sessionOrganizationId(request);
    response.json(
      store.listBsrRankHistory({
        orgId,
        date: optionalString(request.query.date),
        sourceType: parseBsrSourceType(request.query.sourceType),
        sourceId: optionalNumber(request.query.sourceId),
        category: optionalString(request.query.category),
        asin: optionalString(request.query.asin),
        limit: optionalNumber(request.query.limit),
        offset: optionalNumber(request.query.offset)
      })
    );
  });

  app.get("/api/bsr/quality", (request, response) => {
    const orgId = sessionOrganizationId(request);
    response.json(
      store.listBsrSnapshotQuality({
        orgId,
        date: optionalString(request.query.date),
        sourceType: parseBsrSourceType(request.query.sourceType),
        sourceId: optionalNumber(request.query.sourceId),
        category: optionalString(request.query.category),
        qualityStatus: optionalString(request.query.qualityStatus),
        limit: optionalNumber(request.query.limit),
        offset: optionalNumber(request.query.offset)
      })
    );
  });

  app.get("/api/bsr/changes", (request, response) => {
    const orgId = sessionOrganizationId(request);
    response.json(
      store.listBsrRankChanges({
        orgId,
        date: getDate(request),
        sourceType: parseBsrSourceType(request.query.sourceType),
        sourceId: optionalNumber(request.query.sourceId),
        category: optionalString(request.query.category),
        includeUnchanged: optionalBoolean(request.query.includeUnchanged) ?? false,
        limit: optionalNumber(request.query.limit),
        offset: optionalNumber(request.query.offset)
      })
    );
  });

  app.get("/api/action-insights", (request, response) => {
    const orgId = sessionOrganizationId(request);
    response.json(
      store.listCompetitorActionInsights({
        orgId,
        date: optionalString(request.query.date),
        sourceType: parseBsrSourceType(request.query.sourceType),
        sourceId: optionalNumber(request.query.sourceId),
        category: optionalString(request.query.category),
        asin: optionalString(request.query.asin),
        brand: optionalString(request.query.brand),
        insightType: optionalString(request.query.insightType),
        limit: optionalNumber(request.query.limit),
        offset: optionalNumber(request.query.offset)
      })
    );
  });
}

function sessionOrganizationId(request: Request): number {
  const context = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  return context?.organization.id ?? 1;
}

function parseBsrSourceType(value: unknown): "category_bestseller" | "keyword_detail" | undefined {
  return value === "category_bestseller" || value === "keyword_detail" ? value : undefined;
}
