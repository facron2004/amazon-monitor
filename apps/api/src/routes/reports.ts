import { hasBusinessCapability, type SessionContext } from "@amazon-monitor/shared";
import type { Express, Request, Response } from "express";
import { buildNotificationExcelAttachment } from "../excel-report.js";
import { generateDailyWorkflowReport } from "../reports/daily-workflow-report.js";
import { buildDailyReportReadiness } from "../reports/daily-report-readiness.js";
import { appendDailyInsightReportMarkdown, collectDailyInsightReportData } from "../reports/insight-report.js";
import { summarizePeriodInsightReport } from "../reports/period-insight-ai-summary.js";
import { buildPeriodInsightReport } from "../reports/period-insight-report.js";
import {
  renderReportPdf,
  type ReportPdfRenderer
} from "../reports/report-pdf.js";
import { generatePeriodWorkflowReport } from "../reports/period-workflow-report.js";
import type { Store } from "../store.js";
import { asyncHandler, getDate, optionalNumber, optionalString } from "./http-utils.js";
import { validateBody, validateQuery } from "./validation.js";
import { z } from "zod";

const periodInsightReportQuerySchema = z.object({
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  period: z.enum(["weekly", "monthly"]).default("weekly"),
  includeAiSummary: z.enum(["true", "false"]).default("false").transform((value) => value === "true")
});

const reportDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const periodReportSchema = z.object({
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period: z.enum(["weekly", "monthly"])
});

const dailyReportHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(30),
  offset: z.coerce.number().int().min(0).default(0)
});

const periodReportHistoryQuerySchema = z.object({
  period: z.enum(["weekly", "monthly"]).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(30),
  offset: z.coerce.number().int().min(0).default(0)
});

