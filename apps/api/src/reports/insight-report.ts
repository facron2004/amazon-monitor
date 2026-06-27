import type { InsightEvent } from "@amazon-monitor/shared";
import { inferInsightEventStrategyTags, insightEventStatusLabels, insightReviewResultLabels, strategyTagLabels } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { escapeHtml } from "../notifications/text-utils.js";
import { imagePreviewCell, type WorkbookSheet } from "./excel-workbook.js";

export interface DailyInsightReportData {
  insightEvents: InsightEvent[];
  reviewDueEvents: InsightEvent[];
  reviewedEvents: InsightEvent[];
}

export function collectDailyInsightReportData(store: Store, date: string): DailyInsightReportData {
  const reviewedEvents = store
    .listInsightEvents({ limit: 1000 })
    .filter((event) => event.reviewResult !== null && event.updatedAt.slice(0, 10) === date);
  return {
    insightEvents: store.listInsightEvents({ date, limit: 1000 }),
    reviewDueEvents: store.listReviewDueEvents(date),
    reviewedEvents
  };
}

export function buildInsightTextSections(data: DailyInsightReportData): string[] {
  const mustSee = data.insightEvents.filter((event) => event.scoreLevel === "S").slice(0, 5);
  const highPriority = data.insightEvents.filter((event) => event.scoreLevel === "A").slice(0, 5);
  const coreRisks = data.insightEvents.filter((event) => event.eventType === "CORE_COMPETITOR_RISK").slice(0, 5);

  return [
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

export function buildInsightHtmlSections(data: DailyInsightReportData): string {
  const groups: Array<{
    title: string;
    events: InsightEvent[];
    emptyText: string;
    format: (event: InsightEvent) => string;
  }> = [
    { title: "今日必须看", events: data.insightEvents.filter((event) => event.scoreLevel === "S").slice(0, 5), emptyText: "暂无 S 级洞察事件", format: formatInsightLine },
    { title: "高优先级机会", events: data.insightEvents.filter((event) => event.scoreLevel === "A").slice(0, 5), emptyText: "暂无 A 级洞察事件", format: formatInsightLine },
    { title: "核心竞品风险", events: data.insightEvents.filter((event) => event.eventType === "CORE_COMPETITOR_RISK").slice(0, 5), emptyText: "暂无核心竞品风险", format: formatInsightLine },
    { title: "待复盘事项", events: data.reviewDueEvents.slice(0, 8), emptyText: "暂无到期待复盘事项", format: formatInsightLine },
    { title: "昨日判断复盘结果", events: data.reviewedEvents.slice(0, 8), emptyText: "暂无已完成复盘", format: formatReviewLine }
  ];

  return groups
    .map(
      ({ title, events, emptyText, format }) => `
        <h2 style="margin:18px 0 8px;font-size:15px;">${escapeHtml(title)}</h2>
        <ul style="margin:0 0 14px;padding-left:18px;font-size:13px;line-height:1.65;">
          ${
            events.length
              ? events.map((event) => `<li>${escapeHtml(format(event))}</li>`).join("")
              : `<li>${escapeHtml(emptyText)}</li>`
          }
        </ul>`
    )
    .join("");
}

export function buildDailyInsightSheets(data: DailyInsightReportData): WorkbookSheet[] {
  return [
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
        ["Due Date", "Date", "Level", "Score", "Status", "Type", "ASIN", "Brand", "Title", "Attribution Tags", "Suggested Action", "Summary"],
        ...data.reviewDueEvents.map((event) => [
          event.reviewDueDate,
          event.eventDate,
          event.eventLevel,
          event.scoreTotal,
          insightEventStatusLabels[event.status],
          event.eventType,
          event.asin,
          event.brand,
          event.evidence.title ?? event.eventTitle,
          event.attributionTags.join(", "),
          event.suggestedAction,
          event.eventSummary
        ])
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

function formatInsightBullets(events: InsightEvent[], emptyText: string): string[] {
  return events.length ? events.map((event, index) => `${index + 1}. ${formatInsightLine(event)}`) : [`- ${emptyText}`];
}

function formatReviewBullets(events: InsightEvent[]): string[] {
  return events.length ? events.map((event, index) => `${index + 1}. ${formatReviewLine(event)}`) : ["- 暂无已完成复盘"];
}

function formatReviewLine(event: InsightEvent): string {
  const target = [event.brand, event.asin].filter(Boolean).join(" ") || event.brand || event.asin || "品牌事件";
  const result = event.reviewResult ? insightReviewResultLabels[event.reviewResult] : "数据不足";
  return `${target} ${event.eventType}：${result}。${event.userNote ?? "暂无复盘备注"}`;
}

function formatInsightLine(event: InsightEvent): string {
  const target = [event.brand, event.asin].filter(Boolean).join(" ") || event.brand || event.asin || "品牌事件";
  return `${target} ${event.eventType}，机会分 ${event.scoreTotal}，归因 ${event.attributionTags.join(" + ")}，状态 ${insightEventStatusLabels[event.status]}。${event.suggestedAction}`;
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
    event.attributionTags.join(", "),
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
