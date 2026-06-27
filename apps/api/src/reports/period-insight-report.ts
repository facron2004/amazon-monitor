import type { InsightEvent, InsightReviewResult, StrategyTag } from "@amazon-monitor/shared";
import {
  inferInsightEventStrategyTags,
  insightEventStatusLabels,
  insightReviewResultLabels,
  strategyTagLabels
} from "@amazon-monitor/shared";
import { isoDateOffset } from "../store/date-utils.js";
import type { Store } from "../store.js";

export type InsightReportPeriod = "weekly" | "monthly";

export interface PeriodInsightReportBrand {
  brand: string;
  eventCount: number;
  topScore: number;
  coreRiskCount: number;
  strategyTags: StrategyTag[];
  representativeEventTitle: string;
  suggestedAction: string;
}

export interface PeriodInsightReportSummary {
  totalEvents: number;
  sLevelCount: number;
  aLevelCount: number;
  coreRiskCount: number;
  newBreakoutCount: number;
  reviewDueCount: number;
  reviewedCount: number;
  confirmedCount: number;
  revertedCount: number;
}

export interface PeriodInsightReport {
  period: InsightReportPeriod;
  startDate: string;
  endDate: string;
  days: number;
  summary: PeriodInsightReportSummary;
  topEvents: InsightEvent[];
  topBrands: PeriodInsightReportBrand[];
  reviewOutcomes: Array<{ result: InsightReviewResult; count: number }>;
  markdown: string;
}

const periodDays: Record<InsightReportPeriod, number> = {
  weekly: 7,
  monthly: 30
};

export function buildPeriodInsightReport(
  store: Store,
  input: { endDate: string; period: InsightReportPeriod }
): PeriodInsightReport {
  const days = periodDays[input.period];
  const dates = dateWindow(input.endDate, days);
  const startDate = dates[0] ?? input.endDate;
  const insightEvents = uniqueById(dates.flatMap((date) => store.listInsightEvents({ date, limit: 1000 })));
  const candidates = uniqueById([...insightEvents, ...store.listInsightEvents({ limit: 1000 })]);
  const reviewDueEvents = candidates.filter(
    (event) => event.reviewDueDate !== null && event.reviewDueDate >= startDate && event.reviewDueDate <= input.endDate
  );
  const reviewedEvents = candidates.filter(
    (event) => event.reviewResult !== null && event.updatedAt.slice(0, 10) >= startDate && event.updatedAt.slice(0, 10) <= input.endDate
  );
  const summary = buildSummary(insightEvents, reviewDueEvents, reviewedEvents);
  const topEvents = [...insightEvents]
    .sort((left, right) => right.scoreTotal - left.scoreTotal || left.eventTitle.localeCompare(right.eventTitle))
    .slice(0, 10);
  const topBrands = buildTopBrands(insightEvents).slice(0, 10);
  const reviewOutcomes = buildReviewOutcomes(reviewedEvents);
  return {
    period: input.period,
    startDate,
    endDate: input.endDate,
    days,
    summary,
    topEvents,
    topBrands,
    reviewOutcomes,
    markdown: buildMarkdown({
      period: input.period,
      startDate,
      endDate: input.endDate,
      summary,
      topEvents,
      topBrands,
      reviewOutcomes,
      reviewDueEvents,
      reviewedEvents
    })
  };
}

function buildSummary(
  insightEvents: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  reviewedEvents: InsightEvent[]
): PeriodInsightReportSummary {
  return {
    totalEvents: insightEvents.length,
    sLevelCount: insightEvents.filter((event) => event.scoreLevel === "S").length,
    aLevelCount: insightEvents.filter((event) => event.scoreLevel === "A").length,
    coreRiskCount: insightEvents.filter((event) => event.eventType === "CORE_COMPETITOR_RISK").length,
    newBreakoutCount: insightEvents.filter((event) => event.eventType === "NEW_PRODUCT_BREAKOUT").length,
    reviewDueCount: reviewDueEvents.length,
    reviewedCount: reviewedEvents.length,
    confirmedCount: reviewedEvents.filter((event) => event.reviewResult === "CONFIRMED").length,
    revertedCount: reviewedEvents.filter((event) => event.reviewResult === "REVERTED").length
  };
}

function buildTopBrands(events: InsightEvent[]): PeriodInsightReportBrand[] {
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
      return {
        brand,
        eventCount: brandEvents.length,
        topScore: representative?.scoreTotal ?? 0,
        coreRiskCount: brandEvents.filter((event) => event.eventType === "CORE_COMPETITOR_RISK").length,
        strategyTags: [...new Set(brandEvents.flatMap(inferInsightEventStrategyTags))],
        representativeEventTitle: representative?.eventTitle ?? "",
        suggestedAction: representative?.suggestedAction ?? ""
      };
    })
    .sort((left, right) => right.topScore - left.topScore || right.eventCount - left.eventCount);
}

