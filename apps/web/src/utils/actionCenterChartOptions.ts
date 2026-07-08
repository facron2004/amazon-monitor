import {
  attributionTagLabels,
  attributionTags,
  inferInsightEventStrategyTags,
  insightEventTypeLabels,
  insightEventTypes,
  strategyTagLabels,
  strategyTags,
  type ActionEvidenceMovementFilter,
  type ActionScoreDriverFilter,
  type AttributionTag,
  type InsightEvent,
  type InsightEventLevel,
  type InsightEventStatus,
  type InsightEventType,
  type InsightEventTrendPoint,
  type StrategyTag
} from "@amazon-monitor/shared";
import { buildReviewCadenceSummary } from "./actionCenterReviewCadence";
import { buildReviewOutcomeSummary } from "./actionCenterReviewOutcomes";
import { getActionEvidenceMovementRows } from "./actionCenterEvidenceDeltas";
import { getActionScoreCompositionRows } from "./actionCenterScoreBreakdown";

type ChartDatum = { name: string; value: number; [key: string]: unknown };
type EchartsSeriesData = Array<number | ChartDatum>;

export interface ReviewCadencePriorityDatum {
  name: string;
  total: number;
  P0: number;
  P1: number;
  P2: number;
}

export interface BrandActionPressureRow {
  brand: string;
  value: number;
  eventCount: number;
  p0Count: number;
  matrixSurgeCount: number;
  matrixDropCount: number;
  brandTop100ShareChange: number | null;
  topEventId: string;
  topEventTitle: string;
  canFocus: boolean;
}

export interface ActionStrategyFocusRow {
  tag: StrategyTag;
  name: string;
  value: number;
}

export interface ActionChartSummary {
  visibleCount: number;
  openCount: number;
  reviewedCount: number;
  topScoreDriver: {
    key: ActionScoreDriverFilter;
    label: string;
    value: number;
    percent: number;
  } | null;
  topEvidenceMovement: {
    filter: ActionEvidenceMovementFilter;
    label: string;
    value: number;
  } | null;
  topBrandPressure: {
    brand: string;
    value: number;
    eventCount: number;
    p0Count: number;
    matrixSurgeCount: number;
    matrixDropCount: number;
    brandTop100ShareChange: number | null;
    canFocus: boolean;
  } | null;
  topStrategyFocus: {
    tag: StrategyTag;
    label: string;
    value: number;
  } | null;
  latestTrend: InsightEventTrendPoint | null;
  trendDelta: number | null;
}

export interface ActionReviewQueueSummary {
  totalCount: number;
  dueNowCount: number;
  overdueCount: number;
  todayCount: number;
  p0DueCount: number;
  dueNowPercent: number;
  healthLabel: string;
  healthTone: "danger" | "warning" | "success" | "info";
}

export interface ActionChartCaptions {
  workflow: string;
  priority: string;
  brandPressure: string;
  eventType: string;
  score: string;
  evidenceMovement: string;
  attribution: string;
  strategy: string;
  reviewCadence: string;
  trend: string;
  reviewOutcome: string;
}

export type ActionChartTakeawayTone = "success" | "warning" | "info" | "error";

export interface ActionChartTakeaway {
  key: "pressure" | "driver" | "followUp";
  label: string;
  title: string;
  detail: string;
  tone: ActionChartTakeawayTone;
  actionLabel: string;
}

export type ActionChartPathStepKey = "scope" | "pressure" | "driver" | "followUp";
export type ActionChartPathStepStatus = "wait" | "process" | "finish" | "error" | "success";

export interface ActionChartPathStep {
  key: ActionChartPathStepKey;
  label: string;
  title: string;
  detail: string;
  status: ActionChartPathStepStatus;
  actionLabel: string;
}

export function shouldPreferFollowUpChartGroup(
  events: InsightEvent[],
  reviewDueEvents: InsightEvent[]
): boolean {
  return events.length === 0 && reviewDueEvents.length > 0;
}

interface ActionCenterSeries {
  name: string;
  type: "bar" | "line" | "pie";
  data: EchartsSeriesData;
  [key: string]: unknown;
}

const chartTextStyle = {
  color: "#475569",
  fontFamily: "Noto Sans SC, Microsoft YaHei, sans-serif"
};

const tooltip = {
  backgroundColor: "rgba(255, 255, 255, 0.96)",
  borderColor: "#dbe4f0",
  borderWidth: 1,
  textStyle: { color: "#0f172a" },
  extraCssText: "box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12); border-radius: 12px;"
};
const actionableStatuses = new Set<InsightEventStatus>(["TODO", "WATCHING", "REVIEW_PENDING"]);
const attributionTagOrder = new Map<AttributionTag, number>(
  attributionTags.map((tag, index) => [tag, index])
);
const eventTypeOrder = new Map<InsightEventType, number>(
  insightEventTypes.map((type, index) => [type, index])
);
const strategyTagOrder = new Map<StrategyTag, number>(
  strategyTags.map((tag, index) => [tag, index])
);

