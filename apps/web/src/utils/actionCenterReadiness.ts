import type {
  InsightEvent,
  InsightEventStatus
} from "@amazon-monitor/shared";

export interface ActionReadinessSummary {
  actionableCount: number;
  assignedCount: number;
  assignedPercent: number;
  scheduledReviewCount: number;
  scheduledReviewPercent: number;
  dueNowCount: number;
  unassignedCount: number;
  p0OpenCount: number;
  totalScore: number;
}

const actionableStatuses = new Set<InsightEventStatus>(["TODO", "WATCHING", "REVIEW_PENDING"]);

export function buildActionReadinessSummary(events: InsightEvent[], currentDate: string): ActionReadinessSummary {
  const actionableEvents = events.filter((event) => actionableStatuses.has(event.status));
  const actionableCount = actionableEvents.length;
  const assignedCount = actionableEvents.filter((event) => hasAssignee(event)).length;
  const scheduledReviewCount = actionableEvents.filter((event) => event.reviewDueDate !== null).length;

  return {
    actionableCount,
    assignedCount,
    assignedPercent: percent(assignedCount, actionableCount),
    scheduledReviewCount,
    scheduledReviewPercent: percent(scheduledReviewCount, actionableCount),
    dueNowCount: actionableEvents.filter((event) => isDueNow(event, currentDate)).length,
    unassignedCount: actionableCount - assignedCount,
    p0OpenCount: actionableEvents.filter((event) => event.eventLevel === "P0").length,
    totalScore: actionableEvents.reduce((sum, event) => sum + event.scoreTotal, 0)
  };
}

function hasAssignee(event: InsightEvent): boolean {
  return (event.assignee?.trim() ?? "").length > 0;
}

function isDueNow(event: InsightEvent, currentDate: string): boolean {
  return currentDate.length > 0 && event.reviewDueDate !== null && event.reviewDueDate <= currentDate;
}

function percent(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}
