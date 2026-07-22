import type {
  InsightEvent,
  InsightEventTrendPoint,
} from "@amazon-monitor/shared";
import {
  brandPressureColor,
  getBrandActionPressureRows,
} from "./actionCenterBrandPressure";
import {
  getEventTypeMixData,
  getPriorityMixData,
  getWorkflowFunnelData,
} from "./actionCenterChartData";
import {
  actionChartTooltip as tooltip,
  chartTextStyle,
  formatCompactAxisValue,
  type ActionCenterSeries,
} from "./actionCenterChartTheme";

export function buildWorkflowFunnelChartOption(events: InsightEvent[]) {
  const data = getWorkflowFunnelData(events);

  return {
    aria: {
      show: true,
      description: `Action Center 流程图，当前 ${events.length} 条可见事件。`,
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
              { offset: 1, color: "#2563eb" },
            ],
          },
        },
      },
    ] satisfies ActionCenterSeries[],
  };
}

export function buildActionTrendChartOption(trend: InsightEventTrendPoint[]) {
  const dates = trend.map((item) => item.date.slice(5));

  return {
    aria: {
      show: true,
      description: `Action Center 7 日趋势图，共 ${trend.length} 个日粒度点。`,
    },
    animationDuration: 420,
    color: ["#2563eb", "#f97316", "#ef4444", "#0f766e"],
    tooltip: { ...tooltip, trigger: "axis" },
    legend: {
      bottom: 0,
      icon: "roundRect",
      textStyle: chartTextStyle,
    },
    grid: { top: 24, right: 16, bottom: 66, left: 42 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: dates,
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
      buildTrendLineSeries(
        "总信号",
        trend.map((item) => item.totalCount),
        "#2563eb",
      ),
      buildTrendLineSeries(
        "打开",
        trend.map((item) => item.openCount),
        "#f97316",
      ),
      buildTrendLineSeries(
        "待复盘",
        trend.map((item) => item.reviewDueCount),
        "#ef4444",
      ),
      buildTrendLineSeries(
        "已复盘",
        trend.map((item) => item.reviewedCount),
        "#0f766e",
      ),
    ] satisfies ActionCenterSeries[],
  };
}

function buildTrendLineSeries(
  name: string,
  data: number[],
  color: string,
): ActionCenterSeries {
  return {
    name,
    type: "line",
    data,
    smooth: true,
    symbol: "circle",
    symbolSize: 6,
    lineStyle: { width: 2, color },
    itemStyle: { color },
    emphasis: { focus: "series" },
  };
}

export function buildBrandActionPressureChartOption(events: InsightEvent[]) {
  const data = getBrandActionPressureRows(events).reverse();

  return {
    aria: {
      show: true,
      description:
        "Action Center 品牌压力图，用于查看未关闭事件的品牌聚合压力。",
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
        formatter: formatCompactAxisValue,
      },
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.brand),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: {
        ...chartTextStyle,
        overflow: "truncate",
        width: 96,
      },
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
          itemStyle: { color: brandPressureColor(item) },
        })),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 7, 7, 0] },
      },
    ] satisfies ActionCenterSeries[],
  };
}

export function buildPriorityMixChartOption(events: InsightEvent[]) {
  const data = getPriorityMixData(events);

  return {
    aria: {
      show: true,
      description: `Action Center 优先级分布图，当前 ${events.length} 条可见事件。`,
    },
    animationDuration: 420,
    color: ["#ef4444", "#f97316", "#64748b"],
    tooltip: { ...tooltip, trigger: "item" },
    legend: {
      bottom: 0,
      icon: "roundRect",
      textStyle: chartTextStyle,
    },
    title: {
      text: String(events.length),
      subtext: "可见事件",
      left: "center",
      top: "35%",
      textStyle: { color: "#0f172a", fontSize: 24, fontWeight: 800 },
      subtextStyle: { color: "#64748b", fontSize: 12 },
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
        data,
      },
    ] satisfies ActionCenterSeries[],
  };
}

export function buildEventTypeMixChartOption(events: InsightEvent[]) {
  const data = getEventTypeMixData(events).reverse();

  return {
    aria: {
      show: true,
      description: "Action Center 事件类型分布图。",
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
        width: 104,
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
