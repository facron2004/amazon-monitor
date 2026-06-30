import {
  inferInsightEventStrategyTags,
  strategyTagLabels,
  type InsightEvent,
  type InsightEventLevel,
  type StrategyTag
} from "@amazon-monitor/shared";

export interface StrategyFocusRow {
  tag: StrategyTag;
  label: string;
  eventCount: number;
  p0Count: number;
  totalScore: number;
  topEventId: string;
  topEventTitle: string;
}

const levelWeight: Record<InsightEventLevel, number> = { P0: 3, P1: 2, P2: 1 };

export function getStrategyFocusRows(events: InsightEvent[], limit = 6): StrategyFocusRow[] {
  type MutableStrategyRow = StrategyFocusRow & { topScore: number; topLevel: InsightEventLevel };
  const rows = new Map<StrategyTag, MutableStrategyRow>();

  for (const event of events) {
    for (const tag of inferInsightEventStrategyTags(event)) {
      const current = rows.get(tag);
      if (!current) {
        rows.set(tag, {
          tag,
          label: strategyTagLabels[tag],
          eventCount: 1,
          p0Count: event.eventLevel === "P0" ? 1 : 0,
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
      if (isStrongerTopEvent(event, current.topScore, current.topLevel)) {
        current.topEventId = event.id;
        current.topEventTitle = event.eventTitle;
        current.topScore = event.scoreTotal;
        current.topLevel = event.eventLevel;
      }
    }
  }

  return Array.from(rows.values())
    .sort(strategyFocusRowComparator)
    .slice(0, limit)
    .map((row) => ({
      tag: row.tag,
      label: row.label,
      eventCount: row.eventCount,
      p0Count: row.p0Count,
      totalScore: row.totalScore,
      topEventId: row.topEventId,
      topEventTitle: row.topEventTitle
    }));
}

function isStrongerTopEvent(event: InsightEvent, currentTopScore: number, currentTopLevel: InsightEventLevel): boolean {
  return (
    levelWeight[event.eventLevel] > levelWeight[currentTopLevel]
    || (levelWeight[event.eventLevel] === levelWeight[currentTopLevel] && event.scoreTotal > currentTopScore)
  );
}

function strategyFocusRowComparator(left: StrategyFocusRow, right: StrategyFocusRow): number {
  return (
    right.totalScore - left.totalScore
    || right.p0Count - left.p0Count
    || right.eventCount - left.eventCount
    || left.label.localeCompare(right.label)
  );
}
