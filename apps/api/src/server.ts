import cors from "cors";
import { timingSafeEqual } from "node:crypto";
import express, { type Request, type Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AmazonSearchCollector } from "./amazon-collector.js";
import type { AmazonBestSellerCollector } from "./category-pipeline.js";
import type { NotificationSender } from "./notifier.js";
import { registerCompetitorRoutes } from "./routes/competitors.js";
import { registerCategoryRoutes } from "./routes/categories.js";
import { getDate } from "./routes/http-utils.js";
import { registerInsightRoutes } from "./routes/insights.js";
import { registerKeywordRoutes } from "./routes/keywords.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerOperationRoutes } from "./routes/operations.js";
import { registerReportRoutes } from "./routes/reports.js";
import type { Store } from "./store.js";

export interface ApiAppOptions {
  collector?: AmazonSearchCollector;
  categoryCollector?: AmazonBestSellerCollector;
  notificationSender?: NotificationSender;
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
    : ["http://localhost:5188", "http://localhost:4000"];
  app.use(cors({
    origin: allowedOrigins,
    credentials: true
  }));
  app.use(express.json({ limit: "1mb" }));

  // Rate limiting
  const apiLimiter = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false });
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

  // Authentication Middleware — mandatory API key
  const apiKey = process.env.AMAZON_MONITOR_API_KEY;
  if (!apiKey) {
    console.warn(
      "⚠️  [SECURITY] AMAZON_MONITOR_API_KEY is not set! All API endpoints are unprotected.\n" +
      "   Set this environment variable before deploying to production."
    );
  }
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

    // If no API key configured, skip auth (with warning logged above)
    if (!apiKey) {
      return next();
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token && isTimingSafeEqual(token, apiKey)) {
      return next();
    }

    res.status(401).json({ message: "Unauthorized: Invalid or missing API key" });
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
    response.json(store.getDashboardSummary(getDate(request)));
  });

  registerKeywordRoutes(app, store, { collector: options.collector, collectLimiter });
  registerCategoryRoutes(app, store, { categoryCollector: options.categoryCollector, collectLimiter });
  registerInsightRoutes(app, store);
  registerCompetitorRoutes(app, store);
  registerReportRoutes(app, store);
  registerOperationRoutes(app, store);
  registerNotificationRoutes(app, store, { notificationSender: options.notificationSender });

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
    const message = isProduction
      ? "Internal server error"
      : (error instanceof Error ? error.message : String(error));
    response.status(500).json({ message });
  });

  return app;
}

function isTimingSafeEqual(input: string, expected: string): boolean {
  const a = Buffer.from(input, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
