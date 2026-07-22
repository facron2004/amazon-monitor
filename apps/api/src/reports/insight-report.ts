import type { InsightEvent } from "@amazon-monitor/shared";
import { attributionTagLabels, inferInsightEventStrategyTags, insightEventStatusLabels, insightReviewResultLabels, strategyTagLabels } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { escapeHtml } from "../notifications/text-utils.js";
import { imagePreviewCell, type WorkbookSheet } from "./excel-workbook.js";

export interface DailyInsightReportData {
  insightEvents: InsightEvent[];
  reviewDueEvents: InsightEvent[];
  reviewedEvents: InsightEvent[];
}

export function collectDailyInsightReportData(store: Store, date: string, orgId = 1): DailyInsightReportData {
  const reviewedEvents = store
    .listInsightEvents({ orgId, limit: 1000 })
    .filter((event) => event.reviewResult !== null && event.updatedAt.slice(0, 10) === date);
  return {
    insightEvents: store.listInsightEvents({ orgId, date, limit: 1000 }),
    reviewDueEvents: store.listReviewDueEvents(date, { orgId }),
    reviewedEvents
  };
}

export function buildInsightTextSections(data: DailyInsightReportData): string[] {
  const mustSee = selectMustSeeEvents(data.insightEvents);
  const highPriority = selectHighPriorityEvents(data.insightEvents, new Set(mustSee.map((event) => event.id)));
  const coreRisks = selectCoreRiskEvents(data.insightEvents);

  return [
    "## Action Center 概览",
    ...formatOverviewBullets(data),
    "",
    "## 今日必须看",
    ...formatInsightBullets(mustSee, "暂无 S 级洞察事件"),
    "",
    "## 今日高优先级机会",
    ...formatInsightBullets(highPriority, "暂无 A 级洞察事件"),
    "",
    "## 今日核心竞品风险",
    ...formatInsightBullets(coreRisks, "暂无核心竞品风险"),
    "",
    "## 今日待复盘事项",
    ...formatInsightBullets(data.reviewDueEvents.slice(0, 8), "暂无到期待复盘事项"),
    "",
    "## 昨日判断复盘结果",
    ...formatReviewBullets(data.reviewedEvents.slice(0, 8))
  ];
}

export function appendDailyInsightReportMarkdown(markdown: string, data: DailyInsightReportData): string {
  if (!data.insightEvents.length && !data.reviewDueEvents.length && !data.reviewedEvents.length) {
    return markdown;
  }
  const insightSections = buildInsightTextSections(data).join("\n");
  return markdown.trim() ? [markdown, "", insightSections].join("\n") : insightSections;
}

export function buildInsightHtmlSections(data: DailyInsightReportData): string {
  const mustSee = selectMustSeeEvents(data.insightEvents);
  const highPriority = selectHighPriorityEvents(data.insightEvents, new Set(mustSee.map((event) => event.id)));
  const coreRisks = selectCoreRiskEvents(data.insightEvents);
  const groups: Array<{
    title: string;
    events: InsightEvent[];
    emptyText: string;
    format: (event: InsightEvent) => string;
  }> = [
    { title: "今日必须看", events: mustSee, emptyText: "暂无 S/P0 洞察事件", format: formatInsightLine },
    { title: "今日高优先级机会", events: highPriority, emptyText: "暂无 A/P1 洞察事件", format: formatInsightLine },
    { title: "今日核心竞品风险", events: coreRisks, emptyText: "暂无核心竞品风险", format: formatInsightLine },
    { title: "今日待复盘事项", events: data.reviewDueEvents.slice(0, 8), emptyText: "暂无到期待复盘事项", format: formatInsightLine },
    { title: "昨日判断复盘结果", events: data.reviewedEvents.slice(0, 8), emptyText: "暂无已完成复盘", format: formatReviewLine }
  ];

  const groupHtml = groups.map(
    ({ title, events, emptyText, format }) => `
        <h2 style="margin:18px 0 8px;font-size:15px;">${escapeHtml(title)}</h2>
        <ul style="margin:0 0 14px;padding-left:18px;font-size:13px;line-height:1.65;">
          ${
            events.length
              ? events.map((event) => `<li>${escapeHtml(format(event))}</li>`).join("")
              : `<li>${escapeHtml(emptyText)}</li>`
          }
        </ul>`
  );
  return [buildInsightOverviewHtml(data), ...groupHtml].join("");
}

