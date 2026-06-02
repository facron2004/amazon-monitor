import cors from "cors";
import express, { type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { AmazonSearchCollector } from "./amazon-collector.js";
import { runCategoryCollectionForAll, runCategoryCollectionForMonitor, type AmazonBestSellerCollector } from "./category-pipeline.js";
import { buildNotificationExcelAttachment } from "./excel-report.js";
import { sendNotificationSchedule, type NotificationSender } from "./notifier.js";
import { isoDate, runCollectionForAll, runCollectionForKeyword } from "./pipeline.js";
import type { Store } from "./store.js";

export interface ApiAppOptions {
  collector?: AmazonSearchCollector;
  categoryCollector?: AmazonBestSellerCollector;
  notificationSender?: NotificationSender;
}

export function createApiApp(store: Store, options: ApiAppOptions = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, service: "amazon-keyword-competitor-monitor" });
  });

  app.get("/api/dashboard/summary", (request, response) => {
    response.json(store.getDashboardSummary(getDate(request)));
  });

  app.get("/api/keywords", (_request, response) => {
    response.json(store.listKeywords());
  });

  app.post("/api/keywords", (request, response) => {
    const body = request.body ?? {};
    if (!body.keyword || !body.marketplace) {
      response.status(400).json({ message: "keyword and marketplace are required" });
      return;
    }
    response.status(201).json(
      store.createKeyword({
        keyword: String(body.keyword),
        marketplace: String(body.marketplace),
        zipCode: body.zipCode ?? null,
        language: body.language ?? "en_US",
        categoryTag: body.categoryTag ?? null,
        crawlPages: Number(body.crawlPages ?? 3),
        status: body.status === "disabled" ? "disabled" : "enabled"
      })
    );
  });

  app.patch("/api/keywords/:id", asyncHandler(async (request, response) => {
    response.json(
      store.updateKeyword(Number(request.params.id), {
        keyword: request.body.keyword,
        marketplace: request.body.marketplace,
        zipCode: request.body.zipCode,
        language: request.body.language,
        categoryTag: request.body.categoryTag,
        crawlPages: request.body.crawlPages === undefined ? undefined : Number(request.body.crawlPages),
        status: request.body.status
      })
    );
  }));

  app.delete("/api/keywords/:id", (request, response) => {
    store.deleteKeyword(Number(request.params.id));
    response.status(204).end();
  });

  app.get("/api/keywords/:id/detail", (request, response) => {
    response.json(store.getKeywordDetail(Number(request.params.id), getDate(request)));
  });

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

  app.patch("/api/categories/:id", asyncHandler(async (request, response) => {
    response.json(
      store.updateCategoryMonitor(Number(request.params.id), {
        name: request.body.name,
        marketplace: request.body.marketplace,
        categoryUrl: request.body.categoryUrl,
        categoryPath: request.body.categoryPath,
        crawlTopN: request.body.crawlTopN === undefined ? undefined : Number(request.body.crawlTopN),
        status: request.body.status
      })
    );
  }));

  app.delete("/api/categories/:id", (request, response) => {
    store.deleteCategoryMonitor(Number(request.params.id));
    response.status(204).end();
  });

  app.post("/api/categories/:id/collect", asyncHandler(async (request, response) => {
    const date = optionalString(request.body?.date) ?? isoDate();
    response.json(await runCategoryCollectionForMonitor(store, Number(request.params.id), date, { collector: options.categoryCollector }));
  }));

  app.post("/api/categories/collect/run", asyncHandler(async (request, response) => {
    const date = optionalString(request.body?.date) ?? isoDate();
    response.json(await runCategoryCollectionForAll(store, date, { collector: options.categoryCollector }));
  }));

  app.get("/api/categories/:id/detail", (request, response) => {
    response.json(store.getCategoryDetail(Number(request.params.id), getDate(request)));
  });

  app.get("/api/category-signals", (request, response) => {
    response.json(
      store.listCategorySignals({
        date: optionalString(request.query.date),
        categoryId: optionalNumber(request.query.categoryId),
        limit: optionalNumber(request.query.limit)
      })
    );
  });

  app.get("/api/product-price-history", (request, response) => {
    response.json(
      store.listProductPriceHistory({
        date: optionalString(request.query.date),
        categoryId: optionalNumber(request.query.categoryId),
        asin: optionalString(request.query.asin),
        marketplace: optionalString(request.query.marketplace),
        limit: optionalNumber(request.query.limit)
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
        limit: optionalNumber(request.query.limit)
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
        limit: optionalNumber(request.query.limit)
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
        limit: optionalNumber(request.query.limit)
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
        limit: optionalNumber(request.query.limit)
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
        limit: optionalNumber(request.query.limit)
      })
    );
  });

  app.get("/api/reports/category", (request, response) => {
    const date = getDate(request);
    const categoryId = optionalNumber(request.query.categoryId);
    response.json({
      date,
      categoryId: categoryId ?? null,
      markdown: store.getCategoryReport(date, categoryId)
    });
  });

  app.get("/api/snapshots", (request, response) => {
    response.json(
      store.listSnapshots({
        date: optionalString(request.query.date),
        keywordId: optionalNumber(request.query.keywordId),
        keyword: optionalString(request.query.keyword),
        limit: optionalNumber(request.query.limit)
      })
    );
  });

  app.post("/api/collect/run", asyncHandler(async (request, response) => {
    const date = optionalString(request.body?.date) ?? isoDate();
    if (request.body?.keywordId) {
      response.json(await runCollectionForKeyword(store, Number(request.body.keywordId), date, { collector: options.collector }));
      return;
    }
    response.json(await runCollectionForAll(store, date, { collector: options.collector }));
  }));

  app.get("/api/competitors", (_request, response) => {
    response.json(
      store.listCompetitors({
        keywordId: optionalNumber(_request.query.keywordId),
        keyword: optionalString(_request.query.keyword),
        sourceType: parseCompetitorSourceType(_request.query.sourceType),
        tier: parseCompetitorTier(_request.query.tier)
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

  app.get("/api/alerts", (request, response) => {
    response.json(
      store.listAlerts({
        date: optionalString(request.query.date),
        status: optionalString(request.query.status),
        limit: optionalNumber(request.query.limit)
      })
    );
  });

  app.patch("/api/alerts/:id/status", (request, response) => {
    const result = store.updateAlertStatus(Number(request.params.id), request.body?.status ?? "viewed");
    if (!result) {
      response.status(404).json({ message: "alert not found" });
      return;
    }
    response.json(result);
  });

  app.get("/api/changes", (request, response) => {
    response.json(
      store.listDailyChanges({
        date: optionalString(request.query.date),
        keyword: optionalString(request.query.keyword)
      })
    );
  });

  app.get("/api/reports/daily", (request, response) => {
    const date = getDate(request);
    const keyword = optionalString(request.query.keyword);
    response.json({
      date,
      keyword: keyword ?? null,
      markdown: store.getDailyReport(date, keyword)
    });
  });

  app.get("/api/reports/daily.xlsx", (request, response) => {
    const date = getDate(request);
    const attachment = buildNotificationExcelAttachment(store, date);
    response.setHeader("Content-Type", attachment.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${attachment.filename}"`);
    response.send(attachment.content);
  });

  app.get("/api/task-logs", (request, response) => {
    response.json(store.listTaskLogs(optionalNumber(request.query.limit) ?? 50));
  });

  app.get("/api/notifications/schedules", (_request, response) => {
    response.json(store.listNotificationSchedules());
  });

  app.post("/api/notifications/schedules", asyncHandler(async (request, response) => {
    const body = request.body ?? {};
    response.status(201).json(
      store.createNotificationSchedule({
        name: String(body.name ?? ""),
        channel: body.channel === "feishu" ? "feishu" : "email",
        target: String(body.target ?? ""),
        sendTime: String(body.sendTime ?? ""),
        timezone: optionalString(body.timezone) ?? "Asia/Shanghai",
        status: body.status === "disabled" ? "disabled" : "enabled"
      })
    );
  }));

  app.patch("/api/notifications/schedules/:id", asyncHandler(async (request, response) => {
    response.json(
      store.updateNotificationSchedule(Number(request.params.id), {
        name: request.body.name,
        channel: request.body.channel,
        target: request.body.target,
        sendTime: request.body.sendTime,
        timezone: request.body.timezone,
        status: request.body.status
      })
    );
  }));

  app.delete("/api/notifications/schedules/:id", (request, response) => {
    store.deleteNotificationSchedule(Number(request.params.id));
    response.status(204).end();
  });

  app.post("/api/notifications/schedules/:id/send", asyncHandler(async (request, response) => {
    const schedule = store.getNotificationSchedule(Number(request.params.id));
    if (!schedule) {
      response.status(404).json({ message: "notification schedule not found" });
      return;
    }
    const date = optionalString(request.body?.date) ?? isoDate();
    response.json(await sendNotificationSchedule(store, schedule, date, options.notificationSender));
  }));

  app.get("/api/notifications/logs", (request, response) => {
    response.json(store.listNotificationSendLogs(optionalNumber(request.query.limit) ?? 50));
  });

  // Static file serving for Electron / embedded mode
  const webDistPath = process.env.WEB_DIST_PATH ?? join(process.cwd(), "..", "web", "dist");
  if (existsSync(webDistPath)) {
    console.log(`[static] Serving frontend from ${resolve(webDistPath)}`);
    app.use(express.static(webDistPath));
    app.use((req, response, next) => {
      if (req.path.startsWith("/api/")) return next();
      response.sendFile(join(webDistPath, "index.html"));
    });
  }

  // Global error handler
  app.use((error: unknown, _req: Request, response: Response, _next: Function) => {
    console.error("[API Error]", error);
    const message = error instanceof Error ? error.message : String(error);
    response.status(500).json({ message });
  });

  return app;
}

function getDate(request: Request): string {
  return optionalString(request.query.date) ?? isoDate();
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return undefined;
}

function parseBsrSourceType(value: unknown): "category_bestseller" | "keyword_detail" | undefined {
  return value === "category_bestseller" || value === "keyword_detail" ? value : undefined;
}

function parseCompetitorSourceType(value: unknown): "keyword" | "category" | "hybrid" | undefined {
  return value === "keyword" || value === "category" || value === "hybrid" ? value : undefined;
}

function parseCompetitorTier(value: unknown): "core" | "rising" | "activity" | "watch" | undefined {
  return value === "core" || value === "rising" || value === "activity" || value === "watch" ? value : undefined;
}

function sendError(response: Response, error: unknown): void {
  response.status(400).json({ message: error instanceof Error ? error.message : String(error) });
}

function asyncHandler(handler: (request: Request, response: Response) => Promise<void>) {
  return (request: Request, response: Response) => {
    handler(request, response).catch((error) => sendError(response, error));
  };
}