function formatCompactAxisValue(value: number | string): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  if (Math.abs(numericValue) >= 1000) {
    const compactValue = numericValue / 1000;
    return `${Number.isInteger(compactValue) ? compactValue : compactValue.toFixed(1)}k`;
  }
  return String(numericValue);
}

export function getWorkflowFunnelData(events: InsightEvent[]): ChartDatum[] {
  return [
    { name: "待处理", value: events.filter((event) => event.status === "TODO").length },
    {
      name: "处理中",
      value: events.filter((event) => event.status === "WATCHING" || event.status === "REVIEW_PENDING").length
    },
    {
      name: "已关闭",
      value: events.filter((event) => event.status === "FOLLOWED" || event.status === "REVIEWED" || event.status === "IGNORED").length
    }
  ];
}

export function getPriorityMixData(events: InsightEvent[]): ChartDatum[] {
  const levels: InsightEventLevel[] = ["P0", "P1", "P2"];
  return levels.map((level) => ({
    name: level,
    value: events.filter((event) => event.eventLevel === level).length
  }));
}

export function getEventTypeMixData(events: InsightEvent[], limit = 6): ChartDatum[] {
  const counts = new Map<InsightEventType, number>();

  for (const event of events) {
    counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);
  }

  const rows = Array.from(counts, ([type, value]) => ({
    type,
    name: insightEventTypeLabels[type],
    value
  }))
    .sort((left, right) => (
      right.value - left.value
      || (eventTypeOrder.get(left.type) ?? Number.MAX_SAFE_INTEGER) - (eventTypeOrder.get(right.type) ?? Number.MAX_SAFE_INTEGER)
    ))
    .slice(0, limit)
    .map(({ name, value }) => ({ name, value }));

  return rows.length > 0 ? rows : [{ name: "暂无事件类型", value: 0 }];
}

