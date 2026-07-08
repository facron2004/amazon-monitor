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

export interface OwnershipLoadSummary {
  openCount: number;
  assignedCount: number;
  unassignedCount: number;
  ownerCount: number;
  p0Count: number;
  reviewPendingCount: number;
  assignedPercent: number;
  unassignedPercent: number;
  topOwnerLabel: string;
  topOwnerScore: number;
  loadLabel: string;
  loadTone: "success" | "warning" | "danger" | "info";
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

export function buildOwnershipLoadSummary(events: InsightEvent[]): OwnershipLoadSummary {
  const rows = getOwnershipLoadRows(events, Number.MAX_SAFE_INTEGER);
  const openCount = rows.reduce((sum, row) => sum + row.eventCount, 0);
  const unassignedCount = rows.find((row) => row.assignee === null)?.eventCount ?? 0;
  const assignedCount = openCount - unassignedCount;
  const p0Count = rows.reduce((sum, row) => sum + row.p0Count, 0);
  const reviewPendingCount = rows.reduce((sum, row) => sum + row.reviewPendingCount, 0);
  const topOwner = rows[0] ?? null;

  return {
    openCount,
    assignedCount,
    unassignedCount,
    ownerCount: rows.filter((row) => row.assignee !== null).length,
    p0Count,
    reviewPendingCount,
    assignedPercent: percent(assignedCount, openCount),
    unassignedPercent: percent(unassignedCount, openCount),
    topOwnerLabel: topOwner?.label ?? "-",
    topOwnerScore: topOwner?.totalScore ?? 0,
    loadLabel: getLoadLabel(openCount, unassignedCount, p0Count, reviewPendingCount),
    loadTone: getLoadTone(openCount, unassignedCount, p0Count, reviewPendingCount)
  };
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

function percent(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function getLoadLabel(
  openCount: number,
  unassignedCount: number,
  p0Count: number,
  reviewPendingCount: number
): string {
  if (openCount === 0) return "No open load";
  if (unassignedCount > 0) return `${unassignedCount} unassigned`;
  if (p0Count > 0) return `${p0Count} P0 assigned`;
  if (reviewPendingCount > 0) return `${reviewPendingCount} in review`;
  return "Covered";
}

function getLoadTone(
  openCount: number,
  unassignedCount: number,
  p0Count: number,
  reviewPendingCount: number
): OwnershipLoadSummary["loadTone"] {
  if (openCount === 0) return "info";
  if (unassignedCount > 0) return "danger";
  if (p0Count > 0 || reviewPendingCount > 0) return "warning";
  return "success";
}
