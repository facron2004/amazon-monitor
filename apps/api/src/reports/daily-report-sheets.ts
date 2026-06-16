import type { WorkbookSheet } from "./excel-workbook.js";
import type { Store } from "../store.js";
import { collectDailyReportData } from "./daily-report-data.js";
import { buildDailyBsrSheets } from "./daily-bsr-sheets.js";
import { buildDailyCoreSheets } from "./daily-core-sheets.js";

export function buildReportSheets(store: Store, date: string): WorkbookSheet[] {
  const data = collectDailyReportData(store, date);
  return [...buildDailyCoreSheets(data, date), ...buildDailyBsrSheets(data)];
}