export function getAttributionDriverData(events: InsightEvent[], limit = 6): ChartDatum[] {
  const counts = new Map<AttributionTag, number>();

  for (const event of events) {
    const tags: AttributionTag[] = event.attributionTags.length > 0 ? event.attributionTags : ["NO_CLEAR_DRIVER"];
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const rows = Array.from(counts, ([tag, value]) => ({
    tag,
    name: attributionTagLabels[tag],
    value
  }))
    .sort((left, right) => (
      right.value - left.value
      || (attributionTagOrder.get(left.tag) ?? Number.MAX_SAFE_INTEGER) - (attributionTagOrder.get(right.tag) ?? Number.MAX_SAFE_INTEGER)
    ))
    .slice(0, limit)
    .map(({ name, value }) => ({ name, value }));

  return rows.length > 0 ? rows : [{ name: "暂无归因驱动", value: 0 }];
}

export function getStrategyFocusRows(events: InsightEvent[]): ActionStrategyFocusRow[] {
  const counts = new Map<StrategyTag, number>();

  for (const event of events) {
    for (const tag of inferInsightEventStrategyTags(event)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts, ([tag, value]) => ({
    tag,
    name: strategyTagLabels[tag],
    value
  }))
    .sort((left, right) => (
      right.value - left.value
      || (strategyTagOrder.get(left.tag) ?? Number.MAX_SAFE_INTEGER) - (strategyTagOrder.get(right.tag) ?? Number.MAX_SAFE_INTEGER)
    ))
    .slice(0, 6);
}

export function getStrategyFocusData(events: InsightEvent[]): ChartDatum[] {
  const rows = getStrategyFocusRows(events).map(({ name, value }) => ({ name, value }));

  return rows.length > 0 ? rows : [{ name: "暂无策略标签", value: 0 }];
}

export function getBrandActionPressureRows(events: InsightEvent[], limit = 6): BrandActionPressureRow[] {
  type MutableBrandRow = BrandActionPressureRow & { topScore: number };
  const rows = new Map<string, MutableBrandRow>();

  for (const event of events) {
    if (!actionableStatuses.has(event.status)) continue;

    const explicitBrand = event.brand?.trim() ?? "";
    const brand = explicitBrand || "未知品牌";
    const isSurge = hasBrandMatrixSurgeSignal(event);
    const isDrop = hasBrandMatrixDropSignal(event);
    const current = rows.get(brand);
    if (!current) {
      rows.set(brand, {
        brand,
        value: event.scoreTotal,
        eventCount: 1,
        p0Count: event.eventLevel === "P0" ? 1 : 0,
        matrixSurgeCount: isSurge ? 1 : 0,
        matrixDropCount: isDrop ? 1 : 0,
        brandTop100ShareChange: finiteNumber(event.evidence.brandTop100ShareChange),
        topEventId: event.id,
        topEventTitle: event.eventTitle,
        topScore: event.scoreTotal,
        canFocus: explicitBrand.length > 0
      });
      continue;
    }

    current.value += event.scoreTotal;
    current.eventCount += 1;
    if (event.eventLevel === "P0") {
      current.p0Count += 1;
    }
    if (isSurge) {
      current.matrixSurgeCount += 1;
    }
    if (isDrop) {
      current.matrixDropCount += 1;
    }
    current.brandTop100ShareChange = dominantShareChange(
      current.brandTop100ShareChange,
      finiteNumber(event.evidence.brandTop100ShareChange)
    );
    if (event.scoreTotal > current.topScore) {
      current.topEventId = event.id;
      current.topEventTitle = event.eventTitle;
      current.topScore = event.scoreTotal;
    }
  }

  return Array.from(rows.values())
    .sort((left, right) => (
      right.value - left.value
      || right.p0Count - left.p0Count
      || right.eventCount - left.eventCount
      || left.brand.localeCompare(right.brand)
    ))
    .slice(0, limit)
    .map((row) => ({
      brand: row.brand,
      value: row.value,
      eventCount: row.eventCount,
      p0Count: row.p0Count,
      matrixSurgeCount: row.matrixSurgeCount,
      matrixDropCount: row.matrixDropCount,
      brandTop100ShareChange: row.brandTop100ShareChange,
      topEventId: row.topEventId,
      topEventTitle: row.topEventTitle,
      canFocus: row.canFocus
    }));
}

export function getReviewCadenceChartData(
  visibleEvents: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  currentDate: string
): ReviewCadencePriorityDatum[] {
  return buildReviewCadenceSummary(visibleEvents, reviewDueEvents, currentDate).buckets.map((bucket) => ({
    name: bucket.label,
    total: bucket.count,
    P0: bucket.p0Count,
    P1: bucket.p1Count,
    P2: bucket.p2Count
  }));
}

export function getReviewOutcomeMixData(events: InsightEvent[]): ChartDatum[] {
  const rows = buildReviewOutcomeSummary(events, "").rows.map((row) => ({
    name: row.label,
    value: row.count
  }));

  return rows.length > 0 ? rows : [{ name: "暂无复盘结果", value: 0 }];
}

export function getEvidenceMovementData(events: InsightEvent[]): ChartDatum[] {
  return getActionEvidenceMovementRows(events).map((row) => ({
    name: row.label,
    value: row.value
  }));
}

export function getActionChartSummary(events: InsightEvent[], trend: InsightEventTrendPoint[]): ActionChartSummary {
  const scoreRows = getActionScoreCompositionRows(events);
  const evidenceRows = getActionEvidenceMovementRows(events);
  const brandRows = getBrandActionPressureRows(events);
  const latestTrend = trend.at(-1) ?? null;
  const firstTrend = trend[0] ?? null;

  return {
    visibleCount: events.length,
    openCount: events.filter((event) => actionableStatuses.has(event.status)).length,
    reviewedCount: events.filter((event) => event.reviewResult !== null).length,
    topScoreDriver: topPositiveRow(scoreRows.map((row) => ({
      key: row.key as ActionScoreDriverFilter,
      label: row.label,
      value: row.value,
      percent: row.percent
    }))),
    topEvidenceMovement: topPositiveRow(evidenceRows.map((row) => ({
      filter: row.filter,
      label: row.label,
      value: row.value
    }))),
    topBrandPressure: brandRows[0] ? {
      brand: brandRows[0].brand,
      value: brandRows[0].value,
      eventCount: brandRows[0].eventCount,
      p0Count: brandRows[0].p0Count,
      matrixSurgeCount: brandRows[0].matrixSurgeCount,
      matrixDropCount: brandRows[0].matrixDropCount,
      brandTop100ShareChange: brandRows[0].brandTop100ShareChange,
      canFocus: brandRows[0].canFocus
    } : null,
    topStrategyFocus: topPositiveRow(getStrategyFocusRows(events).map((row) => ({
      tag: row.tag,
      label: row.name,
      value: row.value
    }))),
    latestTrend,
    trendDelta: firstTrend !== null && latestTrend !== null ? latestTrend.totalCount - firstTrend.totalCount : null
  };
}

export function getActionReviewQueueSummary(
  visibleEvents: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  currentDate: string
): ActionReviewQueueSummary {
  const { health } = buildReviewCadenceSummary(visibleEvents, reviewDueEvents, currentDate);
  return {
    totalCount: health.totalCount,
    dueNowCount: health.dueNowCount,
    overdueCount: health.overdueCount,
    todayCount: health.todayCount,
    p0DueCount: health.p0DueCount,
    dueNowPercent: health.dueNowPercent,
    healthLabel: health.healthLabel,
    healthTone: health.healthTone
  };
}

export function getActionChartCaptions(
  events: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  trend: InsightEventTrendPoint[],
  currentDate: string
): ActionChartCaptions {
  const summary = getActionChartSummary(events, trend);
  const priorityRows = getPriorityMixData(events);
  const scoreRows = getActionScoreCompositionRows(events);
  const totalScore = scoreRows.reduce((sum, row) => sum + row.value, 0);
  const topEventType = topPositiveDatum(getEventTypeMixData(events));
  const topAttribution = topPositiveDatum(getAttributionDriverData(events));
  const reviewQueue = getActionReviewQueueSummary(events, reviewDueEvents, currentDate);
  const outcomeSummary = buildReviewOutcomeSummary(events, currentDate);

  return {
    workflow: `${summary.openCount} 个打开 / ${summary.reviewedCount} 个已复盘 / ${summary.visibleCount} 条可见`,
    priority: priorityRows.map((row) => `${row.name} ${row.value}`).join(" / "),
    brandPressure: summary.topBrandPressure
      ? `${summary.topBrandPressure.brand}: ${summary.topBrandPressure.value} 打开分 / ${formatBrandMatrixSignal(summary.topBrandPressure)}`
      : "暂无未关闭品牌压力",
    eventType: topEventType
      ? `${topEventType.name}: ${topEventType.value} 条信号`
      : "当前范围暂无事件类型",
    score: summary.topScoreDriver
      ? `${totalScore} 总分 / 最高 ${summary.topScoreDriver.label} ${summary.topScoreDriver.percent}%`
      : `${totalScore} 总分 / ${events.length} 条信号`,
    evidenceMovement: summary.topEvidenceMovement
      ? `${summary.topEvidenceMovement.label}: ${summary.topEvidenceMovement.value} 条匹配信号`
      : "暂无证据变化",
    attribution: topAttribution
      ? `${topAttribution.name}: ${topAttribution.value} 条信号`
      : "暂无归因驱动",
    strategy: summary.topStrategyFocus
      ? `${summary.topStrategyFocus.label}: ${summary.topStrategyFocus.value} 条策略信号`
      : "暂无策略标签",
    reviewCadence: reviewQueue.totalCount > 0
      ? `${reviewQueue.healthLabel} / ${reviewQueue.dueNowPercent}% 需立即复盘 / ${reviewQueue.totalCount} 条排队`
      : "当前范围无复盘队列",
    trend: summary.latestTrend
      ? `最新 ${summary.latestTrend.date.slice(5)}: ${summary.latestTrend.totalCount} 条信号 / ${formatTrendDelta(summary.trendDelta)}`
      : "暂无 7 日趋势",
    reviewOutcome: outcomeSummary.reviewedCount > 0
      ? `${outcomeSummary.reviewedCount} 个已复盘 / ${outcomeSummary.validatedPercent}% 成立`
      : `${outcomeSummary.pendingReviewCount} 个待复盘 / 暂无结果`
  };
}

export function getActionChartTakeaways(
  events: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  trend: InsightEventTrendPoint[],
  currentDate: string
): ActionChartTakeaway[] {
  const summary = getActionChartSummary(events, trend);
  const reviewQueue = getActionReviewQueueSummary(events, reviewDueEvents, currentDate);

  return [
    buildPressureTakeaway(summary),
    buildDriverTakeaway(summary),
    buildFollowUpTakeaway(summary, reviewQueue)
  ];
}

export function getActionChartPathSteps(
  events: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  trend: InsightEventTrendPoint[],
  currentDate: string
): ActionChartPathStep[] {
  const summary = getActionChartSummary(events, trend);
  const reviewQueue = getActionReviewQueueSummary(events, reviewDueEvents, currentDate);
  const pressure = buildPressureTakeaway(summary);
  const driver = buildDriverTakeaway(summary);
  const followUp = buildFollowUpTakeaway(summary, reviewQueue);

  return [
    {
      key: "scope",
      label: "范围",
      title: summary.visibleCount > 0 ? `${summary.visibleCount} 条可见信号` : "暂无可见信号",
      detail: `${summary.openCount} 个打开 / ${summary.reviewedCount} 个已复盘`,
      status: summary.visibleCount > 0 ? "finish" : "wait",
      actionLabel: "查看总览"
    },
    {
      key: "pressure",
      label: pressure.label,
      title: pressure.title,
      detail: pressure.detail,
      status: pathStatusFromTakeaway(pressure),
      actionLabel: pressure.actionLabel || "查看总览"
    },
    {
      key: "driver",
      label: driver.label,
      title: driver.title,
      detail: driver.detail,
      status: pathStatusFromTakeaway(driver),
      actionLabel: driver.actionLabel || "查看驱动"
    },
    {
      key: "followUp",
      label: followUp.label,
      title: followUp.title,
      detail: followUp.detail,
      status: pathStatusFromTakeaway(followUp),
      actionLabel: followUp.actionLabel || "查看复盘"
    }
  ];
}

function topPositiveRow<T extends { label: string; value: number }>(rows: T[]): T | null {
  return rows
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))[0] ?? null;
}

