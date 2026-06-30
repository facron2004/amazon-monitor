import type { PeriodInsightReportResponse } from "../api-types";

type EchartsSeriesData = Array<string | number | { name: string; value: number }>;

interface ReportSeries {
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

export function buildSignalMixChartOption(report: PeriodInsightReportResponse) {
  const summary = report.summary;
  const categories = ["S level", "A level", "Core risk", "Breakout"];
  const values = [summary.sLevelCount, summary.aLevelCount, summary.coreRiskCount, summary.newBreakoutCount];

  return {
    aria: {
      show: true,
      description: `${report.period} signal mix chart for ${report.startDate} to ${report.endDate}.`
    },
    color: ["#ef4444"],
    animationDuration: 420,
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { top: 28, right: 16, bottom: 34, left: 44 },
    xAxis: {
      type: "category",
      data: categories,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: chartTextStyle
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: chartTextStyle
    },
    series: [
      {
        name: "Signals",
        type: "bar",
        data: values,
        barWidth: 24,
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#fb7185" },
              { offset: 1, color: "#ef4444" }
            ]
          }
        }
      }
    ] satisfies ReportSeries[]
  };
}

export function buildReviewLoopChartOption(report: PeriodInsightReportResponse) {
  const summary = report.summary;
  const due = summary.reviewDueCount;
  const reviewed = summary.reviewedCount;
  const overdue = summary.overdueReviewDueCount;

  return {
    aria: {
      show: true,
      description: `${report.period} review loop chart with ${due} due, ${reviewed} reviewed, and ${overdue} overdue.`
    },
    color: ["#2563eb", "#14b8a6"],
    animationDuration: 420,
    tooltip: { ...tooltip, trigger: "item" },
    legend: {
      bottom: 0,
      icon: "roundRect",
      textStyle: chartTextStyle
    },
    title: {
      text: String(due),
      subtext: `due / ${overdue} overdue`,
      left: "center",
      top: "36%",
      textStyle: { color: "#0f172a", fontSize: 26, fontWeight: 800 },
      subtextStyle: { color: "#64748b", fontSize: 12 }
    },
    series: [
      {
        name: "Review loop",
        type: "pie",
        radius: ["54%", "74%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: 700 } },
        data: [
          { name: "Due backlog", value: due },
          { name: "Reviewed", value: reviewed }
        ]
      }
    ] satisfies ReportSeries[]
  };
}

export function buildBrandPressureChartOption(report: PeriodInsightReportResponse) {
  const brands = report.topBrands.slice(0, 8).reverse();
  const brandNames = brands.map((item) => item.brand);

  return {
    aria: {
      show: true,
      description: `${report.period} brand pressure chart for top brands by event count.`
    },
    color: ["#3b82f6", "#f97316"],
    animationDuration: 420,
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    legend: {
      top: 0,
      right: 0,
      icon: "roundRect",
      textStyle: chartTextStyle
    },
    grid: { top: 42, right: 24, bottom: 20, left: 92 },
    xAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: chartTextStyle
    },
    yAxis: {
      type: "category",
      data: brandNames,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: {
        ...chartTextStyle,
        overflow: "truncate",
        width: 78
      }
    },
    series: [
      {
        name: "Events",
        type: "bar",
        stack: "brand",
        data: brands.map((item) => item.eventCount),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 6, 6, 0] }
      },
      {
        name: "Core risks",
        type: "bar",
        stack: "brand",
        data: brands.map((item) => item.coreRiskCount),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 6, 6, 0] }
      }
    ] satisfies ReportSeries[]
  };
}
