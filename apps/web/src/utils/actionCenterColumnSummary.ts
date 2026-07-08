import type { InsightEvent } from "@amazon-monitor/shared";

export interface ActionColumnSummary {
  eventCount: number;
  totalScore: number;
  averageScore: number;
  p0Count: number;
  dueNowCount: number;
  assignedCount: number;
  assignedPercent: number;
}

export function buildActionColumnSummary(events: InsightEvent[], currentDate: string): ActionColumnSummary {
  const eventCount = events.length;
  const totalScore = events.reduce((sum, event) => sum + event.scoreTotal, 0);
  const assignedCount = events.filter((event) => (event.assignee?.trim() ?? "").length > 0).length;

  return {
    eventCount,
    totalScore,
    averageScore: eventCount > 0 ? Math.round(totalScore / eventCount) : 0,
    p0Count: events.filter((event) => event.eventLevel === "P0").length,
    dueNowCount: events.filter((event) => isDueNow(event, currentDate)).length,
    assignedCount,
    assignedPercent: percent(assignedCount, eventCount)
  };
}

function isDueNow(event: InsightEvent, currentDate: string): boolean {
  return currentDate.length > 0 && event.reviewDueDate !== null && event.reviewDueDate <= currentDate;
}

function percent(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}
