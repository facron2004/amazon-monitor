import type {
  InsightEvent,
  InsightEventTrendPoint,
} from "@amazon-monitor/shared";
import { formatBrandMatrixSignal } from "./actionCenterBrandPressure";
import {
  getActionChartSummary,
  getActionReviewQueueSummary,
} from "./actionCenterChartSummary";
import type {
  ActionChartPathStep,
  ActionChartPathStepStatus,
  ActionChartSummary,
  ActionChartTakeaway,
  ActionReviewQueueSummary,
} from "./actionCenterChartTypes";

export function getActionChartTakeaways(
  events: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  trend: InsightEventTrendPoint[],
  currentDate: string,
): ActionChartTakeaway[] {
  const summary = getActionChartSummary(events, trend);
  const reviewQueue = getActionReviewQueueSummary(
    events,
    reviewDueEvents,
    currentDate,
  );

  return [
    buildPressureTakeaway(summary),
    buildDriverTakeaway(summary),
    buildFollowUpTakeaway(summary, reviewQueue),
  ];
}

export function getActionChartPathSteps(
  events: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  trend: InsightEventTrendPoint[],
  currentDate: string,
): ActionChartPathStep[] {
  const summary = getActionChartSummary(events, trend);
  const reviewQueue = getActionReviewQueueSummary(
    events,
    reviewDueEvents,
    currentDate,
  );
  const pressure = buildPressureTakeaway(summary);
  const driver = buildDriverTakeaway(summary);
  const followUp = buildFollowUpTakeaway(summary, reviewQueue);

  return [
    {
      key: "scope",
      label: "范围",
      title:
        summary.visibleCount > 0
          ? `${summary.visibleCount} 条可见信号`
          : "暂无可见信号",
      detail: `${summary.openCount} 个打开 / ${summary.reviewedCount} 个已复盘`,
      status: summary.visibleCount > 0 ? "finish" : "wait",
      actionLabel: "查看总览",
    },
    {
      key: "pressure",
      label: pressure.label,
      title: pressure.title,
      detail: pressure.detail,
      status: pathStatusFromTakeaway(pressure),
      actionLabel: pressure.actionLabel || "查看总览",
    },
    {
      key: "driver",
      label: driver.label,
      title: driver.title,
      detail: driver.detail,
      status: pathStatusFromTakeaway(driver),
      actionLabel: driver.actionLabel || "查看驱动",
    },
    {
      key: "followUp",
      label: followUp.label,
      title: followUp.title,
      detail: followUp.detail,
      status: pathStatusFromTakeaway(followUp),
      actionLabel: followUp.actionLabel || "查看复盘",
    },
  ];
}

function pathStatusFromTakeaway(
  takeaway: ActionChartTakeaway,
): ActionChartPathStepStatus {
  if (takeaway.tone === "error") return "error";
  if (takeaway.tone === "warning") return "process";
  if (takeaway.tone === "success") return "success";
  return takeaway.actionLabel ? "process" : "wait";
}

function buildPressureTakeaway(
  summary: ActionChartSummary,
): ActionChartTakeaway {
  const pressure = summary.topBrandPressure;
  if (pressure) {
    return {
      key: "pressure",
      label: "压力",
      title: `${pressure.brand} 打开压力最高`,
      detail: `${pressure.value} 打开分 / ${formatBrandMatrixSignal(pressure)} / ${pressure.p0Count} P0`,
      tone: pressure.p0Count > 0 ? "error" : "warning",
      actionLabel: pressure.canFocus ? "筛选品牌" : "",
    };
  }

  if (summary.openCount > 0) {
    return {
      key: "pressure",
      label: "压力",
      title: `${summary.openCount} 个动作待处理`,
      detail: `当前范围 ${summary.visibleCount} 条可见信号`,
      tone: "warning",
      actionLabel: "",
    };
  }

  return {
    key: "pressure",
    label: "压力",
    title: "暂无打开压力",
    detail: `当前范围 ${summary.visibleCount} 条可见信号`,
    tone: "success",
    actionLabel: "",
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
      actionLabel: "筛选驱动",
    };
  }

  if (strategy) {
    return {
      key: "driver",
      label: "驱动",
      title: strategy.label,
      detail: `${strategy.value} 条策略信号`,
      tone: "info",
      actionLabel: "筛选策略",
    };
  }

  return {
    key: "driver",
    label: "驱动",
    title: "暂无主导驱动",
    detail: "当前范围没有明确正向驱动",
    tone: "success",
    actionLabel: "",
  };
}

function buildFollowUpTakeaway(
  summary: ActionChartSummary,
  reviewQueue: ActionReviewQueueSummary,
): ActionChartTakeaway {
  if (reviewQueue.overdueCount > 0) {
    return {
      key: "followUp",
      label: "复盘",
      title: `${reviewQueue.overdueCount} 个逾期复盘`,
      detail: `${reviewQueue.dueNowCount} 个需立即复盘 / ${reviewQueue.p0DueCount} 个 P0`,
      tone: "error",
      actionLabel: "打开复盘队列",
    };
  }

  if (reviewQueue.dueNowCount > 0) {
    return {
      key: "followUp",
      label: "复盘",
      title: `${reviewQueue.dueNowCount} 个今日需复盘`,
      detail: `${reviewQueue.p0DueCount} 个 P0 / ${reviewQueue.totalCount} 条排队`,
      tone: "warning",
      actionLabel: "打开复盘队列",
    };
  }

  if (reviewQueue.totalCount > 0) {
    return {
      key: "followUp",
      label: "复盘",
      title: `${reviewQueue.totalCount} 条已排期复盘`,
      detail: `${reviewQueue.healthLabel} / ${reviewQueue.dueNowPercent}% 需立即复盘`,
      tone: "success",
      actionLabel: "查看节奏",
    };
  }

  return {
    key: "followUp",
    label: "复盘",
    title: "暂无复盘队列",
    detail: `当前范围 ${summary.reviewedCount} 个已复盘结果`,
    tone: "info",
    actionLabel: "",
  };
}
