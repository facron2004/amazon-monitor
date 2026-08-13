import cors from "cors";
import express, { type Request, type Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type SessionContext } from "@amazon-monitor/shared";
import type { AmazonSearchCollector } from "./amazon-collector.js";
import { canModifyBusinessRequest } from "./business-request-authorization.js";
import type { AmazonBestSellerCollector } from "./category-pipeline.js";
import type { NotificationSender } from "./notifier.js";
import type { ReportPdfRenderer } from "./reports/report-pdf.js";
import { registerAdsRoutes } from "./routes/ads.js";
import { registerAgentRoutes } from "./routes/agent.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerAuthRoutes, sessionLoader } from "./routes/auth.js";
import { registerBrandPlaybookRoutes } from "./routes/brand-playbooks.js";
import { registerCompetitorRoutes } from "./routes/competitors.js";
import { registerCategoryRoutes } from "./routes/categories.js";
import { registerCollectorRoutes } from "./routes/collectors.js";
import { registerDataSourceRoutes } from "./routes/data-sources.js";
import { getDate, optionalNumber } from "./routes/http-utils.js";
import { registerInsightEventRoutes } from "./routes/insight-events.js";
import { registerInsightRoutes } from "./routes/insights.js";
import { registerInventoryRoutes } from "./routes/inventory.js";
import { registerKeywordRoutes } from "./routes/keywords.js";
import { registerListingHealthRoutes } from "./routes/listing-health.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerOperationRoutes } from "./routes/operations.js";
import { registerProductRoutes } from "./routes/products.js";
import { registerPromotionRoutes } from "./routes/promotions.js";
import { registerProfitRoutes } from "./routes/profit.js";
import { registerReportRoutes } from "./routes/reports.js";
import { registerReviewVocRoutes } from "./routes/review-voc.js";
import { registerRuleRoutes } from "./routes/rules.js";
import { registerSopRoutes } from "./routes/sops.js";
import { registerStoreRoutes } from "./routes/stores.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import type { Store } from "./store.js";
import { AgentRuntimeService } from "./services/agent-runtime-service.js";
import { AgentActionService } from "./services/agent-action-service.js";
import {
  getWorkerReadiness,
  isWorkerReady,
  unavailableWorkerReadiness,
} from "./readiness.js";

export interface ApiAppOptions {
  collector?: AmazonSearchCollector;
  categoryCollector?: AmazonBestSellerCollector;
  notificationSender?: NotificationSender;
  reportPdfRenderer?: ReportPdfRenderer;
  agentRuntime?: AgentRuntimeService;
  setupToken?: string;
  bootId?: string;
  schemaVersion?: number;
  webDistPath?: string;
}

