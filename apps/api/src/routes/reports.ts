import type { Express } from "express";
import { buildNotificationExcelAttachment } from "../excel-report.js";
import { appendDailyInsightReportMarkdown, collectDailyInsightReportData } from "../reports/insight-report.js";
import { summarizePeriodInsightReport } from "../reports/period-insight-ai-summary.js";
import { buildPeriodInsightReport } from "../reports/period-insight-report.js";
import type { Store } from "../store.js";
import { asyncHandler, getDate, optionalNumber, optionalString } from "./http-utils.js";
import { validateQuery } from "./validation.js";
import { z } from "zod";

const periodInsightReportQuerySchema = z.object({
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  period: z.enum(["weekly", "monthly"]).default("weekly"),
  includeAiSummary: z.enum(["true", "false"]).default("false").transform((value) => value === "true")
});

export function registerReportRoutes(app: Express, store: Store): void {
  app.get("/api/reports/category", (request, response) => {
    const date = getDate(request);
    const categoryId = optionalNumber(request.query.categoryId);
    response.json({
      date,
      categoryId: categoryId ?? null,
      markdown: store.getCategoryReport(date, categoryId)
    });
  });

  app.get("/api/reports/daily", (request, response) => {
    const date = getDate(request);
    const keyword = optionalString(request.query.keyword);
    const markdown = store.getDailyReport(date, keyword);
    response.json({
      date,
      keyword: keyword ?? null,
      markdown: keyword ? markdown : appendDailyInsightReportMarkdown(markdown, collectDailyInsightReportData(store, date))
    });
  });

  app.get("/api/reports/daily.xlsx", (request, response) => {
    const date = getDate(request);
    const attachment = buildNotificationExcelAttachment(store, date);
    response.setHeader("Content-Type", attachment.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${attachment.filename}"`);
    response.send(attachment.content);
  });

  app.get("/api/reports/insights/period", asyncHandler(async (request, response) => {
    const query = validateQuery(periodInsightReportQuerySchema, request.query);
    const report = buildPeriodInsightReport(store, {
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
