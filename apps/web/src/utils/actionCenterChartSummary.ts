import type {
  ActionScoreDriverFilter,
  InsightEvent,
  InsightEventTrendPoint,
} from "@amazon-monitor/shared";
import { buildReviewCadenceSummary } from "./actionCenterReviewCadence";
import { buildReviewOutcomeSummary } from "./actionCenterReviewOutcomes";
import { getActionEvidenceMovementRows } from "./actionCenterEvidenceDeltas";
import { getActionScoreCompositionRows } from "./actionCenterScoreBreakdown";
import {
  actionableStatuses,
  getAttributionDriverData,
  getEventTypeMixData,
  getPriorityMixData,
  getStrategyFocusRows,
} from "./actionCenterChartData";
import {
  formatBrandMatrixSignal,
  getBrandActionPressureRows,
} from "./actionCenterBrandPressure";
import type {
  ActionChartCaptions,
  ActionChartSummary,
  ActionReviewQueueSummary,
  ChartDatum,
} from "./actionCenterChartTypes";

export function getActionChartSummary(
  events: InsightEvent[],
  trend: InsightEventTrendPoint[],
): ActionChartSummary {
  const scoreRows = getActionScoreCompositionRows(events);
  const evidenceRows = getActionEvidenceMovementRows(events);
  const brandRows = getBrandActionPressureRows(events);
  const latestTrend = trend.at(-1) ?? null;
  const firstTrend = trend[0] ?? null;

  return {
    visibleCount: events.length,
    openCount: events.filter((event) => actionableStatuses.has(event.status))
      .length,
    reviewedCount: events.filter((event) => event.reviewResult !== null).length,
    topScoreDriver: topPositiveRow(
      scoreRows.map((row) => ({
        key: row.key as ActionScoreDriverFilter,
        label: row.label,
        value: row.value,
        percent: row.percent,
      })),
    ),
    topEvidenceMovement: topPositiveRow(
      evidenceRows.map((row) => ({
        filter: row.filter,
        label: row.label,
        value: row.value,
      })),
    ),
    topBrandPressure: brandRows[0]
      ? {
          brand: brandRows[0].brand,
          value: brandRows[0].value,
          eventCount: brandRows[0].eventCount,
          p0Count: brandRows[0].p0Count,
          matrixSurgeCount: brandRows[0].matrixSurgeCount,
          matrixDropCount: brandRows[0].matrixDropCount,
          brandTop100ShareChange: brandRows[0].brandTop100ShareChange,
          canFocus: brandRows[0].canFocus,
        }
      : null,
    topStrategyFocus: topPositiveRow(
      getStrategyFocusRows(events).map((row) => ({
        tag: row.tag,
        label: row.name,
        value: row.value,
      })),
    ),
    latestTrend,
    trendDelta:
      firstTrend !== null && latestTrend !== null
        ? latestTrend.totalCount - firstTrend.totalCount
        : null,
  };
}

export function getActionReviewQueueSummary(
  visibleEvents: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  currentDate: string,
): ActionReviewQueueSummary {
  const { health } = buildReviewCadenceSummary(
    visibleEvents,
    reviewDueEvents,
    currentDate,
  );
  return {
    totalCount: health.totalCount,
    dueNowCount: health.dueNowCount,
    overdueCount: health.overdueCount,
    todayCount: health.todayCount,
    p0DueCount: health.p0DueCount,
    dueNowPercent: health.dueNowPercent,
    healthLabel: health.healthLabel,
    healthTone: health.healthTone,
  };
}

export function getActionChartCaptions(
  events: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  trend: InsightEventTrendPoint[],
  currentDate: string,
): ActionChartCaptions {
  const summary = getActionChartSummary(events, trend);
  const priorityRows = getPriorityMixData(events);
  const scoreRows = getActionScoreCompositionRows(events);
  const totalScore = scoreRows.reduce((sum, row) => sum + row.value, 0);
  const topEventType = topPositiveDatum(getEventTypeMixData(events));
  const topAttribution = topPositiveDatum(getAttributionDriverData(events));
  const reviewQueue = getActionReviewQueueSummary(
    events,
    reviewDueEvents,
    currentDate,
  );
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
    reviewCadence:
      reviewQueue.totalCount > 0
        ? `${reviewQueue.healthLabel} / ${reviewQueue.dueNowPercent}% 需立即复盘 / ${reviewQueue.totalCount} 条排队`
        : "当前范围无复盘队列",
    trend: summary.latestTrend
      ? `最新 ${summary.latestTrend.date.slice(5)}: ${summary.latestTrend.totalCount} 条信号 / ${formatTrendDelta(summary.trendDelta)}`
      : "暂无 7 日趋势",
    reviewOutcome:
      outcomeSummary.reviewedCount > 0
        ? `${outcomeSummary.reviewedCount} 个已复盘 / ${outcomeSummary.validatedPercent}% 成立`
        : `${outcomeSummary.pendingReviewCount} 个待复盘 / 暂无结果`,
  };
}

function topPositiveRow<T extends { label: string; value: number }>(
  rows: T[],
): T | null {
  return (
    rows
      .filter((row) => row.value > 0)
      .sort(
        (left, right) =>
          right.value - left.value || left.label.localeCompare(right.label),
      )[0] ?? null
  );
}

function topPositiveDatum(rows: ChartDatum[]): ChartDatum | null {
  return (
    rows
      .filter((row) => row.value > 0)
      .sort(
        (left, right) =>
          right.value - left.value || left.name.localeCompare(right.name),
      )[0] ?? null
  );
}

function formatTrendDelta(delta: number | null): string {
  if (delta === null) return "无对比";
  if (delta === 0) return "持平";
  return `${delta > 0 ? "+" : ""}${delta} 条信号`;
}
