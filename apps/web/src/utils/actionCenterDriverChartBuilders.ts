import type { InsightEvent } from "@amazon-monitor/shared";
import { getActionEvidenceMovementRows } from "./actionCenterEvidenceDeltas";
import { getActionScoreCompositionRows } from "./actionCenterScoreBreakdown";
import {
  getAttributionDriverData,
  getStrategyFocusData,
} from "./actionCenterChartData";
import {
  actionChartTooltip as tooltip,
  chartTextStyle,
  formatCompactAxisValue,
  type ActionCenterSeries,
} from "./actionCenterChartTheme";

export function buildAttributionDriverChartOption(events: InsightEvent[]) {
  const data = getAttributionDriverData(events).reverse();

  return {
    aria: {
      show: true,
      description: "Action Center 归因驱动分布图。",
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
        formatter: formatCompactAxisValue,
      },
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: {
        ...chartTextStyle,
        overflow: "truncate",
        width: 100,
      },
    },
    series: [
      {
        name: "事件数",
        type: "bar",
        data: data.map((item) => ({
          name: item.name,
          value: item.value,
        })),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 7, 7, 0] },
      },
    ] satisfies ActionCenterSeries[],
  };
}

export function buildScoreCompositionChartOption(events: InsightEvent[]) {
  const rows = getActionScoreCompositionRows(events);
  const totalScore = rows.reduce((sum, row) => sum + row.value, 0);

  return {
    aria: {
      show: true,
      description: "Action Center 机会评分构成图。",
    },
    animationDuration: 420,
    color: rows.map((row) => row.color),
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    legend: {
      bottom: 0,
      icon: "roundRect",
      textStyle: chartTextStyle,
    },
    grid: { top: 42, right: 18, bottom: 74, left: 72 },
    title: {
      text: String(totalScore),
      subtext: "总分",
      left: 10,
      top: 0,
      textStyle: { color: "#0f172a", fontSize: 20, fontWeight: 800 },
      subtextStyle: { color: "#64748b", fontSize: 12 },
    },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: {
        ...chartTextStyle,
        formatter: formatCompactAxisValue,
      },
    },
    yAxis: {
      type: "category",
      data: ["评分构成"],
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: chartTextStyle,
    },
    series: rows.map((row) => ({
      name: row.label,
      type: "bar",
      stack: "score",
      data: [row.value],
      barWidth: 34,
      itemStyle: { color: row.color, borderRadius: 0 },
    })) satisfies ActionCenterSeries[],
  };
}

export function buildEvidenceMovementChartOption(events: InsightEvent[]) {
  const rows = getActionEvidenceMovementRows(events).reverse();

  return {
    aria: {
      show: true,
      description: "Action Center 证据变化分布图。",
    },
    animationDuration: 420,
    color: rows.map((row) => row.color),
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { top: 18, right: 16, bottom: 20, left: 112 },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: chartTextStyle,
    },
    yAxis: {
      type: "category",
      data: rows.map((row) => row.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: chartTextStyle,
    },
    series: [
      {
        name: "事件数",
        type: "bar",
        data: rows.map((row) => ({
          name: row.label,
          value: row.value,
          itemStyle: { color: row.color },
        })),
        barWidth: 18,
        itemStyle: { borderRadius: [0, 7, 7, 0] },
      },
    ] satisfies ActionCenterSeries[],
  };
}

export function buildStrategyFocusChartOption(events: InsightEvent[]) {
  const data = getStrategyFocusData(events).reverse();

  return {
    aria: {
      show: true,
      description: "Action Center 策略标签聚焦图。",
    },
    animationDuration: 420,
    color: ["#14b8a6"],
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { top: 18, right: 16, bottom: 18, left: 116 },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: chartTextStyle,
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: {
        ...chartTextStyle,
        overflow: "truncate",
        width: 100,
      },
    },
    series: [
      {
        name: "事件数",
        type: "bar",
        data: data.map((item) => ({
          name: item.name,
          value: item.value,
        })),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 7, 7, 0] },
      },
    ] satisfies ActionCenterSeries[],
  };
}
