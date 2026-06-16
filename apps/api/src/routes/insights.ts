import type { Express } from "express";
import type { Store } from "../store.js";
import { getDate, optionalBoolean, optionalNumber, optionalString } from "./http-utils.js";

export function registerInsightRoutes(app: Express, store: Store): void {
  app.get("/api/product-price-history", (request, response) => {
    response.json(
      store.listProductPriceHistory({
        date: optionalString(request.query.date),
        categoryId: optionalNumber(request.query.categoryId),
        asin: optionalString(request.query.asin),
        marketplace: optionalString(request.query.marketplace),
        limit: optionalNumber(request.query.limit),
        offset: optionalNumber(request.query.offset)
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
