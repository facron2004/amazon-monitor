import { buildInsightHtmlSections } from "../reports/insight-report.js";
import { escapeHtml } from "./text-utils.js";
import { buildExecutiveSummary, type NotificationBriefData, type NotificationBriefEvent, type NotificationBriefKeywordMovement, type NotificationBriefLinks, type NotificationBriefPriceAlert } from "./intelligence-brief.js";

export function buildNotificationBriefHtml(data: NotificationBriefData, links: NotificationBriefLinks = {}): string {
  const criticalColor = data.criticalCount > 0 ? "#dc2626" : "#64748b";
  const dashboardLink = renderButtonLink(links.dashboardUrl, "View Full Market Brief →");
  const reportLink = renderInlineLink(links.reportUrl, "Download Excel evidence");
  const criticalHtml = data.criticalEvents.length
    ? data.criticalEvents.map((event) => renderCriticalEvent(event, links.dashboardUrl)).join("")
    : renderEmptyState("No critical or important events recorded for this date.");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Amazon Intelligence Brief ${escapeHtml(data.date)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI','Microsoft YaHei',Arial,sans-serif;color:#172033;">
  <div style="width:100%;background:#f1f5f9;padding:24px 0;">
    <table role="presentation" style="width:100%;max-width:720px;margin:0 auto;border-collapse:separate;border-spacing:0;">
      <tr><td style="padding:0 12px;">
        <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr><td style="padding:24px 24px 20px;background:#111827;color:#f8fafc;">
            <div style="font-size:11px;letter-spacing:.14em;color:#67e8f9;text-transform:uppercase;">Amazon Competitive Intelligence</div>
            <div style="margin-top:8px;font-size:25px;line-height:1.2;font-weight:700;">Daily Intelligence Brief</div>
            <div style="margin-top:8px;font-size:13px;line-height:1.6;color:#cbd5e1;">${escapeHtml(data.date)} · ${escapeHtml(data.monitorScope)}</div>
            <table role="presentation" style="width:100%;margin-top:18px;border-collapse:separate;border-spacing:8px 0;"><tr>
              ${renderHeaderMetric(`${data.criticalCount} Critical`, criticalColor)}
              ${renderHeaderMetric(`${data.productsChanged} Products Changed`, "#22d3ee")}
              ${renderHeaderMetric(`${data.summary.todaySnapshotCount + data.summary.categorySnapshotCount} Snapshots`, "#a7f3d0")}
            </tr></table>
          </td></tr>
          <tr><td style="padding:20px 24px 24px;">
            ${renderSectionHeading("TODAY IN 30 SECONDS", "先结论，再展开证据")}
            <table role="presentation" style="width:100%;border-collapse:collapse;">${buildExecutiveSummary(data).map((line) => `<tr><td style="padding:7px 0;font-size:14px;line-height:1.6;border-bottom:1px solid #f1f5f9;">${escapeHtml(line)}</td></tr>`).join("")}</table>
            ${dashboardLink}

            ${renderSectionHeading("CRITICAL ALERTS", "最多展示 5 个已归并的高价值事件")}
            ${criticalHtml}

            ${renderSectionHeading("MARKET MOVEMENT", "今天整个监控范围发生了什么")}
            ${renderMarketMetrics(data)}

            ${renderSectionHeading("LEADERBOARD MOVERS", "BSR 变化 Top 3")}
            ${renderMovers(data)}

            ${renderSectionHeading("PRICE & PROMOTION WATCH", "BSR Coupon / Deal、价格与促销的高价值变化")}
            ${renderPriceAlerts(data.priceAlerts)}

            ${renderSectionHeading("KEYWORD MOVEMENT", "关键词排名变化 Top 5")}
            ${renderKeywordMovements(data.keywordMovements)}

            ${renderSectionHeading("OTHER CHANGES", `${data.otherChanges.total} 个普通变化已压缩汇总`)}
            ${renderOtherChanges(data)}

            ${renderSectionHeading("ACTION CENTER FOLLOW-UP", "需要继续处理的事项")}
            ${data.insightData.insightEvents.length || data.insightData.reviewDueEvents.length || data.insightData.reviewedEvents.length
              ? buildInsightHtmlSections(data.insightData)
              : renderEmptyState("No follow-up actions recorded for this date.")}
          </td></tr>
          <tr><td style="padding:18px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
            <div style="font-size:12px;line-height:1.6;color:#64748b;">重点变化已整理在正文；完整明细仍保留在 Excel 附件中。${reportLink ? ` ${reportLink}` : ""}</div>
            ${links.dashboardUrl ? `<div style="margin-top:8px;font-size:12px;line-height:1.6;color:#64748b;">Dashboard：<a href="${escapeAttribute(links.dashboardUrl)}" style="color:#0369a1;">${escapeHtml(links.dashboardUrl)}</a></div>` : ""}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>
</body>
</html>`;
}

function renderCriticalEvent(event: NotificationBriefEvent, dashboardUrl?: string | null): string {
  const borderColor = event.severity === "critical" ? "#dc2626" : "#f59e0b";
  const metrics = event.metrics.slice(0, 4);
  const image = event.imageUrl
    ? `<img src="${escapeAttribute(event.imageUrl)}" width="52" height="52" alt="" style="display:block;width:52px;height:52px;border-radius:8px;object-fit:cover;background:#f1f5f9;">`
    : `<div style="width:52px;height:52px;border-radius:8px;background:#e2e8f0;color:#64748b;text-align:center;line-height:52px;font-size:12px;">ASIN</div>`;
  const primary = event.primaryMetric
    ? `<div style="margin-top:16px;padding:14px 16px;background:#f8fafc;border-radius:8px;"><div style="font-size:11px;letter-spacing:.08em;color:#64748b;text-transform:uppercase;">${escapeHtml(event.primaryMetric.label)}</div><div style="margin-top:4px;font-size:25px;line-height:1.2;font-weight:700;color:#0f172a;">${escapeHtml(event.primaryMetric.before)} <span style="color:#94a3b8;font-size:18px;">→</span> ${escapeHtml(event.primaryMetric.now)} ${event.primaryMetric.delta ? `<span style="font-size:12px;color:${event.primaryMetric.delta.startsWith("↑") ? "#059669" : "#dc2626"};">${escapeHtml(event.primaryMetric.delta)}</span>` : ""}</div></div>`
    : "";
  const metricTable = metrics.length > 1
    ? `<table role="presentation" style="width:100%;margin-top:12px;border-collapse:collapse;font-size:12px;">${metrics.map((metric) => `<tr><td style="padding:6px 0;color:#64748b;border-bottom:1px solid #f1f5f9;">${escapeHtml(metric.label)}</td><td style="padding:6px 0;text-align:right;color:#334155;border-bottom:1px solid #f1f5f9;">${escapeHtml(metric.before)} → ${escapeHtml(metric.now)}${metric.delta ? ` <span style="color:#059669;">${escapeHtml(metric.delta)}</span>` : ""}</td></tr>`).join("")}</table>`
    : "";
  return `<table role="presentation" style="width:100%;margin:0 0 12px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e2e8f0;border-left:4px solid ${borderColor};border-radius:8px;"><tr><td style="padding:16px;">
    <div style="font-size:11px;letter-spacing:.08em;color:${borderColor};font-weight:700;text-transform:uppercase;">${escapeHtml(event.tag)}</div>
    <table role="presentation" style="width:100%;margin-top:10px;border-collapse:collapse;"><tr><td style="width:64px;vertical-align:top;">${image}</td><td style="padding-left:12px;vertical-align:top;"><div style="font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(event.brand ?? "Unknown brand")}</div><div style="margin-top:3px;font-size:13px;line-height:1.45;color:#334155;">${escapeHtml(event.productTitle ?? event.asin ?? "Market event")}</div><div style="margin-top:3px;font-size:11px;color:#64748b;">ASIN ${escapeHtml(event.asin ?? "-")}</div></td></tr></table>
    ${primary}${metricTable}
    <div style="margin-top:13px;padding-top:12px;border-top:1px solid #f1f5f9;font-size:12px;line-height:1.6;color:#475569;"><strong style="color:#0f172a;">Why it matters</strong><br>${escapeHtml(event.insight)}</div>
    <div style="margin-top:9px;font-size:12px;line-height:1.6;color:#475569;"><strong style="color:#0f172a;">Recommended action</strong><br>${escapeHtml(event.action)}</div>
    <div style="margin-top:12px;">${renderInlineLink(event.productUrl, "View Listing →")}${renderInlineLink(dashboardUrl, "View History →")}</div>
  </td></tr></table>`;
}

function renderMarketMetrics(data: NotificationBriefData): string {
  const metrics: Array<[number, string]> = [[data.productsChanged, "Products Changed"], [data.marketMetrics.priceDrops, "Price Drops"], [data.marketMetrics.rankingSurges, "Ranking Surges"], [data.marketMetrics.newListings, "New Listings"]];
  return `<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:6px;"><tr>${metrics.slice(0, 2).map(([value, label]) => renderKpiCell(value, label)).join("")}</tr><tr>${metrics.slice(2).map(([value, label]) => renderKpiCell(value, label)).join("")}</tr></table><div style="margin:10px 6px 0;padding:11px 12px;background:#f8fafc;border-radius:6px;font-size:12px;line-height:1.6;color:#475569;">${escapeHtml(data.marketMetrics.activityInsight)}</div>`;
}

function renderMovers(data: NotificationBriefData): string {
  const rows = [...data.rankingMovers.gainers, ...data.rankingMovers.losers];
  if (!rows.length) return renderEmptyState("No BSR movers recorded for this date.");
  return `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:12px;">${rows.map((mover) => `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;color:${mover.direction === "up" ? "#059669" : "#dc2626"};font-size:16px;font-weight:700;">${mover.direction === "up" ? "↑" : "↓"}</td><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-weight:700;color:#0f172a;">${escapeHtml(mover.label)}<div style="font-size:11px;font-weight:400;color:#64748b;">${escapeHtml(mover.asin)}</div></td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #f1f5f9;font-weight:700;color:#334155;">${escapeHtml(formatRank(mover.previousRank))} → ${escapeHtml(formatRank(mover.currentRank))}</td></tr>`).join("")}</table>`;
}

function renderPriceAlerts(alerts: NotificationBriefPriceAlert[]): string {
  if (!alerts.length) return renderEmptyState("No price or promotion alerts recorded for this date.");
  return `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:12px;">${alerts.map((alert) => `<tr><td style="padding:9px 0;border-bottom:1px solid #f1f5f9;width:88px;"><span style="display:inline-block;padding:3px 6px;background:#fff7ed;color:#c2410c;border-radius:4px;font-size:10px;font-weight:700;">${escapeHtml(alert.label)}</span></td><td style="padding:9px 8px;border-bottom:1px solid #f1f5f9;"><strong style="color:#0f172a;">${escapeHtml(alert.brand ?? alert.asin)}</strong><div style="margin-top:2px;color:#64748b;">${escapeHtml(alert.asin)} · ${escapeHtml(compactText(alert.title, 70))}</div></td><td style="padding:9px 0;text-align:right;border-bottom:1px solid #f1f5f9;font-weight:700;color:#334155;">${escapeHtml(alert.now ?? "-")}<div style="font-size:11px;font-weight:400;color:#64748b;">${escapeHtml(compactText(alert.detail, 70))}</div></td></tr>`).join("")}</table>`;
}

function renderKeywordMovements(movements: NotificationBriefKeywordMovement[]): string {
  if (!movements.length) return renderEmptyState("No keyword ranking movement recorded for this date.");
  return `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:12px;">${movements.map((movement) => `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;"><strong style="color:#0f172a;">${escapeHtml(movement.keyword)}</strong><div style="margin-top:2px;color:#64748b;">${escapeHtml(movement.brand ?? movement.asin)} · ${escapeHtml(movement.asin)}</div></td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #f1f5f9;font-weight:700;color:${(movement.rankChange ?? 0) >= 0 ? "#059669" : "#dc2626"};">${escapeHtml(formatRank(movement.previousRank))} → ${escapeHtml(formatRank(movement.currentRank))}<div style="font-size:11px;">${movement.rankChange === null ? "" : `${movement.rankChange > 0 ? "↑" : "↓"}${Math.abs(movement.rankChange)}`}</div></td></tr>`).join("")}</table>`;
}

function renderOtherChanges(data: NotificationBriefData): string {
  if (!data.otherChanges.counts.length) return renderEmptyState("No additional changes recorded for this date.");
  return `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:12px;">${data.otherChanges.counts.map((item) => `<tr><td style="padding:7px 0;border-bottom:1px solid #f1f5f9;color:#475569;">${escapeHtml(item.label)}</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #f1f5f9;font-weight:700;color:#0f172a;">${item.count}</td></tr>`).join("")}</table><div style="margin-top:9px;font-size:11px;color:#64748b;">Ordinary changes are summarized here; use the dashboard or Excel attachment for the full list.</div>`;
}

function renderSectionHeading(title: string, subtitle: string): string {
  return `<div style="margin:22px 0 10px;padding-bottom:7px;border-bottom:1px solid #e2e8f0;"><div style="font-size:11px;letter-spacing:.12em;color:#64748b;font-weight:700;">${escapeHtml(title)}</div><div style="margin-top:3px;font-size:12px;color:#94a3b8;">${escapeHtml(subtitle)}</div></div>`;
}
function renderHeaderMetric(value: string, color: string): string { return `<td style="padding:9px 10px;background:rgba(255,255,255,.08);border-radius:6px;color:${color};font-size:12px;font-weight:700;">${escapeHtml(value)}</td>`; }
function renderKpiCell(value: number, label: string): string { return `<td style="width:50%;padding:14px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;"><div style="font-size:24px;line-height:1;font-weight:700;color:#0f172a;">${value}</div><div style="margin-top:6px;font-size:11px;color:#64748b;">${escapeHtml(label)}</div></td>`; }
function renderButtonLink(url: string | null | undefined, label: string): string { return url ? `<div style="margin-top:15px;"><a href="${escapeAttribute(url)}" style="display:inline-block;padding:10px 14px;border-radius:6px;background:#0f766e;color:#ffffff;font-size:12px;font-weight:700;text-decoration:none;">${escapeHtml(label)}</a></div>` : ""; }
function renderInlineLink(url: string | null | undefined, label: string): string { return url ? `<a href="${escapeAttribute(url)}" style="display:inline-block;margin-right:12px;color:#0369a1;font-size:12px;font-weight:700;text-decoration:none;">${escapeHtml(label)}</a>` : ""; }
function renderEmptyState(text: string): string { return `<div style="padding:12px;background:#f8fafc;border-radius:6px;color:#64748b;font-size:12px;line-height:1.6;">${escapeHtml(text)}</div>`; }
function formatRank(value: number | null): string { return value === null ? "-" : `#${new Intl.NumberFormat("en-US").format(value)}`; }
function compactText(value: string, maxLength: number): string { const normalized = value.replace(/\s+/g, " ").trim(); return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized; }
function escapeAttribute(value: string): string { return escapeHtml(value).replace(/"/g, "&quot;"); }