export function buildDailyInsightSheets(data: DailyInsightReportData): WorkbookSheet[] {
  return [
    {
      name: "Action Checklist",
      rows: [
        [
          "Priority",
          "Date",
          "Level",
          "Score",
          "Status",
          "Owner",
          "Review Due",
          "ASIN",
          "Brand",
          "Signal",
          "Why",
          "Next Action",
          "Strategy Tags",
          "Product URL"
        ],
        ...buildActionChecklistRows(data)
      ]
    },
    {
      name: "Insight Events",
      rows: [
        [
          "Date",
          "Level",
          "Score",
          "Score Level",
          "Status",
          "Assignee",
          "Type",
          "ASIN",
          "Brand",
          "Category",
          "Title",
          "Image Preview",
          "Image URL",
          "Current Rank",
          "Previous Rank",
          "Rank Change",
          "Price Before",
          "Price After",
          "Review Change",
          "Strategy Tags",
          "Attribution Tags",
          "Suggested Action",
          "Review Due",
          "Summary",
          "Product URL"
        ],
        ...data.insightEvents.map((event) => insightEventRow(event))
      ]
    },
    {
      name: "Review Queue",
      rows: [
        ["Due Date", "Days Offset", "Date", "Level", "Score", "Status", "Assignee", "Type", "ASIN", "Brand", "Title", "Evidence", "Attribution Tags", "Suggested Action", "Summary"],
        ...data.reviewDueEvents.map((event) => [
          event.reviewDueDate,
          daysOffset(event.reviewDueDate, event.eventDate),
          event.eventDate,
          event.eventLevel,
          event.scoreTotal,
          insightEventStatusLabels[event.status],
          formatAssignee(event),
          event.eventType,
          event.asin,
          event.brand,
          event.evidence.title ?? event.eventTitle,
          firstEvidence(event),
          formatAttributionTags(event.attributionTags, ", "),
          event.suggestedAction,
          event.eventSummary
        ])
      ]
    },
    {
      name: "Review Outcomes",
      rows: [
        [
          "Reviewed Date",
          "Event Date",
          "Result",
          "Status",
          "Level",
          "Score",
          "Score Level",
          "Type",
          "ASIN",
          "Brand",
          "Title",
          "Evidence",
          "Review Due",
          "Review Note",
          "Suggested Action",
          "Attribution Tags",
          "Strategy Tags",
          "Product URL"
        ],
        ...buildReviewOutcomeRows(data.reviewedEvents)
      ]
    },
    {
      name: "Brand Strategy Tags",
      rows: [
        ["Date", "Brand", "Event Count", "Top Score", "Tags", "Representative Event", "Suggested Action"],
        ...buildBrandStrategyRows(data.insightEvents)
      ]
    }
  ];
}

function buildReviewOutcomeRows(events: InsightEvent[]) {
  return [...events]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.scoreTotal - left.scoreTotal)
    .map((event) => [
      event.updatedAt.slice(0, 10),
      event.eventDate,
      event.reviewResult ? insightReviewResultLabels[event.reviewResult] : "数据不足",
      insightEventStatusLabels[event.status],
      event.eventLevel,
      event.scoreTotal,
      event.scoreLevel,
      event.eventType,
      event.asin,
      event.brand,
      event.evidence.title ?? event.eventTitle,
      firstEvidence(event),
      event.reviewDueDate,
      event.userNote,
      event.suggestedAction,
      formatAttributionTags(event.attributionTags, ", "),
      inferInsightEventStrategyTags(event).map((tag) => strategyTagLabels[tag]).join(", "),
      event.evidence.productUrl
    ]);
}

function buildActionChecklistRows(data: DailyInsightReportData) {
  return uniqueById([...data.insightEvents, ...data.reviewDueEvents])
    .filter(isActionChecklistEvent)
    .sort((left, right) => actionChecklistSortScore(right) - actionChecklistSortScore(left))
    .slice(0, 50)
    .map((event) => [
      actionPriorityLabel(event),
      event.eventDate,
      event.eventLevel,
      event.scoreTotal,
      insightEventStatusLabels[event.status],
      formatAssignee(event),
      event.reviewDueDate,
      event.asin,
      event.brand,
      event.eventTitle,
      firstEvidence(event),
      event.suggestedAction,
      inferInsightEventStrategyTags(event).map((tag) => strategyTagLabels[tag]).join(", "),
      event.evidence.productUrl
    ]);
}

