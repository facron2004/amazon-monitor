import type {
  AsinWatchState,
  InsightEvent,
  InsightEventStatus,
} from "@amazon-monitor/shared";
import type { ActionCenterColumnKey } from "../stores/insightEvents.js";

export function actionCenterColumnForStatus(
  status: InsightEventStatus,
): ActionCenterColumnKey {
  if (status === "TODO") return "todo";
  if (status === "WATCHING" || status === "REVIEW_PENDING") return "mid";
  return "closed";
}

export function uniqueInsightAsinCount(events: InsightEvent[]): number {
  return new Set(
    events
      .map((event) => event.asin)
      .filter((asin): asin is string => asin !== null),
  ).size;
}

export function countWatchingAsins(
  watchStates: AsinWatchState[],
  events: InsightEvent[],
): number {
  const asins = new Set<string>();
  for (const state of watchStates) {
    if (state.watchLevel !== "IGNORED") asins.add(state.asin);
  }
  for (const event of events) {
    if (event.status === "WATCHING" && event.asin !== null)
      asins.add(event.asin);
  }
  return asins.size;
}

export function countHighRiskCoreCompetitors(events: InsightEvent[]): number {
  return uniqueInsightAsinCount(
    events.filter(
      (event) =>
        event.eventType === "CORE_COMPETITOR_RISK" &&
        (event.eventLevel === "P0" || event.eventLevel === "P1"),
    ),
  );
}

export function buildReviewDueKpiDetail(
  events: InsightEvent[],
  currentDate: string,
): string {
  const overdueCount = events.filter(
    (event) =>
      event.reviewDueDate !== null && event.reviewDueDate < currentDate,
  ).length;
  const todayCount = events.filter(
    (event) => event.reviewDueDate === currentDate,
  ).length;

  if (overdueCount > 0 && todayCount > 0) {
    return `逾期 ${overdueCount} / 今日 ${todayCount}`;
  }
  if (overdueCount > 0) return `逾期 ${overdueCount}`;
  if (todayCount > 0) return `今日 ${todayCount}`;
  return "暂无到期";
}
