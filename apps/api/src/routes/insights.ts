import type { Express } from "express";
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

export function registerInsightRoutes(app: Express, store: Store): void {
  app.get("/api/product-price-history", (request, response) => {
    const query = validateQuery(productPriceHistoryQuerySchema, request.query);
    response.json(
      store.listProductPriceHistory({
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
    response.json(
      store.listCategoryActivityEvents({
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
    response.json(
      store.listBsrRankHistory({
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
    response.json(
      store.listBsrSnapshotQuality({
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
    response.json(
      store.listBsrRankChanges({
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
    response.json(
      store.listCompetitorActionInsights({
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

function parseBsrSourceType(value: unknown): "category_bestseller" | "keyword_detail" | undefined {
  return value === "category_bestseller" || value === "keyword_detail" ? value : undefined;
}