function isActionChecklistEvent(event: InsightEvent): boolean {
  if (event.status === "FOLLOWED" || event.status === "REVIEWED" || event.status === "IGNORED") return false;
  return isMustSeeEvent(event)
    || isHighPriorityEvent(event)
    || isCoreRiskEvent(event)
    || event.reviewDueDate !== null;
}

function actionChecklistSortScore(event: InsightEvent): number {
  const scoreLevelBonus = event.scoreLevel === "S" ? 500 : event.scoreLevel === "A" ? 300 : 0;
  const levelBonus = event.eventLevel === "P0" ? 200 : event.eventLevel === "P1" ? 80 : 0;
  const dueBonus = event.reviewDueDate !== null ? 120 : 0;
  const coreBonus = event.eventType === "CORE_COMPETITOR_RISK" ? 100 : 0;
  return scoreLevelBonus + levelBonus + dueBonus + coreBonus + event.scoreTotal;
}

function actionPriorityLabel(event: InsightEvent): string {
  if (isMustSeeEvent(event)) return "今日必须看";
  if (isHighPriorityEvent(event)) return "高优先级";
  if (isCoreRiskEvent(event)) return "核心竞品风险";
  if (event.reviewDueDate !== null) return "待复盘";
  return "行动项";
}

function selectMustSeeEvents(events: InsightEvent[]): InsightEvent[] {
  return rankActionableEvents(events.filter(isMustSeeEvent)).slice(0, 5);
}

function selectHighPriorityEvents(events: InsightEvent[], excludedIds: Set<string>): InsightEvent[] {
  return rankActionableEvents(events.filter((event) => isHighPriorityEvent(event) && !excludedIds.has(event.id))).slice(0, 5);
}

function selectCoreRiskEvents(events: InsightEvent[]): InsightEvent[] {
  return rankActionableEvents(events.filter(isCoreRiskEvent)).slice(0, 5);
}

function rankActionableEvents(events: InsightEvent[]): InsightEvent[] {
  return [...events].sort((left, right) => actionChecklistSortScore(right) - actionChecklistSortScore(left));
}

function isMustSeeEvent(event: InsightEvent): boolean {
  return event.scoreLevel === "S" || event.eventLevel === "P0";
}

function isHighPriorityEvent(event: InsightEvent): boolean {
  return event.scoreLevel === "A" || event.eventLevel === "P1";
}

function isCoreRiskEvent(event: InsightEvent): boolean {
  return event.eventType === "CORE_COMPETITOR_RISK"
    || event.evidence.isCoreCompetitor === true
    || inferInsightEventStrategyTags(event).includes("HIGH_THREAT_CORE");
}

function formatOverviewBullets(data: DailyInsightReportData): string[] {
  const p0Count = data.insightEvents.filter((event) => event.eventLevel === "P0").length;
  const sCount = data.insightEvents.filter((event) => event.scoreLevel === "S").length;
  const aCount = data.insightEvents.filter((event) => event.scoreLevel === "A").length;
  const openCount = data.insightEvents.filter((event) => ["TODO", "WATCHING", "REVIEW_PENDING"].includes(event.status)).length;
  const unassignedCount = data.insightEvents.filter((event) => event.assignee === null).length;
  return [
    `- 今日洞察 ${data.insightEvents.length} 件 / P0 ${p0Count} / S ${sCount} / A ${aCount}`,
    `- 待处理 ${openCount} 件 / 到期复盘 ${data.reviewDueEvents.length} 件 / 今日已复盘 ${data.reviewedEvents.length} 件`,
    `- 未分配 ${unassignedCount} 件 / 已分配 ${data.insightEvents.length - unassignedCount} 件`
  ];
}

function buildInsightOverviewHtml(data: DailyInsightReportData): string {
  return `
        <h2 style="margin:18px 0 8px;font-size:15px;">Action Center 概览</h2>
        <ul style="margin:0 0 14px;padding-left:18px;font-size:13px;line-height:1.65;">
          ${formatOverviewBullets(data).map((line) => `<li>${escapeHtml(line.replace(/^- /, ""))}</li>`).join("")}
        </ul>`;
}

function formatInsightBullets(events: InsightEvent[], emptyText: string): string[] {
  return events.length ? events.map((event, index) => `${index + 1}. ${formatInsightLine(event)}`) : [`- ${emptyText}`];
}

