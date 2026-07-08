import type {
  InsightEvent,
  InsightEventLevel,
  InsightEventStatus
} from "@amazon-monitor/shared";
import {
  isReviewCadenceBucketMatch,
  type ReviewCadenceBucketKey
} from "@amazon-monitor/shared";

export { isReviewCadenceBucketMatch };
export type { ReviewCadenceBucketKey };

export interface ReviewCadenceBucket {
  key: ReviewCadenceBucketKey;
  label: string;
  count: number;
  p0Count: number;
  p1Count: number;
  p2Count: number;
  totalScore: number;
}

export interface ReviewCadenceRow {
  event: InsightEvent;
  bucket: ReviewCadenceBucketKey;
  daysOffset: number;
}

export interface ReviewCadenceSummary {
  health: ReviewCadenceHealthSummary;
  buckets: ReviewCadenceBucket[];
  rows: ReviewCadenceRow[];
}

export interface ReviewCadenceHealthSummary {
  totalCount: number;
  dueNowCount: number;
  overdueCount: number;
  todayCount: number;
  upcomingCount: number;
  p0DueCount: number;
  totalScore: number;
  dueNowPercent: number;
  nextDueLabel: string;
  healthLabel: string;
  healthTone: "danger" | "warning" | "success" | "info";
}

const reviewCadenceStatuses = new Set<InsightEventStatus>(["TODO", "REVIEW_PENDING"]);
const levelWeight: Record<InsightEventLevel, number> = { P0: 3, P1: 2, P2: 1 };
const bucketLabels: Record<ReviewCadenceBucketKey, string> = {
  overdue: "已逾期",
  today: "今日到期",
  upcoming: "待到期"
};
const bucketOrder: Record<ReviewCadenceBucketKey, number> = {
  overdue: 0,
  today: 1,
  upcoming: 2
};

export const reviewCadenceBucketLabels = bucketLabels;

export const reviewCadenceBucketOptions: Array<{ value: ReviewCadenceBucketKey; label: string }> = [
  { value: "overdue", label: bucketLabels.overdue },
  { value: "today", label: bucketLabels.today },
  { value: "upcoming", label: bucketLabels.upcoming }
];

export function buildReviewCadenceSummary(
  visibleEvents: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  currentDate: string
): ReviewCadenceSummary {
  const merged = mergeReviewEvents(visibleEvents, reviewDueEvents);
  const rows = merged
    .filter((event) => isReviewCadenceEvent(event))
    .map((event) => toReviewCadenceRow(event, currentDate))
    .sort(reviewCadenceRowComparator);

  return {
    health: buildReviewCadenceHealth(rows),
    buckets: buildReviewCadenceBuckets(rows),
    rows: rows.slice(0, 8)
  };
}

function mergeReviewEvents(visibleEvents: InsightEvent[], reviewDueEvents: InsightEvent[]): InsightEvent[] {
  const rows = new Map<string, InsightEvent>();
  for (const event of visibleEvents) {
    rows.set(event.id, event);
  }
  for (const event of reviewDueEvents) {
    rows.set(event.id, event);
  }
  return Array.from(rows.values());
}

function isReviewCadenceEvent(event: InsightEvent): boolean {
  return event.reviewDueDate !== null && reviewCadenceStatuses.has(event.status);
}

function toReviewCadenceRow(event: InsightEvent, currentDate: string): ReviewCadenceRow {
  const dueDate = event.reviewDueDate ?? currentDate;
  return {
    event,
    bucket: bucketForDueDate(dueDate, currentDate),
    daysOffset: daysBetween(currentDate, dueDate)
  };
}

function bucketForDueDate(dueDate: string, currentDate: string): ReviewCadenceBucketKey {
  if (dueDate < currentDate) return "overdue";
  if (dueDate === currentDate) return "today";
  return "upcoming";
}

function buildReviewCadenceBuckets(rows: ReviewCadenceRow[]): ReviewCadenceBucket[] {
  return (Object.keys(bucketLabels) as ReviewCadenceBucketKey[]).map((key) => {
    const bucketRows = rows.filter((row) => row.bucket === key);
    return {
      key,
      label: bucketLabels[key],
      count: bucketRows.length,
      p0Count: bucketRows.filter((row) => row.event.eventLevel === "P0").length,
      p1Count: bucketRows.filter((row) => row.event.eventLevel === "P1").length,
      p2Count: bucketRows.filter((row) => row.event.eventLevel === "P2").length,
      totalScore: bucketRows.reduce((sum, row) => sum + row.event.scoreTotal, 0)
    };
  });
}

function buildReviewCadenceHealth(rows: ReviewCadenceRow[]): ReviewCadenceHealthSummary {
  const overdueCount = rows.filter((row) => row.bucket === "overdue").length;
  const todayCount = rows.filter((row) => row.bucket === "today").length;
  const upcomingCount = rows.filter((row) => row.bucket === "upcoming").length;
  const dueNowCount = overdueCount + todayCount;
  const p0DueCount = rows.filter((row) => row.event.eventLevel === "P0" && (row.bucket === "overdue" || row.bucket === "today")).length;
  const nextUpcoming = rows.find((row) => row.bucket === "upcoming");

  return {
    totalCount: rows.length,
    dueNowCount,
    overdueCount,
    todayCount,
    upcomingCount,
    p0DueCount,
    totalScore: rows.reduce((sum, row) => sum + row.event.scoreTotal, 0),
    dueNowPercent: percent(dueNowCount, rows.length),
    nextDueLabel: nextUpcoming?.event.reviewDueDate?.slice(5) ?? "-",
    healthLabel: getCadenceHealthLabel(overdueCount, todayCount, upcomingCount),
    healthTone: getCadenceHealthTone(overdueCount, todayCount, p0DueCount, upcomingCount)
  };
}

function reviewCadenceRowComparator(left: ReviewCadenceRow, right: ReviewCadenceRow): number {
  return (
    bucketOrder[left.bucket] - bucketOrder[right.bucket]
    || compareDueDate(left, right)
    || levelWeight[right.event.eventLevel] - levelWeight[left.event.eventLevel]
    || right.event.scoreTotal - left.event.scoreTotal
    || left.event.eventTitle.localeCompare(right.event.eventTitle)
  );
}

function compareDueDate(left: ReviewCadenceRow, right: ReviewCadenceRow): number {
  const leftDueDate = left.event.reviewDueDate ?? "";
  const rightDueDate = right.event.reviewDueDate ?? "";
  return leftDueDate.localeCompare(rightDueDate);
}

function daysBetween(fromDate: string, toDate: string): number {
  const fromTime = dateToUtcTime(fromDate);
  const toTime = dateToUtcTime(toDate);
  if (fromTime === null || toTime === null) {
    return 0;
  }
  return Math.round((toTime - fromTime) / 86_400_000);
}

function dateToUtcTime(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function percent(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function getCadenceHealthLabel(overdueCount: number, todayCount: number, upcomingCount: number): string {
  if (overdueCount > 0) return `${overdueCount} 个逾期`;
  if (todayCount > 0) return `${todayCount} 个今日到期`;
  if (upcomingCount > 0) return "已排期";
  return "无复盘队列";
}

function getCadenceHealthTone(
  overdueCount: number,
  todayCount: number,
  p0DueCount: number,
  upcomingCount: number
): ReviewCadenceHealthSummary["healthTone"] {
  if (overdueCount > 0) return "danger";
  if (todayCount > 0 || p0DueCount > 0) return "warning";
  if (upcomingCount > 0) return "success";
  return "info";
}