function topPositiveDatum(rows: ChartDatum[]): ChartDatum | null {
  return rows
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name))[0] ?? null;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dominantShareChange(current: number | null, next: number | null): number | null {
  if (next === null) return current;
  if (current === null || Math.abs(next) > Math.abs(current)) return next;
  return current;
}

function hasBrandMatrixSurgeSignal(event: InsightEvent): boolean {
  return event.eventType === "BRAND_MATRIX_SURGE"
    || event.attributionTags.includes("BRAND_MATRIX_PUSH")
    || (event.evidence.brandRisingCount ?? 0) >= 3
    || (event.evidence.brandNewEntryCount ?? 0) >= 2
    || (finiteNumber(event.evidence.brandTop100ShareChange) ?? 0) >= 0.05;
}

function hasBrandMatrixDropSignal(event: InsightEvent): boolean {
  return event.eventType === "BRAND_MATRIX_DROP"
    || (event.evidence.brandDroppedCount ?? 0) >= 2
    || (event.evidence.brandRankDownCount ?? 0) >= 3
    || (finiteNumber(event.evidence.brandTop100ShareChange) ?? 0) <= -0.05;
}

function formatBrandMatrixSignal(pressure: Pick<BrandActionPressureRow, "eventCount" | "matrixSurgeCount" | "matrixDropCount" | "brandTop100ShareChange">): string {
  const matrix = [
    pressure.matrixSurgeCount > 0 ? `上攻 ${pressure.matrixSurgeCount}` : null,
    pressure.matrixDropCount > 0 ? `下滑 ${pressure.matrixDropCount}` : null,
    pressure.brandTop100ShareChange !== null ? `份额 ${formatSignedPercent(pressure.brandTop100ShareChange)}` : null
  ].filter(Boolean);
  return matrix.length > 0 ? matrix.join(" / ") : `${pressure.eventCount} 条事件`;
}

