import type { BestsellerRankSnapshot, DashboardSummary } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { buildInsightHtmlSections, buildInsightTextSections, collectDailyInsightReportData } from "../reports/insight-report.js";
import { cleanEnvValue } from "./env.js";
import { escapeHtml } from "./text-utils.js";

export function buildNotificationContent(store: Store, date: string, summary?: DashboardSummary): string {
  const report = store.getDailyReport(date);
  const categoryReport = store.getCategoryReport(date);
  const combinedReport = [categoryReport, report].filter((item) => item.trim()).join("\n\n---\n\n");
  const insightData = collectDailyInsightReportData(store, date);
  if (combinedReport.trim()) {
    return appendBsrPromoTextSummary(appendInsightTextSummary(combinedReport, insightData), store, date);
  }

  const dashSummary = summary ?? store.getDashboardSummary(date);
  const alerts = store.listAlerts({ date, limit: 10 });
  const categorySignals = store.listCategorySignals({ date, limit: 10 });
  const bsrPromoLines = bsrPromoItems(store, date, 10).map(
    (item) => `- #${item.rank} ${item.categoryName} ${item.asin}: ${promoText(item)}`
  );
  return [
    "# Amazon Keyword Monitor Daily Report",
    "",
    `Date: ${date}`,
    `Active keywords: ${dashSummary.activeKeywordCount}`,
    `Active categories: ${dashSummary.activeCategoryCount}`,
    `Snapshots: ${dashSummary.todaySnapshotCount}`,
    `Category snapshots: ${dashSummary.categorySnapshotCount}`,
    `Competitors: ${dashSummary.competitorCount}`,
    `Alerts: ${dashSummary.alertCount}`,
    `Category signals: ${dashSummary.categorySignalCount}`,
    "",
    "## Top alerts",
    ...(alerts.length ? alerts.map((alert) => `- [${alert.alertLevel}] ${alert.keyword} ${alert.asin}: ${alert.alertContent}`) : ["- No keyword alerts"]),
    "",
    "## Top category signals",
    ...(categorySignals.length
      ? categorySignals.map((signal) => `- [${signal.alertLevel}] ${signal.categoryName} ${signal.asin ?? ""}: ${signal.content}`)
      : ["- No category signals"]),
    "",
    ...buildInsightTextSections(insightData),
    "",
    "## BSR Coupon / Deal",
    ...(bsrPromoLines.length ? bsrPromoLines : ["- No BSR coupon/deal items"])
  ].join("\n");
}

