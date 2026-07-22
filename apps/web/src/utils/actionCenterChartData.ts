import {
  attributionTagLabels,
  attributionTags,
  inferInsightEventStrategyTags,
  insightEventTypeLabels,
  insightEventTypes,
  strategyTagLabels,
  strategyTags,
  type AttributionTag,
  type InsightEvent,
  type InsightEventLevel,
  type InsightEventStatus,
  type InsightEventType,
  type StrategyTag,
} from "@amazon-monitor/shared";
import { buildReviewCadenceSummary } from "./actionCenterReviewCadence";
import { buildReviewOutcomeSummary } from "./actionCenterReviewOutcomes";
import { getActionEvidenceMovementRows } from "./actionCenterEvidenceDeltas";
import type {
  ActionStrategyFocusRow,
  ChartDatum,
  ReviewCadencePriorityDatum,
} from "./actionCenterChartTypes";

export const actionableStatuses = new Set<InsightEventStatus>([
  "TODO",
  "WATCHING",
  "REVIEW_PENDING",
]);

const attributionTagOrder = new Map<AttributionTag, number>(
  attributionTags.map((tag, index) => [tag, index]),
);
const eventTypeOrder = new Map<InsightEventType, number>(
  insightEventTypes.map((type, index) => [type, index]),
);
const strategyTagOrder = new Map<StrategyTag, number>(
  strategyTags.map((tag, index) => [tag, index]),
);

export function shouldPreferFollowUpChartGroup(
  events: InsightEvent[],
  reviewDueEvents: InsightEvent[],
): boolean {
  return events.length === 0 && reviewDueEvents.length > 0;
}

export function getWorkflowFunnelData(events: InsightEvent[]): ChartDatum[] {
  return [
    {
      name: "待处理",
      value: events.filter((event) => event.status === "TODO").length,
    },
    {
      name: "处理中",
      value: events.filter(
        (event) =>
          event.status === "WATCHING" || event.status === "REVIEW_PENDING",
      ).length,
    },
    {
      name: "已关闭",
      value: events.filter(
        (event) =>
          event.status === "FOLLOWED" ||
          event.status === "REVIEWED" ||
          event.status === "IGNORED",
      ).length,
    },
  ];
}

export function getPriorityMixData(events: InsightEvent[]): ChartDatum[] {
  const levels: InsightEventLevel[] = ["P0", "P1", "P2"];
  return levels.map((level) => ({
    name: level,
    value: events.filter((event) => event.eventLevel === level).length,
  }));
}

export function getEventTypeMixData(
  events: InsightEvent[],
  limit = 6,
): ChartDatum[] {
  const counts = new Map<InsightEventType, number>();

  for (const event of events) {
    counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);
  }

  const rows = Array.from(counts, ([type, value]) => ({
    type,
    name: insightEventTypeLabels[type],
    value,
  }))
    .sort(
      (left, right) =>
        right.value - left.value ||
        (eventTypeOrder.get(left.type) ?? Number.MAX_SAFE_INTEGER) -
          (eventTypeOrder.get(right.type) ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, limit)
    .map(({ name, value }) => ({ name, value }));

  return rows.length > 0 ? rows : [{ name: "暂无事件类型", value: 0 }];
}

export function getAttributionDriverData(
  events: InsightEvent[],
  limit = 6,
): ChartDatum[] {
  const counts = new Map<AttributionTag, number>();

  for (const event of events) {
    const tags: AttributionTag[] =
      event.attributionTags.length > 0
        ? event.attributionTags
        : ["NO_CLEAR_DRIVER"];
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const rows = Array.from(counts, ([tag, value]) => ({
    tag,
    name: attributionTagLabels[tag],
    value,
  }))
    .sort(
      (left, right) =>
        right.value - left.value ||
        (attributionTagOrder.get(left.tag) ?? Number.MAX_SAFE_INTEGER) -
          (attributionTagOrder.get(right.tag) ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, limit)
    .map(({ name, value }) => ({ name, value }));

  return rows.length > 0 ? rows : [{ name: "暂无归因驱动", value: 0 }];
}

export function getStrategyFocusRows(
  events: InsightEvent[],
): ActionStrategyFocusRow[] {
  const counts = new Map<StrategyTag, number>();

  for (const event of events) {
    for (const tag of inferInsightEventStrategyTags(event)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts, ([tag, value]) => ({
    tag,
    name: strategyTagLabels[tag],
    value,
  }))
    .sort(
      (left, right) =>
        right.value - left.value ||
        (strategyTagOrder.get(left.tag) ?? Number.MAX_SAFE_INTEGER) -
          (strategyTagOrder.get(right.tag) ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, 6);
}

export function getStrategyFocusData(events: InsightEvent[]): ChartDatum[] {
  const rows = getStrategyFocusRows(events).map(({ name, value }) => ({
    name,
    value,
  }));

  return rows.length > 0 ? rows : [{ name: "暂无策略标签", value: 0 }];
}

export function getReviewCadenceChartData(
  visibleEvents: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  currentDate: string,
): ReviewCadencePriorityDatum[] {
  return buildReviewCadenceSummary(
    visibleEvents,
    reviewDueEvents,
    currentDate,
  ).buckets.map((bucket) => ({
    name: bucket.label,
    total: bucket.count,
    P0: bucket.p0Count,
    P1: bucket.p1Count,
    P2: bucket.p2Count,
  }));
}

export function getReviewOutcomeMixData(events: InsightEvent[]): ChartDatum[] {
  const rows = buildReviewOutcomeSummary(events, "").rows.map((row) => ({
    name: row.label,
    value: row.count,
  }));

  return rows.length > 0 ? rows : [{ name: "暂无复盘结果", value: 0 }];
}

export function getEvidenceMovementData(events: InsightEvent[]): ChartDatum[] {
  return getActionEvidenceMovementRows(events).map((row) => ({
    name: row.label,
    value: row.value,
  }));
}