function formatSignedPercent(value: number): string {
  const percent = Math.round(value * 1000) / 10;
  return `${percent > 0 ? "+" : ""}${percent}%`;
}

function brandPressureColor(row: Pick<BrandActionPressureRow, "matrixSurgeCount" | "matrixDropCount" | "brandTop100ShareChange">): string {
  if (row.matrixDropCount > row.matrixSurgeCount || (row.brandTop100ShareChange ?? 0) < 0) return "#dc2626";
  if (row.matrixSurgeCount > row.matrixDropCount || (row.brandTop100ShareChange ?? 0) > 0) return "#0f766e";
  if (row.matrixDropCount > 0 && row.matrixSurgeCount > 0) return "#f59e0b";
  return "#2563eb";
}

function formatTrendDelta(delta: number | null): string {
  if (delta === null) return "无对比";
  if (delta === 0) return "持平";
  return `${delta > 0 ? "+" : ""}${delta} 条信号`;
}

function pathStatusFromTakeaway(takeaway: ActionChartTakeaway): ActionChartPathStepStatus {
  if (takeaway.tone === "error") return "error";
  if (takeaway.tone === "warning") return "process";
  if (takeaway.tone === "success") return "success";
  return takeaway.actionLabel ? "process" : "wait";
}

function buildPressureTakeaway(summary: ActionChartSummary): ActionChartTakeaway {
  const pressure = summary.topBrandPressure;
  if (pressure) {
    return {
      key: "pressure",
      label: "压力",
      title: `${pressure.brand} 打开压力最高`,
      detail: `${pressure.value} 打开分 / ${formatBrandMatrixSignal(pressure)} / ${pressure.p0Count} P0`,
      tone: pressure.p0Count > 0 ? "error" : "warning",
      actionLabel: pressure.canFocus ? "筛选品牌" : ""
    };
  }

  if (summary.openCount > 0) {
    return {
      key: "pressure",
      label: "压力",
      title: `${summary.openCount} 个动作待处理`,
      detail: `当前范围 ${summary.visibleCount} 条可见信号`,
      tone: "warning",
      actionLabel: ""
    };
  }

  return {
    key: "pressure",
    label: "压力",
    title: "暂无打开压力",
    detail: `当前范围 ${summary.visibleCount} 条可见信号`,
    tone: "success",
    actionLabel: ""
  };
}

