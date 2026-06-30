import type {
  InsightEvent,
  InsightEventLevel,
  InsightEventStatus
} from "@amazon-monitor/shared";

export type ReviewCadenceBucketKey = "overdue" | "today" | "upcoming";

export interface ReviewCadenceBucket {
  key: ReviewCadenceBucketKey;
  label: string;
  count: number;
  p0Count: number;
  totalScore: number;
}

export interface ReviewCadenceRow {
  event: InsightEvent;
  bucket: ReviewCadenceBucketKey;
  daysOffset: number;
}

export interface ReviewCadenceSummary {
  buckets: ReviewCadenceBucket[];
  rows: ReviewCadenceRow[];
}

const reviewCadenceStatuses = new Set<InsightEventStatus>(["TODO", "REVIEW_PENDING"]);
const levelWeight: Record<InsightEventLevel, number> = { P0: 3, P1: 2, P2: 1 };
const bucketLabels: Record<ReviewCadenceBucketKey, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming"
};
const bucketOrder: Record<ReviewCadenceBucketKey, number> = {
  overdue: 0,
  today: 1,
  upcoming: 2
};

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
      totalScore: bucketRows.reduce((sum, row) => sum + row.event.scoreTotal, 0)
    };
  });
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