function formatReviewBullets(events: InsightEvent[]): string[] {
  return events.length ? events.map((event, index) => `${index + 1}. ${formatReviewLine(event)}`) : ["- 暂无已完成复盘"];
}

function formatReviewLine(event: InsightEvent): string {
  const target = [event.brand, event.asin].filter(Boolean).join(" ") || event.brand || event.asin || "品牌事件";
  const result = event.reviewResult ? insightReviewResultLabels[event.reviewResult] : "数据不足";
  return `${target} ${event.eventType}：${result}。负责人 ${formatAssignee(event)}。${event.userNote ?? "暂无复盘备注"}`;
}

function formatInsightLine(event: InsightEvent): string {
  const target = [event.brand, event.asin].filter(Boolean).join(" ") || event.brand || event.asin || "品牌事件";
  const dueText = event.reviewDueDate ? `，复盘 ${event.reviewDueDate.slice(5)}` : "";
  return `${target} ${event.eventType}，机会分 ${event.scoreTotal}，归因 ${formatAttribution(event)}，状态 ${insightEventStatusLabels[event.status]}，负责人 ${formatAssignee(event)}${dueText}。证据：${firstEvidence(event)}。${event.suggestedAction}`;
}

function formatAttribution(event: InsightEvent): string {
  return formatAttributionTags(event.attributionTags, " + ");
}

function formatAttributionTags(tags: InsightEvent["attributionTags"], separator: string): string {
  const displayTags: InsightEvent["attributionTags"] = tags.length > 0 ? tags : ["NO_CLEAR_DRIVER"];
  return displayTags.map((tag) => attributionTagLabels[tag]).join(separator);
}

function formatAssignee(event: InsightEvent): string {
  return event.assignee?.trim() || "未分配";
}

function firstEvidence(event: InsightEvent): string {
  return event.evidence.evidenceItems[0] ?? event.eventSummary.split("\n")[0] ?? "暂无证据摘要";
}

function daysOffset(dueDate: string | null, eventDate: string): number | "" {
  if (!dueDate) return "";
  const dueTime = dateToUtcTime(dueDate);
  const eventTime = dateToUtcTime(eventDate);
  if (dueTime === null || eventTime === null) return "";
  return Math.round((dueTime - eventTime) / 86_400_000);
}

function dateToUtcTime(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function insightEventRow(event: InsightEvent) {
  return [
    event.eventDate,
    event.eventLevel,
    event.scoreTotal,
    event.scoreLevel,
    insightEventStatusLabels[event.status],
    event.assignee,
    event.eventType,
    event.asin,
    event.brand,
    event.evidence.categoryName,
    event.evidence.title ?? event.eventTitle,
    imagePreviewCell(event.evidence.imageUrl),
    event.evidence.imageUrl,
    event.evidence.currentRank,
    event.evidence.previousRank,
    event.evidence.rankChange,
    event.evidence.priceBefore,
    event.evidence.priceAfter,
    event.evidence.reviewCountChange,
    inferInsightEventStrategyTags(event).map((tag) => strategyTagLabels[tag]).join(", "),
    formatAttributionTags(event.attributionTags, ", "),
    event.suggestedAction,
    event.reviewDueDate,
    event.eventSummary,
    event.evidence.productUrl
  ];
}

function buildBrandStrategyRows(events: InsightEvent[]) {
  const byBrand = new Map<string, InsightEvent[]>();
  for (const event of events) {
    const brand = event.brand?.trim();
    if (!brand) {
      continue;
    }
    const current = byBrand.get(brand);
    if (current) {
      current.push(event);
    } else {
      byBrand.set(brand, [event]);
    }
  }
  return [...byBrand.entries()]
    .map(([brand, brandEvents]) => {
      const sorted = [...brandEvents].sort((left, right) => right.scoreTotal - left.scoreTotal);
      const representative = sorted[0];
      return [
        representative?.eventDate ?? "",
        brand,
        brandEvents.length,
        representative?.scoreTotal ?? 0,
        [...new Set(brandEvents.flatMap(inferInsightEventStrategyTags))].map((tag) => strategyTagLabels[tag]).join(", "),
        representative?.eventTitle ?? "",
        representative?.suggestedAction ?? ""
      ];
    })
    .sort((left, right) => Number(right[3]) - Number(left[3]));
}

function uniqueById(events: InsightEvent[]): InsightEvent[] {
  const byId = new Map<string, InsightEvent>();
  for (const event of events) {
    byId.set(event.id, event);
  }
  return [...byId.values()];
}
