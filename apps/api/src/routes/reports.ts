import type { Express } from "express";
import { buildNotificationExcelAttachment } from "../excel-report.js";
import type { Store } from "../store.js";
import { getDate, optionalNumber, optionalString } from "./http-utils.js";

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
}