function buildDriverTakeaway(summary: ActionChartSummary): ActionChartTakeaway {
  const scoreDriver = summary.topScoreDriver;
  const movement = summary.topEvidenceMovement;
  const strategy = summary.topStrategyFocus;

  if (scoreDriver && movement) {
    return {
      key: "driver",
      label: "驱动",
      title: `${scoreDriver.label} + ${movement.label}`,
      detail: `${scoreDriver.percent}% 分数占比 / ${movement.value} 条匹配信号`,
      tone: "info",
      actionLabel: "筛选驱动"
    };
  }

  if (strategy) {
    return {
      key: "driver",
      label: "驱动",
      title: strategy.label,
      detail: `${strategy.value} 条策略信号`,
      tone: "info",
      actionLabel: "筛选策略"
    };
  }

  return {
    key: "driver",
    label: "驱动",
    title: "暂无主导驱动",
    detail: "当前范围没有明确正向驱动",
    tone: "success",
    actionLabel: ""
  };
}

function buildFollowUpTakeaway(
  summary: ActionChartSummary,
  reviewQueue: ActionReviewQueueSummary
): ActionChartTakeaway {
  if (reviewQueue.overdueCount > 0) {
    return {
      key: "followUp",
      label: "复盘",
      title: `${reviewQueue.overdueCount} 个逾期复盘`,
      detail: `${reviewQueue.dueNowCount} 个需立即复盘 / ${reviewQueue.p0DueCount} 个 P0`,
      tone: "error",
      actionLabel: "打开复盘队列"
    };
  }

  if (reviewQueue.dueNowCount > 0) {
    return {
      key: "followUp",
      label: "复盘",
      title: `${reviewQueue.dueNowCount} 个今日需复盘`,
      detail: `${reviewQueue.p0DueCount} 个 P0 / ${reviewQueue.totalCount} 条排队`,
      tone: "warning",
      actionLabel: "打开复盘队列"
    };
  }

  if (reviewQueue.totalCount > 0) {
    return {
      key: "followUp",
      label: "复盘",
      title: `${reviewQueue.totalCount} 条已排期复盘`,
      detail: `${reviewQueue.healthLabel} / ${reviewQueue.dueNowPercent}% 需立即复盘`,
      tone: "success",
      actionLabel: "查看节奏"
    };
  }

  return {
    key: "followUp",
    label: "复盘",
    title: "暂无复盘队列",
    detail: `当前范围 ${summary.reviewedCount} 个已复盘结果`,
    tone: "info",
    actionLabel: ""
  };
}

export function buildWorkflowFunnelChartOption(events: InsightEvent[]) {
  const data = getWorkflowFunnelData(events);

  return {
    aria: {
      show: true,
      description: `Action Center 流程图，当前 ${events.length} 条可见事件。`
    },
    animationDuration: 420,
    color: ["#2563eb"],
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { top: 24, right: 16, bottom: 30, left: 40 },
    xAxis: {
      type: "category",
      data: data.map((item) => item.name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: chartTextStyle
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: chartTextStyle
    },
    series: [
      {
        name: "事件数",
        type: "bar",
        data: data.map((item) => item.value),
        barWidth: 28,
        itemStyle: {
          borderRadius: [7, 7, 0, 0],
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#60a5fa" },
              { offset: 1, color: "#2563eb" }
            ]
          }
        }
      }
    ] satisfies ActionCenterSeries[]
  };
}

export function buildActionTrendChartOption(trend: InsightEventTrendPoint[]) {
  const dates = trend.map((item) => item.date.slice(5));

  return {
    aria: {
      show: true,
      description: `Action Center 7 日趋势图，共 ${trend.length} 个日粒度点。`
    },
    animationDuration: 420,
    color: ["#2563eb", "#f97316", "#ef4444", "#0f766e"],
    tooltip: { ...tooltip, trigger: "axis" },
    legend: {
      bottom: 0,
      icon: "roundRect",
      textStyle: chartTextStyle
    },
    grid: { top: 24, right: 16, bottom: 66, left: 42 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: dates,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: chartTextStyle
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: chartTextStyle
    },
    series: [
      buildTrendLineSeries("总信号", trend.map((item) => item.totalCount), "#2563eb"),
      buildTrendLineSeries("打开", trend.map((item) => item.openCount), "#f97316"),
      buildTrendLineSeries("待复盘", trend.map((item) => item.reviewDueCount), "#ef4444"),
      buildTrendLineSeries("已复盘", trend.map((item) => item.reviewedCount), "#0f766e")
    ] satisfies ActionCenterSeries[]
  };
}