function buildReviewOutcomes(events: InsightEvent[]): Array<{ result: InsightReviewResult; count: number }> {
  const counts = new Map<InsightReviewResult, number>();
  for (const event of events) {
    if (event.reviewResult) {
      counts.set(event.reviewResult, (counts.get(event.reviewResult) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([result, count]) => ({ result, count }))
    .sort((left, right) => right.count - left.count || left.result.localeCompare(right.result));
}

function buildMarkdown(input: {
  period: InsightReportPeriod;
  startDate: string;
  endDate: string;
  summary: PeriodInsightReportSummary;
  topEvents: InsightEvent[];
  topBrands: PeriodInsightReportBrand[];
  reviewOutcomes: Array<{ result: InsightReviewResult; count: number }>;
  reviewDueEvents: InsightEvent[];
  reviewedEvents: InsightEvent[];
}): string {
  return [
    `# ${input.period === "weekly" ? "Weekly" : "Monthly"} Insight Report (${input.startDate} to ${input.endDate})`,
    "",
    "## Summary",
    `- Total insight events: ${input.summary.totalEvents}`,
    `- S/A opportunities: ${input.summary.sLevelCount}/${input.summary.aLevelCount}`,
    `- Core competitor risks: ${input.summary.coreRiskCount}`,
    `- New-product breakouts: ${input.summary.newBreakoutCount}`,
    `- Review due / reviewed: ${input.summary.reviewDueCount}/${input.summary.reviewedCount}`,
    "",
    "## Highest Priority Events",
    ...formatEventBullets(input.topEvents, "No insight events in this period."),
    "",
    "## Brand Strategy Signals",
    ...formatBrandBullets(input.topBrands, "No brand-level evidence in this period."),
    "",
    "## Review Outcomes",
    ...formatReviewOutcomeBullets(input.reviewOutcomes),
    "",
    "## Upcoming Review Queue",
    ...formatEventBullets(input.reviewDueEvents.slice(0, 10), "No review-due events in this period."),
    "",
    "## Completed Reviews",
    ...formatReviewedBullets(input.reviewedEvents.slice(0, 10))
  ].join("\n");
}

function formatEventBullets(events: InsightEvent[], emptyText: string): string[] {
  if (events.length === 0) {
    return [`- ${emptyText}`];
  }
  return events.map((event, index) => `${index + 1}. ${formatEventLine(event)}`);
}

function formatBrandBullets(brands: PeriodInsightReportBrand[], emptyText: string): string[] {
  if (brands.length === 0) {
    return [`- ${emptyText}`];
  }
  return brands.map((brand, index) => {
    const tags = brand.strategyTags.map((tag) => strategyTagLabels[tag]).join(", ") || "No strategy tags";
    return `${index + 1}. ${brand.brand}: ${brand.eventCount} events, top score ${brand.topScore}, tags ${tags}. ${brand.suggestedAction}`;
  });
}

function formatReviewOutcomeBullets(outcomes: Array<{ result: InsightReviewResult; count: number }>): string[] {
  if (outcomes.length === 0) {
    return ["- No completed reviews in this period."];
  }
  return outcomes.map((outcome) => `- ${insightReviewResultLabels[outcome.result]}: ${outcome.count}`);
}

function formatReviewedBullets(events: InsightEvent[]): string[] {
  if (events.length === 0) {
    return ["- No completed reviews in this period."];
  }
  return events.map((event, index) => {
    const result = event.reviewResult ? insightReviewResultLabels[event.reviewResult] : "No review result";
    return `${index + 1}. ${formatTarget(event)} ${event.eventType}: ${result}${formatAssignee(event)}. ${event.userNote ?? "No review note."}`;
  });
}

function formatEventLine(event: InsightEvent): string {
  const tags = event.attributionTags.join(" + ") || "NO_CLEAR_DRIVER";
  return `${formatTarget(event)} ${event.eventType}: score ${event.scoreTotal}, status ${insightEventStatusLabels[event.status]}${formatAssignee(event)}, attribution ${tags}. ${event.suggestedAction}`;
}

function formatTarget(event: InsightEvent): string {
  return [event.brand, event.asin].filter(Boolean).join(" ") || event.brand || event.asin || "Brand-level event";
}

function uniqueById(events: InsightEvent[]): InsightEvent[] {
  const byId = new Map<string, InsightEvent>();
  for (const event of events) {
    byId.set(event.id, event);
  }
  return [...byId.values()];
}

function dateWindow(endDate: string, days: number): string[] {
  return Array.from({ length: days }, (_value, index) => isoDateOffset(endDate, index - days + 1));
}

function formatAssignee(event: InsightEvent): string {
  return event.assignee ? `, owner ${event.assignee}` : "";
}
