import type {
  InsightEvent,
  InsightEventLevel,
  InsightEventStatus
} from "@amazon-monitor/shared";

export interface OwnershipLoadRow {
  assignee: string | null;
  label: string;
  eventCount: number;
  p0Count: number;
  reviewPendingCount: number;
  totalScore: number;
  topEventId: string;
  topEventTitle: string;
}

const ownershipStatuses = new Set<InsightEventStatus>(["TODO", "WATCHING", "REVIEW_PENDING"]);
const levelWeight: Record<InsightEventLevel, number> = { P0: 3, P1: 2, P2: 1 };

export function getOwnershipLoadRows(events: InsightEvent[], limit = 6): OwnershipLoadRow[] {
  type MutableOwnershipRow = OwnershipLoadRow & { topScore: number; topLevel: InsightEventLevel };
  const rows = new Map<string, MutableOwnershipRow>();

  for (const event of events) {
    if (!ownershipStatuses.has(event.status)) continue;

    const assignee = normalizeAssignee(event.assignee);
    const key = assignee ?? "__unassigned__";
    const current = rows.get(key);
    if (!current) {
      rows.set(key, {
        assignee,
        label: assignee ?? "Unassigned",
        eventCount: 1,
        p0Count: event.eventLevel === "P0" ? 1 : 0,
        reviewPendingCount: event.status === "REVIEW_PENDING" ? 1 : 0,
        totalScore: event.scoreTotal,
        topEventId: event.id,
        topEventTitle: event.eventTitle,
        topScore: event.scoreTotal,
        topLevel: event.eventLevel
      });
      continue;
    }

    current.eventCount += 1;
    current.totalScore += event.scoreTotal;
    if (event.eventLevel === "P0") current.p0Count += 1;
    if (event.status === "REVIEW_PENDING") current.reviewPendingCount += 1;
    if (isStrongerTopEvent(event, current.topScore, current.topLevel)) {
      current.topEventId = event.id;
      current.topEventTitle = event.eventTitle;
      current.topScore = event.scoreTotal;
      current.topLevel = event.eventLevel;
    }
  }

  return Array.from(rows.values())
    .sort(ownershipRowComparator)
    .slice(0, limit)
    .map((row) => ({
      assignee: row.assignee,
      label: row.label,
      eventCount: row.eventCount,
      p0Count: row.p0Count,
      reviewPendingCount: row.reviewPendingCount,
      totalScore: row.totalScore,
      topEventId: row.topEventId,
      topEventTitle: row.topEventTitle
    }));
}

function normalizeAssignee(assignee: string | null): string | null {
  const trimmed = assignee?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function isStrongerTopEvent(event: InsightEvent, currentTopScore: number, currentTopLevel: InsightEventLevel): boolean {
  return (
    levelWeight[event.eventLevel] > levelWeight[currentTopLevel]
    || (levelWeight[event.eventLevel] === levelWeight[currentTopLevel] && event.scoreTotal > currentTopScore)
  );
}

function ownershipRowComparator(left: OwnershipLoadRow, right: OwnershipLoadRow): number {
  return (
    right.totalScore - left.totalScore
    || right.p0Count - left.p0Count
    || right.reviewPendingCount - left.reviewPendingCount
    || right.eventCount - left.eventCount
    || left.label.localeCompare(right.label)
  );
}
