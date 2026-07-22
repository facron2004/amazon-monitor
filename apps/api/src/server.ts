import cors from "cors";
import { timingSafeEqual } from "node:crypto";
import express, { type Request, type Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasBusinessCapability, type SessionContext, type UserRole } from "@amazon-monitor/shared";
import type { AmazonSearchCollector } from "./amazon-collector.js";
import type { AmazonBestSellerCollector } from "./category-pipeline.js";
import type { NotificationSender } from "./notifier.js";
import type { ReportPdfRenderer } from "./reports/report-pdf.js";
import { registerAdsRoutes } from "./routes/ads.js";
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

export interface ApiAppOptions {
  collector?: AmazonSearchCollector;
  categoryCollector?: AmazonBestSellerCollector;
  notificationSender?: NotificationSender;
  reportPdfRenderer?: ReportPdfRenderer;
}

export function createApiApp(store: Store, options: ApiAppOptions = {}) {
  const app = express();
  const isProduction = process.env.NODE_ENV === "production";

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false // Allow ECharts and inline styles for the frontend
  }));

  // CORS — restrict to allowed origins, default to localhost only
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : [
        "http://localhost:5188",
        "http://localhost:4000",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "tauri://localhost"
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

    const swaggerUiHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Amazon Monitor API Documents</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5.11.0/favicon-32x32.png" sizes="32x32" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;

    app.get("/api-docs", (_req, res) => {
      res.send(swaggerUiHtml);
    });
  }

  // Authentication — dual-track (Stage 0):
  //   1) New session token (Cookie or x-amazon-monitor-session header)
  //   2) Legacy AMAZON_MONITOR_API_KEY via Authorization: Bearer
  //
  // Every business API requires a session. A legacy API key can authenticate
  // automation, while tests retain the historical anonymous mode so route
  // fixtures can stay focused on their own behavior.
  const apiKey = process.env.AMAZON_MONITOR_API_KEY;
  const allowAnonymousTestRequests = process.env.NODE_ENV === "test" && !apiKey;
  if (!apiKey && !allowAnonymousTestRequests) {
    console.warn(
      "[SECURITY] AMAZON_MONITOR_API_KEY is not set; business APIs require a login session."
    );
  }
  if (isProduction && !apiKey) {
    throw new Error("AMAZON_MONITOR_API_KEY is required in production");
  }
  app.use(sessionLoader(store));
  app.use((req, res, next) => {
    // Health check and static frontend files are always public
    if (
      req.path === "/api/health" ||
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

    // Legacy API key fallback
    if (apiKey) {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (token && isTimingSafeEqual(token, apiKey)) {
        const context = resolveLegacyApiKeyContext(store);
        if (!context) {
          res.status(500).json({ message: "Legacy API key authenticated, but no admin user exists" });
          return;
        }
        (req as Request & { sessionContext?: SessionContext }).sessionContext = context;
        return next();
      }
      res.status(401).json({ message: "Unauthorized: login or valid API key required" });
      return;
    }

    if (allowAnonymousTestRequests) {
      return next();
    }

    res.status(401).json({ message: "Unauthorized: login or valid API key required" });
  });

  // Static file serving for Electron / embedded mode - MUST be before API routes
  const webDistPath = process.env.WEB_DIST_PATH ?? join(process.cwd(), "apps", "web", "dist");
  if (existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
  }

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, service: "amazon-keyword-competitor-monitor" });
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
  registerAuthRoutes(app, store);
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
    const webDistPath = process.env.WEB_DIST_PATH ?? join(process.cwd(), "apps", "web", "dist");
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

function isTimingSafeEqual(input: string, expected: string): boolean {
  const a = Buffer.from(input, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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

function canModifyBusinessRequest(role: UserRole, request: Request): boolean {
  if (request.path.endsWith("/profit-setting")) {
    return hasBusinessCapability(role, "manage_profit");
  }
  if (
    request.path.startsWith("/api/ads")
    || request.path === "/api/ai/analyze-ads"
  ) {
    return hasBusinessCapability(role, "manage_ads");
  }
  if (
    request.path.startsWith("/api/competitors")
    || request.path.startsWith("/api/asin-watch-states")
  ) {
    return hasBusinessCapability(role, "manage_competitors");
  }
  if (request.path === "/api/ai/analyze-competitor") {
    return hasBusinessCapability(role, "manage_competitors");
  }
  if (request.path === "/api/ai/create-report") {
    return hasBusinessCapability(role, "manage_reports");
  }
  if (request.path.startsWith("/api/ai")) {
    return hasBusinessCapability(role, "manage_workflow");
  }
  if (request.path.startsWith("/api/data-sources") || request.path.startsWith("/api/stores")) {
    return hasBusinessCapability(role, "manage_data_sources");
  }
  if (request.path.startsWith("/api/promotions")) {
    return hasBusinessCapability(role, "manage_workflow");
  }
  if (request.path.startsWith("/api/reports")) {
    return hasBusinessCapability(role, "manage_reports");
  }
  if (request.path.startsWith("/api/notifications")) {
    return hasBusinessCapability(role, "manage_reports");
  }
  if (request.path.startsWith("/api/rules")) {
    return hasBusinessCapability(role, "manage_rules");
  }
  if (
    request.path.startsWith("/api/tasks")
    || request.path.startsWith("/api/sops")
    || request.path.startsWith("/api/insight-events")
  ) {
    return hasBusinessCapability(role, "manage_workflow");
  }
  return role === "admin" || role === "operator";
}

function resolveLegacyApiKeyContext(store: Store): SessionContext | null {
  const user = store.listUsers().find((item) => item.status === "active" && item.role === "admin");
  if (!user) return null;
  const organization = store.getOrganization(user.orgId);
  if (!organization) return null;
  return {
    user,
    organization,
    expiresAt: new Date(Date.now() + 14 * 24 * 3_600_000).toISOString()
  };
}
