import {
  insightEventStatusLabels,
  insightEventTypeLabels,
  type InsightEvent,
  type InsightEventLevel
} from "@amazon-monitor/shared";

export interface ActionSignalFlowRow {
  id: string;
  title: string;
  summary: string;
  level: InsightEventLevel;
  statusLabel: string;
  typeLabel: string;
  brandLabel: string;
  asinLabel: string;
  timestampLabel: string;
  scoreTotal: number;
  scorePercent: number;
  isReviewDue: boolean;
}

const levelWeight: Record<InsightEventLevel, number> = {
  P0: 3,
  P1: 2,
  P2: 1
};

export function getActionSignalFlowRows(
  events: InsightEvent[],
  currentDate: string,
  limit = 6
): ActionSignalFlowRow[] {
  return [...events]
    .sort((left, right) => {
      const dueDelta = Number(isReviewDue(right, currentDate)) - Number(isReviewDue(left, currentDate));
      if (dueDelta !== 0) return dueDelta;

      const levelDelta = levelWeight[right.eventLevel] - levelWeight[left.eventLevel];
      if (levelDelta !== 0) return levelDelta;

      const scoreDelta = right.scoreTotal - left.scoreTotal;
      if (scoreDelta !== 0) return scoreDelta;

      return right.createdAt.localeCompare(left.createdAt);
    })
    .slice(0, limit)
    .map((event) => ({
      id: event.id,
      title: event.eventTitle,
      summary: event.eventSummary,
      level: event.eventLevel,
      statusLabel: insightEventStatusLabels[event.status],
      typeLabel: insightEventTypeLabels[event.eventType],
      brandLabel: event.brand?.trim() || "Unknown brand",
      asinLabel: event.asin ?? "No ASIN",
      timestampLabel: getSignalTimestampLabel(event),
      scoreTotal: event.scoreTotal,
      scorePercent: clampScorePercent(event.scoreTotal),
      isReviewDue: isReviewDue(event, currentDate)
    }));
}

function isReviewDue(event: InsightEvent, currentDate: string): boolean {
  return event.status !== "REVIEWED" && event.reviewDueDate !== null && Boolean(currentDate) && event.reviewDueDate <= currentDate;
}

function getSignalTimestampLabel(event: InsightEvent): string {
  const createdAt = event.createdAt.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(createdAt)) {
    return `${createdAt.slice(5, 10)} ${createdAt.slice(11, 16)}`;
  }
  return event.eventDate.slice(5) || event.eventDate;
}

function clampScorePercent(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}
