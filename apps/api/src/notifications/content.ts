import type { BestsellerRankSnapshot, DashboardSummary } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import {
  appendDailyInsightReportMarkdown,
  buildInsightTextSections
} from "../reports/insight-report.js";
import { cleanEnvValue } from "./env.js";
import {
  buildNotificationBriefText,
  collectNotificationBriefData,
  type NotificationBriefData
} from "./intelligence-brief.js";
import { buildNotificationBriefHtml } from "./intelligence-brief-renderer.js";

export function buildNotificationContent(store: Store, date: string, summary?: DashboardSummary, orgId = 1): string {
  return buildNotificationContentFromBrief(store, date, collectNotificationBriefData(store, date, summary, orgId), orgId);
}

export function buildNotificationEmailContents(
  store: Store,
  date: string,
  summary?: DashboardSummary,
  orgId = 1
): { content: string; htmlContent: string } {
  const brief = collectNotificationBriefData(store, date, summary, orgId);
  return {
    content: buildNotificationContentFromBrief(store, date, brief, orgId),
    htmlContent: buildNotificationHtmlFromBrief(brief, date)
  };
}

function buildNotificationContentFromBrief(store: Store, date: string, brief: NotificationBriefData, orgId: number): string {
  const report = store.getDailyReport(date, undefined, orgId);
  const categoryReport = store.getCategoryReport(date, undefined, orgId);
  const combinedReport = [categoryReport, report].filter((item) => item.trim()).join("\n\n---\n\n");
  const insightDetails = combinedReport.trim()
    ? appendDailyInsightReportMarkdown(combinedReport, brief.insightData)
    : buildInsightTextSections(brief.insightData).join("\n");
  const bsrPromoLines = bsrPromoTextLines(store, date, 10, orgId);
  return [
    buildNotificationBriefText(brief, {
      dashboardUrl: buildNotificationDashboardUrl(date),
      reportUrl: buildReportExcelDownloadUrl(date)
    }),
    "",
    insightDetails,
    "",
    "## BSR Coupon / Deal",
    ...(bsrPromoLines.length ? bsrPromoLines : ["- No BSR coupon/deal items"])
  ].join("\n");
}

export function buildFeishuNotificationContent(
  store: Store,
  date: string,
  summary?: DashboardSummary,
  excelUrl = buildReportExcelDownloadUrl(date),
  orgId = 1
): string {
  const content = buildNotificationContent(store, date, summary, orgId);
  return [
    content,
    "",
    "## Excel report",
    excelUrl
      ? `Download: ${excelUrl}`
      : "Excel download link is not configured. Set PUBLIC_BASE_URL to let Feishu messages include the .xlsx report link."
  ].join("\n");
}

export function buildReportExcelDownloadUrl(date: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const baseUrl = cleanEnvValue(env.PUBLIC_BASE_URL);
  if (!baseUrl) {
    return null;
  }
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return `${normalizedBaseUrl}/api/reports/daily.xlsx?date=${encodeURIComponent(date)}`;
}

export function buildNotificationSummaryHtmlContent(store: Store, date: string, summary?: DashboardSummary, orgId = 1): string {
  return buildNotificationHtmlFromBrief(collectNotificationBriefData(store, date, summary, orgId), date);
}

function buildNotificationHtmlFromBrief(brief: NotificationBriefData, date: string): string {
  return buildNotificationBriefHtml(brief, {
    dashboardUrl: buildNotificationDashboardUrl(date),
    reportUrl: buildReportExcelDownloadUrl(date)
  });
}

export function buildNotificationDashboardUrl(date: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const baseUrl = cleanEnvValue(env.PUBLIC_BASE_URL);
  if (!baseUrl) return null;
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return `${normalizedBaseUrl}/?source=email&date=${encodeURIComponent(date)}`;
}

function bsrPromoTextLines(store: Store, date: string, limit: number, orgId: number): string[] {
  return bsrPromoItems(store, date, limit, orgId).map((item) => `- #${item.rank} ${item.categoryName} ${item.asin}: ${promoText(item)}`);
}

function bsrPromoItems(store: Store, date: string, limit: number, orgId: number): BestsellerRankSnapshot[] {
  return store
    .listCategorySnapshots({ orgId, date, limit: 2000 })
    .filter((item) => promoText(item) !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
}

function validCouponText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text && text.length <= 90 && /\b(coupon|save)\b/i.test(text) ? text : null;
}

function validDealBadge(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text &&
    text.length <= 90 &&
    /\b(limited\s+time\s+deal|prime[\s-]*exclusive\s+(?:deal|savings)|prime[\s-]*day'?s?[\s-]*(?:deals?|exclusive|savings|sale)|prime[\s-]*big[\s-]*deal[\s-]*days?|prime[\s-]*early[\s-]*access[\s-]*deal|prime[\s-]*member[\s-]*exclusive[\s-]*deal|deal\s+of\s+the\s+day|lightning\s+deal|black\s+friday\s+deal|cyber\s+monday\s+deal)\b|^deal$/i.test(text)
    ? text
    : null;
}

function promoText(item: { couponText?: string | null; dealBadge?: string | null } | null | undefined): string | null {
  const values = [validCouponText(item?.couponText), validDealBadge(item?.dealBadge)].filter((value): value is string => Boolean(value));
  return values.length ? values.join(" / ") : null;
}