export function registerReportRoutes(
  app: Express,
  store: Store,
  options: { reportPdfRenderer?: ReportPdfRenderer } = {}
): void {
  const reportPdfRenderer = options.reportPdfRenderer ?? renderReportPdf;
  app.get("/api/reports/category", (request, response) => {
    const ctx = requireSessionContext(request);
    const date = getDate(request);
    const categoryId = optionalNumber(request.query.categoryId);
    response.json({
      date,
      categoryId: categoryId ?? null,
      markdown: store.getCategoryReport(date, categoryId, ctx.organization.id)
    });
  });

  app.get("/api/reports/daily", (request, response) => {
    const ctx = requireSessionContext(request);
    const date = getDate(request);
    const keyword = optionalString(request.query.keyword);
    const markdown = store.getDailyReport(date, keyword, ctx.organization.id);
    response.json({
      date,
      keyword: keyword ?? null,
      markdown: keyword
        ? markdown
        : appendDailyInsightReportMarkdown(markdown, collectDailyInsightReportData(store, date, ctx.organization.id))
    });
  });

  app.get("/api/reports/daily/archive", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(reportDateSchema, request.query);
    response.json(store.getDailyReportArchive(ctx.organization.id, query.date));
  }));

  app.get("/api/reports/daily/readiness", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(reportDateSchema, request.query);
    response.json(buildDailyReportReadiness(store, {
      date: query.date,
      orgId: ctx.organization.id
    }));
  }));

  app.get("/api/reports/daily/history", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(dailyReportHistoryQuerySchema, request.query);
    response.json({
      items: store.listDailyReportArchives({
        orgId: ctx.organization.id,
        limit: query.limit,
        offset: query.offset
      }),
      total: store.countDailyReportArchives(ctx.organization.id),
      limit: query.limit,
      offset: query.offset
    });
  }));

  app.get("/api/reports/daily.md", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(reportDateSchema, request.query);
    const report = store.getDailyReportArchive(ctx.organization.id, query.date);
    if (!report) {
      response.status(404).json({ message: "Daily report archive not found" });
      return;
    }
    response.setHeader("Content-Type", "text/markdown; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="operations-daily-${query.date}.md"`);
    response.send(report.markdown);
  }));

  app.get("/api/reports/daily.pdf", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireReportManagement(ctx);
    const query = validateQuery(reportDateSchema, request.query);
    const report = store.getDailyReportArchive(ctx.organization.id, query.date);
    if (!report) {
      response.status(404).json({ message: "Daily report archive not found" });
      return;
    }
    const pdf = await reportPdfRenderer({
      title: "跨境电商运营日报",
      subtitle: `业务日期 ${report.reportDate}`,
      markdown: report.markdown,
      version: report.version,
      coverageStatus: report.coverageStatus,
      generatedAt: report.generatedAt,
      generatedByName: report.generatedByName
    });
    sendPdf(response, pdf, `operations-daily-${query.date}.pdf`);
  }));

  app.post("/api/reports/daily/generate", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireReportManagement(ctx);
    const data = validateBody(reportDateSchema, request.body);
    response.status(201).json(generateDailyWorkflowReport(store, {
      date: data.date,
      orgId: ctx.organization.id,
      generatedBy: ctx.user.id
    }));
  }));

  app.get("/api/reports/daily.xlsx", (request, response) => {
    const ctx = requireSessionContext(request);
    const date = getDate(request);
    const attachment = buildNotificationExcelAttachment(store, date, ctx.organization.id);
    response.setHeader("Content-Type", attachment.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${attachment.filename}"`);
    response.send(attachment.content);
  });

  app.get("/api/reports/period/archive", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(periodReportSchema, request.query);
    response.json(store.getPeriodReportArchive(ctx.organization.id, query.period, query.endDate));
  }));

  app.get("/api/reports/period/history", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(periodReportHistoryQuerySchema, request.query);
    response.json({
      items: store.listPeriodReportArchives({
        orgId: ctx.organization.id,
        period: query.period,
        limit: query.limit,
        offset: query.offset
      }),
      total: store.countPeriodReportArchives(ctx.organization.id, query.period),
      limit: query.limit,
      offset: query.offset
    });
  }));

  app.get("/api/reports/period.md", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireReportManagement(ctx);
    const query = validateQuery(periodReportSchema, request.query);
    const report = store.getPeriodReportArchive(ctx.organization.id, query.period, query.endDate);
    if (!report) {
      response.status(404).json({ message: "Period report archive not found" });
      return;
    }
    response.setHeader("Content-Type", "text/markdown; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="operations-${query.period}-${query.endDate}.md"`
    );
    response.send(report.markdown);
  }));

  app.get("/api/reports/period.pdf", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireReportManagement(ctx);
    const query = validateQuery(periodReportSchema, request.query);
    const report = store.getPeriodReportArchive(ctx.organization.id, query.period, query.endDate);
    if (!report) {
      response.status(404).json({ message: "Period report archive not found" });
      return;
    }
    const periodLabel = query.period === "weekly" ? "周报" : "月报";
    const pdf = await reportPdfRenderer({
      title: `跨境电商运营${periodLabel}`,
      subtitle: `${report.startDate} - ${report.endDate}`,
      markdown: report.markdown,
      version: report.version,
      coverageStatus: report.coverageStatus,
      generatedAt: report.generatedAt,
      generatedByName: report.generatedByName
    });
    sendPdf(response, pdf, `operations-${query.period}-${query.endDate}.pdf`);
  }));

  app.post("/api/reports/period/generate", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireReportManagement(ctx);
    const data = validateBody(periodReportSchema, request.body);
    response.status(201).json(generatePeriodWorkflowReport(store, {
      orgId: ctx.organization.id,
      period: data.period,
      endDate: data.endDate,
      generatedBy: ctx.user.id
    }));
  }));

  app.get("/api/reports/insights/period", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(periodInsightReportQuerySchema, request.query);
    const report = buildPeriodInsightReport(store, {
      orgId: ctx.organization.id,
      endDate: query.endDate ?? query.date ?? getDate(request),
      period: query.period
    });
    if (!query.includeAiSummary) {
      response.json(report);
      return;
    }
    response.json({
      ...report,
      aiSummary: await summarizePeriodInsightReport(report)
    });
  }));
}

function requireSessionContext(request: Request): SessionContext {
  const ctx = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!ctx) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  return ctx;
}

function requireReportManagement(ctx: SessionContext): void {
  if (!hasBusinessCapability(ctx.user.role, "manage_reports")) {
    throw Object.assign(new Error("Forbidden: role cannot generate reports"), { statusCode: 403 });
  }
}

function sendPdf(
  response: Response,
  pdf: Buffer,
  filename: string
): void {
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  response.setHeader("Content-Length", pdf.length);
  response.send(pdf);
}
