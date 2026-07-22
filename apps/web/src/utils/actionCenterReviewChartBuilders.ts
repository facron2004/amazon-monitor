import type { InsightEvent } from "@amazon-monitor/shared";
import {
  getReviewCadenceChartData,
  getReviewOutcomeMixData,
} from "./actionCenterChartData";
import {
  actionChartTooltip as tooltip,
  chartTextStyle,
  type ActionCenterSeries,
} from "./actionCenterChartTheme";

export function buildReviewCadenceChartOption(
  visibleEvents: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  currentDate: string,
) {
  const data = getReviewCadenceChartData(
    visibleEvents,
    reviewDueEvents,
    currentDate,
  );

  return {
    aria: {
      show: true,
      description: "Action Center 复盘节奏图，按到期窗口和优先级拆分。",
    },
    animationDuration: 420,
    color: ["#ef4444", "#f97316", "#64748b"],
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    legend: {
      bottom: 0,
      icon: "roundRect",
      textStyle: chartTextStyle,
    },
    grid: { top: 20, right: 16, bottom: 44, left: 40 },
    xAxis: {
      type: "category",
      data: data.map((item) => item.name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: chartTextStyle,
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: chartTextStyle,
    },
    series: [
      {
        name: "P0",
        type: "bar",
        stack: "priority",
        data: data.map((item) => item.P0),
        barWidth: 28,
        itemStyle: { borderRadius: [7, 7, 0, 0] },
      },
      {
        name: "P1",
        type: "bar",
        stack: "priority",
        data: data.map((item) => item.P1),
        barWidth: 28,
      },
      {
        name: "P2",
        type: "bar",
        stack: "priority",
        data: data.map((item) => item.P2),
        barWidth: 28,
      },
    ] satisfies ActionCenterSeries[],
  };
}

export function buildReviewOutcomeMixChartOption(events: InsightEvent[]) {
  const data = getReviewOutcomeMixData(events);
  const reviewedCount = events.filter(
    (event) => event.reviewResult !== null,
  ).length;

  return {
    aria: {
      show: true,
      description: `Action Center 复盘结果分布图，当前 ${reviewedCount} 个已复盘事件。`,
    },
    animationDuration: 420,
    color: ["#22c55e", "#0f766e", "#f59e0b", "#ef4444", "#64748b"],
    tooltip: { ...tooltip, trigger: "item" },
    legend: {
      bottom: 0,
      icon: "roundRect",
      textStyle: chartTextStyle,
    },
    title: {
      text: String(reviewedCount),
      subtext: "已复盘",
      left: "center",
      top: "35%",
      textStyle: { color: "#0f172a", fontSize: 24, fontWeight: 800 },
      subtextStyle: { color: "#64748b", fontSize: 12 },
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
        data,
      },
    ] satisfies ActionCenterSeries[],
  };
}
