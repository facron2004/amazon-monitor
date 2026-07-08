import type { InsightEvent, InsightEventStatus } from "./insight-events.js";

export const actionEvidenceMovementFilters = ["rankGain", "priceCut", "reviewGrowth"] as const;
export type ActionEvidenceMovementFilter = (typeof actionEvidenceMovementFilters)[number];

export const reviewCadenceBucketKeys = ["overdue", "today", "upcoming"] as const;
export type ReviewCadenceBucketKey = (typeof reviewCadenceBucketKeys)[number];

export const actionStageFilters = ["reviewDue", "unassigned", "ready", "watching", "scheduled", "closed"] as const;
export type ActionStageFilter = (typeof actionStageFilters)[number];

export const actionStageFilterLabels: Record<ActionStageFilter, string> = {
  reviewDue: "复盘到期",
  unassigned: "待分配",
  ready: "可执行",
  watching: "观察中",
  scheduled: "已排期",
  closed: "已关闭"
};

export const actionScoreDriverFilters = [
  "rankingScore",
  "productScore",
  "promoScore",
  "brandScore",
  "riskScore"
] as const;
export type ActionScoreDriverFilter = (typeof actionScoreDriverFilters)[number];

const reviewCadenceStatuses = new Set<InsightEventStatus>(["TODO", "REVIEW_PENDING"]);
const closedStatuses = new Set<InsightEventStatus>(["FOLLOWED", "REVIEWED", "IGNORED"]);

export function isActionEvidenceMovementMatch(event: InsightEvent, filter: ActionEvidenceMovementFilter): boolean {
  if (filter === "rankGain") return isPositiveDelta(getRankDelta(event));
  if (filter === "priceCut") return isNegativeDelta(getPriceDelta(event));
  return isPositiveDelta(getReviewDelta(event));
}

export function isReviewCadenceBucketMatch(
  event: InsightEvent,
  bucket: ReviewCadenceBucketKey,
  currentDate: string
): boolean {
  return isReviewCadenceEvent(event) && bucketForDueDate(event.reviewDueDate ?? currentDate, currentDate) === bucket;
}

export function isActionScoreDriverMatch(event: InsightEvent, filter: ActionScoreDriverFilter): boolean {
  const rows = actionScoreDriverFilters.map((key) => ({ key, value: event.scoreBreakdown[key] }));
  const maxScore = Math.max(0, ...rows.map((row) => row.value));
  if (maxScore <= 0) return false;
  return rows.some((row) => row.key === filter && row.value === maxScore);
}

export function isActionStageMatch(event: InsightEvent, filter: ActionStageFilter, currentDate: string): boolean {
  if (filter === "reviewDue") return isReviewDue(event, currentDate);
  if (filter === "unassigned") return !closedStatuses.has(event.status) && !isReviewDue(event, currentDate) && !event.assignee?.trim();
  if (filter === "ready") return event.status === "TODO" && !isReviewDue(event, currentDate) && Boolean(event.assignee?.trim());
  if (filter === "watching") return event.status === "WATCHING" && !isReviewDue(event, currentDate);
  if (filter === "scheduled") return event.status === "REVIEW_PENDING" && !isReviewDue(event, currentDate);
  return closedStatuses.has(event.status) && !isReviewDue(event, currentDate);
}

function isReviewCadenceEvent(event: InsightEvent): boolean {
  return event.reviewDueDate !== null && reviewCadenceStatuses.has(event.status);
}

function isReviewDue(event: InsightEvent, currentDate: string): boolean {
  return event.status !== "REVIEWED" && event.reviewDueDate !== null && Boolean(currentDate) && event.reviewDueDate <= currentDate;
}

function bucketForDueDate(dueDate: string, currentDate: string): ReviewCadenceBucketKey {
  if (dueDate < currentDate) return "overdue";
  if (dueDate === currentDate) return "today";
  return "upcoming";
}

function getRankDelta(event: InsightEvent): number | null {
  const before = toFiniteNumber(event.evidence.previousRank);
  const after = toFiniteNumber(event.evidence.currentRank);
  return before !== null && after !== null ? before - after : toFiniteNumber(event.evidence.rankChange);
}

function getPriceDelta(event: InsightEvent): number | null {
  const before = toFiniteNumber(event.evidence.priceBefore);
  const after = toFiniteNumber(event.evidence.priceAfter);
  return before !== null && after !== null ? after - before : null;
}

function getReviewDelta(event: InsightEvent): number | null {
  const before = toFiniteNumber(event.evidence.reviewCountBefore);
  const after = toFiniteNumber(event.evidence.reviewCountAfter);
  return before !== null && after !== null ? after - before : toFiniteNumber(event.evidence.reviewCountChange);
}

function isPositiveDelta(value: number | null): boolean {
  return value !== null && value > 0;
}

function isNegativeDelta(value: number | null): boolean {
  return value !== null && value < 0;
}

function toFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
