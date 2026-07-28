import type { OwnedProductDailyMetric } from "@amazon-monitor/shared";

export type ProductTrendMode = "commercial" | "ads" | "visibility";

const textStyle = {
  color: "#667085",
  fontFamily: "Inter, Noto Sans SC, Microsoft YaHei, sans-serif",
  fontSize: 11,
};

const axisLine = { lineStyle: { color: "#d0d5dd" } };
const splitLine = { lineStyle: { color: "#eaecf0", type: "dashed" } };

export function buildProductOperationsChartOption(
  metrics: OwnedProductDailyMetric[],
  mode: ProductTrendMode,
) {
  const rows = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
  const base = {
    aria: {
      show: true,
      description: `SKU ${mode} trend from ${rows[0]?.date ?? "unknown"} to ${rows.at(-1)?.date ?? "unknown"}.`,
    },
    animationDuration: 280,
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(255, 255, 255, 0.98)",
      borderColor: "#d0d5dd",
      textStyle: { color: "#101828" },
    },
    legend: {
      top: 0,
      right: 0,
      icon: "roundRect",
      textStyle,
    },
    grid: { top: 42, right: 42, bottom: 30, left: 46 },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.date.slice(5)),
      axisTick: { show: false },
      axisLine,
      axisLabel: textStyle,
    },
  };

  if (mode === "commercial") {
    return {
      ...base,
      color: ["#0071e3", "#16a36a"],
      yAxis: valueAndPercentAxes("销售额", "毛利率"),
      series: [
        barSeries("销售额", rows.map((row) => row.salesAmount)),
        lineSeries("毛利率", rows.map((row) => percent(row.grossMargin)), 1),
      ],
    };
  }
  if (mode === "ads") {
    return {
      ...base,
      color: ["#7c5ce7", "#f79009"],
      yAxis: valueAndPercentAxes("广告花费", "ACOS"),
      series: [
        barSeries("广告花费", rows.map((row) => row.adSpend)),
        lineSeries("ACOS", rows.map((row) => percent(row.acos)), 1),
      ],
    };
  }
  return {
    ...base,
    color: ["#16a36a", "#0071e3", "#f04438"],
    yAxis: [
      {
        type: "value",
        name: "库存天数",
        axisLine,
        splitLine,
        axisLabel: textStyle,
      },
      {
        type: "value",
        name: "排名",
        inverse: true,
        axisLine,
        splitLine: { show: false },
        axisLabel: textStyle,
      },
    ],
    series: [
      lineSeries("库存天数", rows.map((row) => row.inventoryDays)),
      lineSeries("核心词排名", rows.map((row) => row.keywordRank), 1),
      lineSeries("BSR", rows.map((row) => row.bsrRank), 1),
    ],
  };
}

export function hasProductTrendEvidence(
  metrics: OwnedProductDailyMetric[],
  mode: ProductTrendMode,
): boolean {
  const fields: Array<keyof OwnedProductDailyMetric> = mode === "commercial"
    ? ["salesAmount", "grossMargin"]
    : mode === "ads"
      ? ["adSpend", "acos"]
      : ["inventoryDays", "keywordRank", "bsrRank"];
  return metrics.some((metric) => fields.some((field) => metric[field] !== null));
}

function valueAndPercentAxes(valueName: string, percentName: string) {
  return [
    {
      type: "value",
      name: valueName,
      axisLine,
      splitLine,
      axisLabel: textStyle,
    },
    {
      type: "value",
      name: percentName,
      axisLine,
      splitLine: { show: false },
      axisLabel: { ...textStyle, formatter: "{value}%" },
    },
  ];
}

function barSeries(name: string, data: Array<number | null>) {
  return {
    name,
    type: "bar",
    data,
    barMaxWidth: 18,
    itemStyle: { borderRadius: [3, 3, 0, 0] },
  };
}

function lineSeries(
  name: string,
  data: Array<number | null>,
  yAxisIndex = 0,
) {
  return {
    name,
    type: "line",
    data,
    yAxisIndex,
    connectNulls: false,
    showSymbol: data.length <= 14,
    symbolSize: 5,
    lineStyle: { width: 2 },
  };
}

function percent(value: number | null): number | null {
  return value === null ? null : Number((value * 100).toFixed(2));
}
