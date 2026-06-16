import { buildWorkbookBuffer } from "./reports/excel-workbook.js";
import { buildReportSheets } from "./reports/daily-report-sheets.js";
import type { Store } from "./store.js";

export interface NotificationAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export function buildNotificationExcelAttachment(store: Store, date: string): NotificationAttachment {
  const workbook = buildWorkbookBuffer(buildReportSheets(store, date));
  return {
    filename: `amazon-monitor-${date}.xlsx`,
    content: workbook,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  };
}
