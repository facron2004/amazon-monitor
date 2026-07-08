import {
  insightReviewResultLabels,
  type InsightEvent,
  type InsightReviewResult
} from "@amazon-monitor/shared";

export type ReviewOutcomeTone = "success" | "warning" | "danger" | "info";

export interface ReviewOutcomeRow {
  result: InsightReviewResult;
  label: string;
  count: number;
  percent: number;
  totalScore: number;
  p0Count: number;
  topEventId: string;
  topEventTitle: string;
  tone: ReviewOutcomeTone;
}

export interface ReviewOutcomeSummary {
  health: ReviewOutcomeHealthSummary;
  reviewedCount: number;
  pendingReviewCount: number;
  dueNowCount: number;
  validatedCount: number;
  validatedPercent: number;
  rows: ReviewOutcomeRow[];
}

export interface ReviewOutcomeHealthSummary {
  reviewedCount: number;
  pendingReviewCount: number;
  dueNowCount: number;
  validatedPercent: number;
  pendingPercent: number;
  topOutcomeLabel: string;
  healthLabel: string;
  healthTone: ReviewOutcomeTone;
}

const reviewOutcomeOrder: InsightReviewResult[] = ["CONFIRMED", "CONTINUING", "REVERTED", "FAILED", "UNCLEAR"];
const reviewOutcomeTone: Record<InsightReviewResult, ReviewOutcomeTone> = {
  CONFIRMED: "success",
  CONTINUING: "success",
  REVERTED: "warning",
  FAILED: "danger",
  UNCLEAR: "info"
};

export function buildReviewOutcomeSummary(events: InsightEvent[], currentDate: string): ReviewOutcomeSummary {
  const reviewedEvents = events.filter((event) => event.reviewResult !== null);
  const reviewedCount = reviewedEvents.length;
  const rows = reviewOutcomeOrder
    .map((result) => buildOutcomeRow(result, reviewedEvents, reviewedCount))
    .filter((row): row is ReviewOutcomeRow => row !== null);
  const validatedCount = reviewedEvents.filter((event) => event.reviewResult === "CONFIRMED" || event.reviewResult === "CONTINUING").length;
  const pendingReviewCount = events.filter((event) => event.status === "REVIEW_PENDING").length;
  const dueNowCount = events.filter((event) => isReviewDueNow(event, currentDate)).length;
  const validatedPercent = percent(validatedCount, reviewedCount);

  return {
    health: buildReviewOutcomeHealth({
      dueNowCount,
      pendingReviewCount,
      reviewedCount,
      rows,
      validatedPercent
    }),
    reviewedCount,
    pendingReviewCount,
    dueNowCount,
    validatedCount,
    validatedPercent,
    rows
  };
}

function buildReviewOutcomeHealth(input: {
  reviewedCount: number;
  pendingReviewCount: number;
  dueNowCount: number;
  validatedPercent: number;
  rows: ReviewOutcomeRow[];
}): ReviewOutcomeHealthSummary {
  return {
    reviewedCount: input.reviewedCount,
    pendingReviewCount: input.pendingReviewCount,
    dueNowCount: input.dueNowCount,
    validatedPercent: input.validatedPercent,
    pendingPercent: percent(input.pendingReviewCount, input.pendingReviewCount + input.reviewedCount),
    topOutcomeLabel: input.rows[0]?.label ?? "-",
    healthLabel: getReviewOutcomeHealthLabel(input),
    healthTone: getReviewOutcomeHealthTone(input)
  };
}

function buildOutcomeRow(
  result: InsightReviewResult,
  events: InsightEvent[],
  reviewedCount: number
): ReviewOutcomeRow | null {
  const matching = events.filter((event) => event.reviewResult === result);
  if (matching.length === 0) return null;
  const topEvent = [...matching].sort(reviewOutcomeEventComparator)[0];

  return {
    result,
    label: insightReviewResultLabels[result],
    count: matching.length,
    percent: percent(matching.length, reviewedCount),
    totalScore: matching.reduce((sum, event) => sum + event.scoreTotal, 0),
    p0Count: matching.filter((event) => event.eventLevel === "P0").length,
    topEventId: topEvent.id,
    topEventTitle: topEvent.eventTitle,
    tone: reviewOutcomeTone[result]
  };
}

function reviewOutcomeEventComparator(left: InsightEvent, right: InsightEvent): number {
  return (
    right.scoreTotal - left.scoreTotal
    || right.updatedAt.localeCompare(left.updatedAt)
    || left.eventTitle.localeCompare(right.eventTitle)
  );
}

function isReviewDueNow(event: InsightEvent, currentDate: string): boolean {
  return event.status !== "REVIEWED" && currentDate.length > 0 && event.reviewDueDate !== null && event.reviewDueDate <= currentDate;
}

function percent(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function getReviewOutcomeHealthLabel(input: {
  reviewedCount: number;
  pendingReviewCount: number;
  dueNowCount: number;
  validatedPercent: number;
}): string {
  if (input.dueNowCount > 0) return `${input.dueNowCount} 个待复盘`;
  if (input.reviewedCount === 0 && input.pendingReviewCount > 0) return "等待复盘";
  if (input.reviewedCount === 0) return "暂无复盘结果";
  if (input.validatedPercent >= 70) return "复盘成立";
  if (input.validatedPercent >= 40) return "结果分化";
  return "需要处理";
}

function getReviewOutcomeHealthTone(input: {
  reviewedCount: number;
  pendingReviewCount: number;
  dueNowCount: number;
  validatedPercent: number;
}): ReviewOutcomeTone {
  if (input.dueNowCount > 0) return "warning";
  if (input.reviewedCount === 0) return input.pendingReviewCount > 0 ? "warning" : "info";
  if (input.validatedPercent >= 70) return "success";
  if (input.validatedPercent >= 40) return "warning";
  return "danger";
}