export function buildFeishuNotificationContent(store: Store, date: string, summary?: DashboardSummary, excelUrl = buildReportExcelDownloadUrl(date)): string {
  const content = buildNotificationContent(store, date, summary);
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

export function buildNotificationSummaryHtmlContent(store: Store, date: string, summary?: DashboardSummary): string {
  const dashSummary = summary ?? store.getDashboardSummary(date);
  const alerts = store.listAlerts({ date, limit: 5 });
  const categorySignals = store.listCategorySignals({ date, limit: 5 });
  const bsrPromos = bsrPromoItems(store, date, 8);
  const insightData = collectDailyInsightReportData(store, date);
  const rows = [
    ["启用关键词", dashSummary.activeKeywordCount],
    ["启用类目", dashSummary.activeCategoryCount],
    ["关键词快照 ASIN", dashSummary.todaySnapshotCount],
    ["类目榜单 ASIN", dashSummary.categorySnapshotCount],
    ["竞品池 ASIN", dashSummary.competitorCount],
    ["关键词告警", dashSummary.alertCount],
    ["类目信号", dashSummary.categorySignalCount]
  ];

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Amazon Monitor Daily Report ${escapeHtml(date)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f1;font-family:'Segoe UI','Microsoft YaHei',Arial,sans-serif;color:#20211f;">
  <div style="max-width:760px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border:1px solid #dddfd7;border-radius:8px;overflow:hidden;">
      <div style="padding:22px 24px;background:#20211f;color:#f7f7f1;">
        <div style="font-size:12px;letter-spacing:.08em;color:#99f6e4;text-transform:uppercase;">Amazon Competitive Intelligence</div>
        <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;">每日监控报告</h1>
        <div style="margin-top:6px;font-size:13px;color:#c9cdc4;">报告日期：${escapeHtml(date)}</div>
      </div>
      <div style="padding:22px 24px;">
        <p style="margin:0 0 14px;font-size:14px;line-height:1.7;">
          本次邮件正文只保留摘要，完整数据已整理为 Excel 附件：
          <strong>amazon-monitor-${escapeHtml(date)}.xlsx</strong>。
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin:14px 0 18px;">
          <tbody>
            ${rows
              .map(
                ([label, value]) =>
                  `<tr><td style="padding:10px;border-bottom:1px solid #e2e4dd;color:#686c63;">${escapeHtml(String(label))}</td><td style="padding:10px;border-bottom:1px solid #e2e4dd;text-align:right;font-weight:700;">${escapeHtml(String(value))}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
        <h2 style="margin:18px 0 8px;font-size:15px;">重点关键词告警</h2>
        <ul style="margin:0 0 14px;padding-left:18px;font-size:13px;line-height:1.65;">
          ${
            alerts.length
              ? alerts.map((alert) => `<li>[${escapeHtml(alert.alertLevel)}] ${escapeHtml(alert.keyword)} ${escapeHtml(alert.asin)}：${escapeHtml(alert.alertContent)}</li>`).join("")
              : "<li>暂无关键词告警</li>"
          }
        </ul>
        <h2 style="margin:18px 0 8px;font-size:15px;">重点类目信号</h2>
        <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.65;">
          ${
            categorySignals.length
              ? categorySignals
                  .map((signal) => `<li>[${escapeHtml(signal.alertLevel)}] ${escapeHtml(signal.categoryName)} ${escapeHtml(signal.asin ?? "")}：${escapeHtml(signal.content)}</li>`)
                  .join("")
              : "<li>暂无类目信号</li>"
          }
        </ul>
        ${buildInsightHtmlSections(insightData)}
        <h2 style="margin:18px 0 8px;font-size:15px;">BSR Coupon / Deal</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin:0;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e4dd;color:#686c63;">Rank</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e4dd;color:#686c63;">ASIN</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e4dd;color:#686c63;">Product</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e4dd;color:#686c63;">Coupon / Deal</th>
            </tr>
          </thead>
          <tbody>
            ${
              bsrPromos.length
                ? bsrPromos
                    .map(
                      (item) =>
                        `<tr><td style="padding:8px;border-bottom:1px solid #eef0ea;">#${escapeHtml(String(item.rank))}</td><td style="padding:8px;border-bottom:1px solid #eef0ea;font-weight:700;">${escapeHtml(item.asin)}</td><td style="padding:8px;border-bottom:1px solid #eef0ea;">${escapeHtml(item.title.slice(0, 80))}</td><td style="padding:8px;border-bottom:1px solid #eef0ea;color:#b45309;font-weight:700;">${escapeHtml(promoText(item) ?? "-")}</td></tr>`
                    )
                    .join("")
                : `<tr><td colspan="4" style="padding:8px;border-bottom:1px solid #eef0ea;color:#686c63;">No BSR coupon/deal items</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function appendBsrPromoTextSummary(content: string, store: Store, date: string): string {
  const lines = bsrPromoItems(store, date, 10).map((item) => `- #${item.rank} ${item.categoryName} ${item.asin}: ${promoText(item)}`);
  if (!lines.length) {
    return content;
  }
  return [content, "", "## BSR Coupon / Deal", ...lines].join("\n");
}

function appendInsightTextSummary(content: string, insightData: ReturnType<typeof collectDailyInsightReportData>): string {
  if (!insightData.insightEvents.length && !insightData.reviewDueEvents.length && !insightData.reviewedEvents.length) {
    return content;
  }
  return [content, "", ...buildInsightTextSections(insightData)].join("\n");
}

function bsrPromoItems(store: Store, date: string, limit: number): BestsellerRankSnapshot[] {
  return store
    .listCategorySnapshots({ date, limit: 2000 })
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