export function createApiApp(store: Store, options: ApiAppOptions = {}) {
  const app = express();
  const isProduction = process.env.NODE_ENV === "production";

  // Security headers. The static web bundle only loads same-origin scripts; runtime
  // style attributes are retained for Element Plus and ECharts layout.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        defaultSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: [
          "'self'",
          "blob:",
          "data:",
          "https://*.media-amazon.com",
          "https://*.ssl-images-amazon.com"
        ],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        workerSrc: ["'self'", "blob:"]
      }
    }
  }));

  // CORS — restrict to allowed origins, default to localhost only
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : [
        "http://localhost:5188",
        "http://localhost:4000"
      ];
  app.use(cors({
    origin: allowedOrigins,
    credentials: true
  }));
  app.use(express.json({ limit: "1mb" }));

  // Rate limiting — disabled in development (vite proxy logs 429 as "http proxy error",
  // and dev polling exceeds 200 req/min almost immediately). Production keeps the
  // 200/min cap to protect public endpoints.
  const isDevelopment = process.env.NODE_ENV !== "production";
  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: isDevelopment ? 100_000 : 200,
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use("/api/", apiLimiter);

  // Collect submission limiter — 5/min for POST only, NOT applied to GET job polling
  const collectLimiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });

  // Credential endpoints get a dedicated budget so a caller cannot spend the
  // general API allowance on password guessing. Development/test keeps the
  // limiter effectively disabled to preserve local polling and test isolation.
  const credentialAttemptMax = isDevelopment ? 100_000 : 10;
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    max: credentialAttemptMax,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const bootstrapLimiter = rateLimit({
    windowMs: 15 * 60_000,
    max: isDevelopment ? 100_000 : 5,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Load openapi.json
  const openapiPath = fileURLToPath(new URL("./openapi.json", import.meta.url));
  let openapiDoc: unknown = null;
  try {
    openapiDoc = JSON.parse(readFileSync(openapiPath, "utf-8"));
  } catch {
    console.warn("[Server] openapi.json not found, API docs will be unavailable.");
  }

  // API docs — only expose in non-production or when explicitly enabled
  const exposeDocs = !isProduction || process.env.EXPOSE_API_DOCS === "true";
  if (exposeDocs && openapiDoc) {
    app.get("/api/openapi.json", (_req, res) => {
      res.json(openapiDoc);
    });

    const apiDocsHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Amazon Monitor API Documents</title>
</head>
<body>
  <main>
    <h1>Amazon Monitor API Documents</h1>
    <p><a href="/api/openapi.json">Download the OpenAPI document</a></p>
  </main>
</body>
</html>`;

    app.get("/api-docs", (_req, res) => {
      res.type("html").send(apiDocsHtml);
    });
  }

  // Every business API is scoped by an HttpOnly login session. The former
  // process-wide API key inferred an organization from the first admin user;
  // it is intentionally ignored rather than becoming an unsafe fallback.
  const allowAnonymousTestRequests = process.env.NODE_ENV === "test";
  if (process.env.AMAZON_MONITOR_API_KEY) {
    console.warn("[SECURITY] AMAZON_MONITOR_API_KEY is ignored. Use an authenticated session or a future organization-scoped service account.");
  }
  app.use(sessionLoader(store));
  app.use((req, res, next) => {
    // Health check and static frontend files are always public
    if (
      req.path === "/api/health" ||
      req.path === "/api/ready" ||
      !req.path.startsWith("/api/")
    ) {
      return next();
    }

    // API docs are public only when explicitly exposed
    if (exposeDocs && (req.path === "/api/openapi.json" || req.path.startsWith("/api-docs"))) {
      return next();
    }

    // Auth bootstrap endpoints are public
    if (req.path === "/api/auth/login" || req.path === "/api/auth/register-first-user") {
      return next();
    }

    // Session-based auth (preferred)
    const ctx = (req as Request & { sessionContext?: SessionContext }).sessionContext;
    if (ctx) {
      if (requiresBusinessCapability(req) && !canModifyBusinessRequest(ctx.user.role, req)) {
        res.status(403).json({ message: "Forbidden: role cannot modify this business domain" });
        return;
      }
      return next();
    }

    if (allowAnonymousTestRequests) {
      return next();
    }

    res.status(401).json({ message: "Unauthorized: login session required" });
  });

  // Static file serving for Electron / embedded mode - MUST be before API routes
  const webDistPath = options.webDistPath
    ?? process.env.WEB_DIST_PATH
    ?? join(process.cwd(), "apps", "web", "dist");
  if (existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
  }

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, service: "amazon-keyword-competitor-monitor" });
  });

  app.get("/api/ready", (_request, response) => {
    const webAssets = existsSync(join(webDistPath, "index.html"));
    const workerRequired = process.env.RUN_WORKER === "true";
    try {
      store.listOrganizations();
      const worker = getWorkerReadiness(store, workerRequired);
      const ready = webAssets && isWorkerReady(worker);
      response.status(ready ? 200 : 503).json({
        ok: ready,
        service: "amazon-keyword-competitor-monitor",
        bootId: options.bootId ?? null,
        schemaVersion: options.schemaVersion ?? null,
        database: "ready",
        webAssets,
        worker,
      });
    } catch {
      response.status(503).json({
        ok: false,
        service: "amazon-keyword-competitor-monitor",
        bootId: options.bootId ?? null,
        schemaVersion: options.schemaVersion ?? null,
        database: "unavailable",
        webAssets,
        worker: unavailableWorkerReadiness(workerRequired),
      });
    }
  });

  app.get("/api/dashboard/summary", (request, response) => {
    const context = (request as Request & { sessionContext?: SessionContext }).sessionContext;
    if (!context) {
      response.status(401).json({ message: "Authentication required" });
      return;
    }
    const date = getDate(request);
    response.json({
      ...store.getDashboardSummary(date, context.organization.id),
      operations: store.getDashboardOperationsSummary(context.organization.id, date)
    });
  });

  app.get("/api/dashboard/today-actions", (request, response) => {
    const context = (request as Request & { sessionContext?: SessionContext }).sessionContext;
    if (!context) {
      response.status(401).json({ message: "Authentication required" });
      return;
    }
    const limit = Math.min(Math.max(optionalNumber(request.query.limit) ?? 5, 1), 20);
    response.json(store.listTopInsights(getDate(request), limit, undefined, context.organization.id));
  });

  app.get("/api/dashboard/events-feed", (request, response) => {
    const context = (request as Request & { sessionContext?: SessionContext }).sessionContext;
    if (!context) {
      response.status(401).json({ message: "Authentication required" });
      return;
    }
    response.json(store.listInsightEvents({
      orgId: context.organization.id,
      date: getDate(request),
      limit: Math.min(Math.max(optionalNumber(request.query.limit) ?? 20, 1), 100),
      offset: Math.max(optionalNumber(request.query.offset) ?? 0, 0)
    }));
  });

  registerKeywordRoutes(app, store, { collector: options.collector, collectLimiter });
  registerCategoryRoutes(app, store, { categoryCollector: options.categoryCollector, collectLimiter });
  registerCollectorRoutes(app, store, { collectLimiter });
  registerAuthRoutes(app, store, {
    setupToken: options.setupToken,
    loginLimiter,
    bootstrapLimiter,
  });
  registerInsightEventRoutes(app, store);
  registerBrandPlaybookRoutes(app, store);
  registerInsightRoutes(app, store);
  registerCompetitorRoutes(app, store);
  registerProductRoutes(app, store);
  registerPromotionRoutes(app, store);
  registerListingHealthRoutes(app, store);
  registerAdsRoutes(app, store);
  registerReviewVocRoutes(app, store);
  registerInventoryRoutes(app, store);
  registerProfitRoutes(app, store);
  registerAiRoutes(app, store);
  registerAgentRoutes(
    app,
    store,
    options.agentRuntime ?? new AgentRuntimeService(store),
    new AgentActionService(store, options.notificationSender),
  );
  registerReportRoutes(app, store, { reportPdfRenderer: options.reportPdfRenderer });
  registerOperationRoutes(app, store);
  registerNotificationRoutes(app, store, { notificationSender: options.notificationSender });
  registerTaskRoutes(app, store);
  registerSopRoutes(app, store);
  registerRuleRoutes(app, store);
  registerDataSourceRoutes(app, store);
  registerStoreRoutes(app, store);

  // Fallback to index.html for SPA routing
  app.use((req, response, next) => {
    if (req.path.startsWith("/api/")) return next();
    if (existsSync(join(webDistPath, "index.html"))) {
      response.sendFile(join(webDistPath, "index.html"));
    } else {
      next();
    }
  });

  // Global error handler — sanitize messages in production
  app.use((error: unknown, _req: Request, response: Response, _next: Function) => {
    console.error("[API Error]", error);
    const statusCode = (error as { statusCode?: number })?.statusCode ?? 500;
    const message = isProduction && statusCode >= 500
      ? "Internal server error"
      : (error instanceof Error ? error.message : String(error));
    response.status(statusCode).json({ message });
  });

  return app;
}

function requiresBusinessCapability(request: Request): boolean {
  if (request.path === "/api/auth/logout") return false;
  if (request.method === "GET") {
    return request.path.endsWith("/open")
      || request.path === "/api/reports/daily.md"
      || request.path === "/api/reports/daily.xlsx"
      || request.path === "/api/reports/daily.pdf"
      || request.path === "/api/reports/period.pdf";
  }
  return request.method !== "HEAD" && request.method !== "OPTIONS";
}
