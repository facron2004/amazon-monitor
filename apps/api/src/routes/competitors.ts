import express, {
  type Express,
  type Request,
  type RequestHandler,
} from "express";
import type { Store } from "../store.js";
import { parseCompetitorCsv } from "../services/competitor-csv-import.js";
import {
  getCompetitorTimeline,
  listCompetitorSnapshotEvidence,
} from "../services/competitor-history-service.js";
import { optionalNumber, optionalString } from "./http-utils.js";
import {
  categoryCompetitorSchema,
  competitorKeySchema,
  limitDaysQuerySchema,
  manualCompetitorSchema,
  validateBody,
  validateIdParam,
  validateQuery,
} from "./validation.js";
import {
  hasBusinessCapability,
  isoDate,
  isAllowedAmazonHost,
  normalizeAmazonMarketplaceHost,
  type CompetitorCsvImportError,
  type CompetitorCsvImportResult,
  type CompetitorSourceType,
  type CreateManualCompetitorInput,
  type SessionContext,
} from "@amazon-monitor/shared";
import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const competitorSnapshotQuerySchema = z.object({
  date: dateSchema.optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
const competitorTimelineQuerySchema = z.object({
  date: dateSchema.optional(),
  limitDays: z.coerce.number().int().min(1).max(180).optional(),
});

function requireCompetitorManagement(request: Request): void {
  const ctx = requireSessionContext(request);
  if (!hasBusinessCapability(ctx.user.role, "manage_competitors")) {
    throw Object.assign(
      new Error("Forbidden: role cannot manage competitors"),
      { statusCode: 403 },
    );
  }
}

function requireSessionContext(request: Request): SessionContext {
  const ctx = (request as Request & { sessionContext?: SessionContext })
    .sessionContext;
  if (!ctx) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  return ctx;
}

function sessionOrganizationId(request: Request): number {
  return (
    (request as Request & { sessionContext?: SessionContext }).sessionContext
      ?.organization.id ?? 1
  );
}

function isAmazonUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return isAllowedAmazonHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function registerCompetitorRoutes(app: Express, store: Store): void {
  const csvBodyParser = express.text({
    type: ["text/csv", "application/csv"],
    limit: "2mb",
  });
  const importCsvHandler: RequestHandler = (request, response) => {
    requireCompetitorManagement(request);
    const ctx = requireSessionContext(request);
    if (typeof request.body !== "string") {
      throw Object.assign(
        new Error("CSV body must use text/csv content type"),
        { statusCode: 400 },
      );
    }

    const rows = parseCompetitorCsv(request.body);
    const inputs: CreateManualCompetitorInput[] = [];
    const errors: CompetitorCsvImportError[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const parsed = manualCompetitorSchema.safeParse({
        asin: row.values.asin,
        marketplace: row.values.marketplace,
        title: row.values.title,
        brand: row.values.brand || null,
      });
      if (!parsed.success) {
        errors.push({
          row: row.row,
          asin: row.values.asin || null,
          message: formatValidationIssues(parsed.error.issues),
        });
        continue;
      }

      const input = {
        ...parsed.data,
        marketplace: normalizeAmazonMarketplaceHost(parsed.data.marketplace),
      };
      const key = `${input.marketplace}:${input.asin}`;
      if (seen.has(key)) {
        errors.push({
          row: row.row,
          asin: input.asin,
          message: "Duplicate ASIN and marketplace in CSV",
        });
        continue;
      }
      seen.add(key);
      inputs.push(input);
    }

    store.createManualCompetitors(inputs, ctx.organization.id);
    const result: CompetitorCsvImportResult = {
      totalRows: rows.length,
      importedCount: inputs.length,
      failedCount: errors.length,
      errors,
    };
    response.json(result);
  };

  app.post("/api/competitors/import/csv", csvBodyParser, importCsvHandler);
  app.post("/api/competitors/import", csvBodyParser, importCsvHandler);

  app.post("/api/competitors", (request, response) => {
    requireCompetitorManagement(request);
    const ctx = requireSessionContext(request);
    const data = validateBody(manualCompetitorSchema, request.body);
    response.status(201).json(
      store.createManualCompetitor(
        {
          ...data,
          marketplace: normalizeAmazonMarketplaceHost(data.marketplace),
        },
        ctx.organization.id,
      ),
    );
  });

  app.post("/api/competitors/from-category", (request, response) => {
    requireCompetitorManagement(request);
    const ctx = requireSessionContext(request);
    const data = validateBody(categoryCompetitorSchema, request.body);
    const competitor = store.addCategoryCompetitor(
      data.asin,
      data.categoryId,
      ctx.organization.id,
    );
    if (!competitor) {
      response.status(404).json({ message: "category product not found" });
      return;
    }
    response.status(201).json(competitor);
  });

  app.get("/api/competitors", (request, response) => {
    const organizationId = sessionOrganizationId(request);
    const keywordId = optionalNumber(request.query.keywordId);
    const keyword = optionalString(request.query.keyword);
    const sourceType = parseCompetitorSourceType(request.query.sourceType);
    const tier = parseCompetitorTier(request.query.tier);
    response.setHeader(
      "Cache-Control",
      "private, max-age=8, stale-while-revalidate=20",
    );
    response.json(
      store.listCompetitors({
        orgId: organizationId,
        keywordId,
        keyword,
        sourceType,
        tier,
      }),
    );
  });

  app.get("/api/competitors/kpis", (request, response) => {
    const organizationId = sessionOrganizationId(request);
    const date = isoDate();
    store.captureCompetitorDailyKpiSnapshot(organizationId, date);
    response.setHeader("Cache-Control", "private, no-store");
    response.json(store.getCompetitorKpiComparison(organizationId, date));
  });

  app.get("/api/competitors/:id/snapshots", (request, response) => {
    const ctx = requireSessionContext(request);
    const competitor = store.getCompetitor(
      validateIdParam(request.params.id),
      ctx.organization.id,
    );
    if (!competitor) {
      response.status(404).json({ message: "competitor not found" });
      return;
    }
    const query = validateQuery(competitorSnapshotQuerySchema, request.query);
    if (query.startDate && query.endDate && query.startDate > query.endDate) {
      response
        .status(400)
        .json({ message: "startDate must not be later than endDate" });
      return;
    }
    response.json(listCompetitorSnapshotEvidence(store, competitor, query));
  });

  app.get("/api/competitors/:id/timeline", (request, response) => {
    const ctx = requireSessionContext(request);
    const competitor = store.getCompetitor(
      validateIdParam(request.params.id),
      ctx.organization.id,
    );
    if (!competitor) {
      response.status(404).json({ message: "competitor not found" });
      return;
    }
    const query = validateQuery(competitorTimelineQuerySchema, request.query);
    response.json(getCompetitorTimeline(store, competitor, query));
  });

  app.get("/api/competitors/:id", (request, response) => {
    const ctx = requireSessionContext(request);
    const competitor = store.getCompetitor(
      validateIdParam(request.params.id),
      ctx.organization.id,
    );
    if (!competitor) {
      response.status(404).json({ message: "competitor not found" });
      return;
    }
    response.json(competitor);
  });

  app.get("/api/competitor-folders", (request, response) => {
    const organizationId = sessionOrganizationId(request);
    response.setHeader(
      "Cache-Control",
      "private, max-age=15, stale-while-revalidate=30",
    );
    response.json(store.listCompetitorFolders(organizationId));
  });

  app.get("/api/category-products/:asin/link", (request, response) => {
    const ctx = requireSessionContext(request);
    const result = store.getCategoryProductLink(
      request.params.asin,
      optionalNumber(request.query.categoryId),
      ctx.organization.id,
    );
    if (!result) {
      response.status(404).json({ message: "category product link not found" });
      return;
    }
    response.json(result);
  });

  app.get("/api/category-products/:asin/open", (request, response) => {
    const ctx = requireSessionContext(request);
    const result = store.getCategoryProductLink(
      request.params.asin,
      optionalNumber(request.query.categoryId),
      ctx.organization.id,
    );
    if (!result) {
      response.status(404).json({ message: "category product link not found" });
      return;
    }
    if (!isAmazonUrl(result.url)) {
      response
        .status(400)
        .json({ message: "Invalid redirect URL: not an Amazon domain" });
      return;
    }
    response.redirect(result.url);
  });

  app.get("/api/competitors/:asin/link", (request, response) => {
    const result = store.getProductLink(
      request.params.asin,
      optionalNumber(request.query.keywordId),
      sessionOrganizationId(request),
    );
    if (!result) {
      response.status(404).json({ message: "product link not found" });
      return;
    }
    response.json(result);
  });

  app.get("/api/competitors/:asin/open", (request, response) => {
    const result = store.getProductLink(
      request.params.asin,
      optionalNumber(request.query.keywordId),
      sessionOrganizationId(request),
    );
    if (!result) {
      response.status(404).json({ message: "product link not found" });
      return;
    }
    if (!isAmazonUrl(result.url)) {
      response
        .status(400)
        .json({ message: "Invalid redirect URL: not an Amazon domain" });
      return;
    }
    response.redirect(result.url);
  });

  app.get("/api/products/:asin/activity-calendar", (request, response) => {
    const organizationId = sessionOrganizationId(request);
    const query = validateQuery(limitDaysQuerySchema, request.query);
    response.setHeader(
      "Cache-Control",
      "private, max-age=30, stale-while-revalidate=60",
    );
    const result = store.getProductActivityCalendar(request.params.asin, {
      orgId: organizationId,
      marketplace: optionalString(request.query.marketplace),
      date: optionalString(request.query.date),
      limitDays: query.limitDays,
    });
    if (!result) {
      response
        .status(404)
        .json({ message: "product activity calendar not found" });
      return;
    }
    const activityDates = new Set(result.days.map((day) => day.date));
    const insightEvents = store
      .listInsightEvents({
        orgId: organizationId,
        asin: result.asin,
        eventType: "LISTING_CHANGED",
        limit: 1000,
      })
      .filter((event) => activityDates.has(event.eventDate));
    response.json({
      ...result,
      summary: {
        ...result.summary,
        eventCount: result.summary.eventCount + insightEvents.length,
      },
      insightEvents,
    });
  });

  app.patch("/api/competitors/:asin/key", (request, response) => {
    requireCompetitorManagement(request);
    const ctx = requireSessionContext(request);
    const data = validateBody(competitorKeySchema, request.body);
    const result = store.setKeyCompetitor(
      request.params.asin,
      data.isKeyCompetitor,
      ctx.organization.id,
    );
    if (!result) {
      response.status(404).json({ message: "competitor not found" });
      return;
    }
    response.json(result);
  });
}

function parseCompetitorSourceType(
  value: unknown,
): CompetitorSourceType | undefined {
  return value === "keyword" ||
    value === "category" ||
    value === "hybrid" ||
    value === "manual"
    ? value
    : undefined;
}

function formatValidationIssues(
  issues: Array<{ path: PropertyKey[]; message: string }>,
): string {
  const labels: Record<string, string> = {
    asin: "ASIN",
    marketplace: "站点",
    title: "商品标题",
    brand: "品牌",
  };
  return issues
    .map((issue) => {
      const label = labels[String(issue.path[0])] ?? issue.path.join(".");
      return issue.message.startsWith(label)
        ? issue.message
        : `${label}: ${issue.message}`;
    })
    .join("; ");
}

function parseCompetitorTier(
  value: unknown,
): "core" | "rising" | "activity" | "watch" | undefined {
  return value === "core" ||
    value === "rising" ||
    value === "activity" ||
    value === "watch"
    ? value
    : undefined;
}