function buildTrendLineSeries(name: string, data: number[], color: string): ActionCenterSeries {
  return {
    name,
    type: "line",
    data,
    smooth: true,
    symbol: "circle",
    symbolSize: 6,
    lineStyle: { width: 2, color },
    itemStyle: { color },
    emphasis: { focus: "series" }
  };
}

export function buildBrandActionPressureChartOption(events: InsightEvent[]) {
  const data = getBrandActionPressureRows(events).reverse();

  return {
    aria: {
      show: true,
      description: "Action Center 品牌压力图，用于查看未关闭事件的品牌聚合压力。"
    },
    animationDuration: 420,
    color: ["#0f766e", "#dc2626", "#f59e0b", "#2563eb"],
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { top: 18, right: 18, bottom: 18, left: 112 },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: {
        ...chartTextStyle,
        formatter: formatCompactAxisValue
      }
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.brand),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: {
        ...chartTextStyle,
        overflow: "truncate",
        width: 96
      }
    },
    series: [
      {
        name: "打开分",
        type: "bar",
        data: data.map((item) => ({
          name: item.brand,
          value: item.value,
          matrixSurgeCount: item.matrixSurgeCount,
          matrixDropCount: item.matrixDropCount,
          brandTop100ShareChange: item.brandTop100ShareChange,
          itemStyle: { color: brandPressureColor(item) }
        })),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 7, 7, 0] }
      }
    ] satisfies ActionCenterSeries[]
  };
}

export function buildPriorityMixChartOption(events: InsightEvent[]) {
  const data = getPriorityMixData(events);

  return {
    aria: {
      show: true,
      description: `Action Center 优先级分布图，当前 ${events.length} 条可见事件。`
    },
    animationDuration: 420,
    color: ["#ef4444", "#f97316", "#64748b"],
    tooltip: { ...tooltip, trigger: "item" },
    legend: {
      bottom: 0,
      icon: "roundRect",
      textStyle: chartTextStyle
    },
    title: {
      text: String(events.length),
      subtext: "可见事件",
      left: "center",
      top: "35%",
      textStyle: { color: "#0f172a", fontSize: 24, fontWeight: 800 },
      subtextStyle: { color: "#64748b", fontSize: 12 }
    },
    series: [
      {
        name: "优先级",
        type: "pie",
        radius: ["54%", "74%"],
        center: ["50%", "43%"],
        avoidLabelOverlap: true,
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: 700 } },
        data
      }
    ] satisfies ActionCenterSeries[]
  };
}

export function buildEventTypeMixChartOption(events: InsightEvent[]) {
  const data = getEventTypeMixData(events).reverse();

  return {
    aria: {
      show: true,
      description: "Action Center 事件类型分布图。"
    },
    animationDuration: 420,
    color: ["#2563eb"],
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { top: 18, right: 16, bottom: 18, left: 120 },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: {
        ...chartTextStyle,
        formatter: formatCompactAxisValue
      }
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: {
        ...chartTextStyle,
        overflow: "truncate",
        width: 104
      }
    },
    series: [
      {
        name: "事件数",
        type: "bar",
        data: data.map((item) => ({
          name: item.name,
          value: item.value
        })),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 7, 7, 0] }
      }
    ] satisfies ActionCenterSeries[]
  };
}

export function buildAttributionDriverChartOption(events: InsightEvent[]) {
  const data = getAttributionDriverData(events).reverse();

  return {
    aria: {
      show: true,
      description: "Action Center 归因驱动分布图。"
    },
    animationDuration: 420,
    color: ["#7c3aed"],
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { top: 18, right: 16, bottom: 18, left: 116 },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: {
        ...chartTextStyle,
        formatter: formatCompactAxisValue
      }
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: {
        ...chartTextStyle,
        overflow: "truncate",
        width: 100
      }
    },
    series: [
      {
        name: "事件数",
        type: "bar",
        data: data.map((item) => ({
          name: item.name,
          value: item.value
        })),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 7, 7, 0] }
      }
    ] satisfies ActionCenterSeries[]
  };
}

