import type { Express } from "express";
import type { Store } from "../store.js";
import { optionalNumber, optionalString } from "./http-utils.js";

function isAmazonUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /\.amazon\.\w{2,}$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

export function registerCompetitorRoutes(app: Express, store: Store): void {
  app.get("/api/competitors", (request, response) => {
    response.json(
      store.listCompetitors({
        keywordId: optionalNumber(request.query.keywordId),
        keyword: optionalString(request.query.keyword),
        sourceType: parseCompetitorSourceType(request.query.sourceType),
        tier: parseCompetitorTier(request.query.tier)
      })
    );
  });

  app.get("/api/competitor-folders", (_request, response) => {
    response.json(store.listCompetitorFolders());
  });

  app.get("/api/category-products/:asin/link", (request, response) => {
    const result = store.getCategoryProductLink(request.params.asin, optionalNumber(request.query.categoryId));
    if (!result) {
      response.status(404).json({ message: "category product link not found" });
      return;
    }
    response.json(result);
  });

  app.get("/api/category-products/:asin/open", (request, response) => {
    const result = store.getCategoryProductLink(request.params.asin, optionalNumber(request.query.categoryId));
    if (!result) {
      response.status(404).json({ message: "category product link not found" });
      return;
    }
    if (!isAmazonUrl(result.url)) {
      response.status(400).json({ message: "Invalid redirect URL: not an Amazon domain" });
      return;
    }
    response.redirect(result.url);
  });

  app.get("/api/competitors/:asin/link", (request, response) => {
    const result = store.getProductLink(request.params.asin, optionalNumber(request.query.keywordId));
    if (!result) {
      response.status(404).json({ message: "product link not found" });
      return;
    }
    response.json(result);
  });

  app.get("/api/competitors/:asin/open", (request, response) => {
    const result = store.getProductLink(request.params.asin, optionalNumber(request.query.keywordId));
    if (!result) {
      response.status(404).json({ message: "product link not found" });
      return;
    }
    if (!isAmazonUrl(result.url)) {
      response.status(400).json({ message: "Invalid redirect URL: not an Amazon domain" });
      return;
    }
    response.redirect(result.url);
  });

  app.get("/api/products/:asin/activity-calendar", (request, response) => {
    const result = store.getProductActivityCalendar(request.params.asin, {
      marketplace: optionalString(request.query.marketplace),
      date: optionalString(request.query.date),
      limitDays: request.query.limitDays ? Number(request.query.limitDays) : undefined
    });
    if (!result) {
      response.status(404).json({ message: "product activity calendar not found" });
      return;
    }
    response.json(result);
  });

  app.patch("/api/competitors/:asin/key", (request, response) => {
    const result = store.setKeyCompetitor(request.params.asin, Boolean(request.body?.isKeyCompetitor));
    if (!result) {
      response.status(404).json({ message: "competitor not found" });
      return;
    }
    response.json(result);
  });
}

function parseCompetitorSourceType(value: unknown): "keyword" | "category" | "hybrid" | undefined {
  return value === "keyword" || value === "category" || value === "hybrid" ? value : undefined;
}

function parseCompetitorTier(value: unknown): "core" | "rising" | "activity" | "watch" | undefined {
  return value === "core" || value === "rising" || value === "activity" || value === "watch" ? value : undefined;
}