export function buildScoreCompositionChartOption(events: InsightEvent[]) {
  const rows = getActionScoreCompositionRows(events);
  const totalScore = rows.reduce((sum, row) => sum + row.value, 0);

  return {
    aria: {
      show: true,
      description: "Action Center 机会评分构成图。"
    },
    animationDuration: 420,
    color: rows.map((row) => row.color),
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    legend: {
      bottom: 0,
      icon: "roundRect",
      textStyle: chartTextStyle
    },
    grid: { top: 42, right: 18, bottom: 74, left: 72 },
    title: {
      text: String(totalScore),
      subtext: "总分",
      left: 10,
      top: 0,
      textStyle: { color: "#0f172a", fontSize: 20, fontWeight: 800 },
      subtextStyle: { color: "#64748b", fontSize: 12 }
    },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: {
        ...chartTextStyle,
        formatter: formatCompactAxisValue
      }
    },
    yAxis: {
      type: "category",
      data: ["评分构成"],
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: chartTextStyle
    },
    series: rows.map((row) => ({
      name: row.label,
      type: "bar",
      stack: "score",
      data: [row.value],
      barWidth: 34,
      itemStyle: { color: row.color, borderRadius: 0 }
    })) satisfies ActionCenterSeries[]
  };
}

export function buildEvidenceMovementChartOption(events: InsightEvent[]) {
  const rows = getActionEvidenceMovementRows(events).reverse();

  return {
    aria: {
      show: true,
      description: "Action Center 证据变化分布图。"
    },
    animationDuration: 420,
    color: rows.map((row) => row.color),
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { top: 18, right: 16, bottom: 20, left: 112 },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: chartTextStyle
    },
    yAxis: {
      type: "category",
      data: rows.map((row) => row.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: chartTextStyle
    },
    series: [
      {
        name: "事件数",
        type: "bar",
        data: rows.map((row) => ({
          name: row.label,
          value: row.value,
          itemStyle: { color: row.color }
        })),
        barWidth: 18,
        itemStyle: { borderRadius: [0, 7, 7, 0] }
      }
    ] satisfies ActionCenterSeries[]
  };
}

export function buildStrategyFocusChartOption(events: InsightEvent[]) {
  const data = getStrategyFocusData(events).reverse();

  return {
    aria: {
      show: true,
      description: "Action Center 策略标签聚焦图。"
    },
    animationDuration: 420,
    color: ["#14b8a6"],
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { top: 18, right: 16, bottom: 18, left: 116 },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: chartTextStyle
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: {
        ...chartTextStyle,
        overflow: "truncate",
        width: 100
      }
    },
    series: [
      {
        name: "事件数",
        type: "bar",
        data: data.map((item) => ({
          name: item.name,
          value: item.value
        })),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 7, 7, 0] }
      }
    ] satisfies ActionCenterSeries[]
  };
}

export function buildReviewCadenceChartOption(
  visibleEvents: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  currentDate: string
) {
  const data = getReviewCadenceChartData(visibleEvents, reviewDueEvents, currentDate);

  return {
    aria: {
      show: true,
      description: "Action Center 复盘节奏图，按到期窗口和优先级拆分。"
    },
    animationDuration: 420,
    color: ["#ef4444", "#f97316", "#64748b"],
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    legend: {
      bottom: 0,
      icon: "roundRect",
      textStyle: chartTextStyle
    },
    grid: { top: 20, right: 16, bottom: 44, left: 40 },
    xAxis: {
      type: "category",
      data: data.map((item) => item.name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: chartTextStyle
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: chartTextStyle
    },
    series: [
      {
        name: "P0",
        type: "bar",
        stack: "priority",
        data: data.map((item) => item.P0),
        barWidth: 28,
        itemStyle: { borderRadius: [7, 7, 0, 0] }
      },
      {
        name: "P1",
        type: "bar",
        stack: "priority",
        data: data.map((item) => item.P1),
        barWidth: 28
      },
      {
        name: "P2",
        type: "bar",
        stack: "priority",
        data: data.map((item) => item.P2),
        barWidth: 28
      }
    ] satisfies ActionCenterSeries[]
  };
}

export function buildReviewOutcomeMixChartOption(events: InsightEvent[]) {
  const data = getReviewOutcomeMixData(events);
  const reviewedCount = events.filter((event) => event.reviewResult !== null).length;

  return {
    aria: {
      show: true,
      description: `Action Center 复盘结果分布图，当前 ${reviewedCount} 个已复盘事件。`
    },
    animationDuration: 420,
    color: ["#22c55e", "#0f766e", "#f59e0b", "#ef4444", "#64748b"],
    tooltip: { ...tooltip, trigger: "item" },
    legend: {
      bottom: 0,
      icon: "roundRect",
      textStyle: chartTextStyle
    },
    title: {
      text: String(reviewedCount),
      subtext: "已复盘",
      left: "center",
      top: "35%",
      textStyle: { color: "#0f172a", fontSize: 24, fontWeight: 800 },
      subtextStyle: { color: "#64748b", fontSize: 12 }
    },
    series: [
      {
        name: "复盘结果",
        type: "pie",
        radius: ["52%", "72%"],
        center: ["50%", "43%"],
        avoidLabelOverlap: true,
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: 700 } },
        data
      }
    ] satisfies ActionCenterSeries[]
  };
}
