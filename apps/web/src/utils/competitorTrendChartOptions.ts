import type { ProductActivityCalendar, ProductActivityCalendarDay } from "@amazon-monitor/shared";
import { bestDayPrice } from "./formatters-product";

function firstValue(values: Array<number | null | undefined>): number | null {
  return values.find((value): value is number => value !== null && value !== undefined) ?? null;
}

function reviewCount(day: ProductActivityCalendarDay): number | null {
  return firstValue([
    day.priceHistory?.reviewCount,
    day.categoryRanks[0]?.reviewCount,
    ...day.events.map((event) => event.reviewCountAfter)
  ]);
}

export function hasCompetitorTrendData(calendar: ProductActivityCalendar): boolean {
  return calendar.days.some((day) =>
    bestDayPrice(day) !== null ||
    day.categoryRanks.length > 0 ||
    day.bsrRanks.length > 0 ||
    reviewCount(day) !== null
  );
}

export function buildCompetitorTrendChartOption(calendar: ProductActivityCalendar) {
  const days = [...calendar.days].sort((left, right) => left.date.localeCompare(right.date));
  const dates = days.map((day) => day.date);
  const axisLabel = {
    color: "#64748b",
    fontFamily: "Inter, Noto Sans SC, sans-serif",
    fontSize: 11
  };
  const splitLine = { lineStyle: { color: "#e8edf3", type: "dashed" } };

  return {
    aria: {
      show: true,
      description: `${calendar.asin} 近 ${days.length} 天价格、Review、类目排名与 BSR 趋势`
    },
    animationDuration: 360,
    color: ["#0071e3", "#14b8a6", "#f59e0b", "#e11d48"],
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(255, 255, 255, 0.98)",
      borderColor: "#dbe3ec",
      borderWidth: 1,
      textStyle: { color: "#1d1d1f" },
      extraCssText: "box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12); border-radius: 8px;"
    },
    legend: [
      {
        top: 0,
        left: 8,
        data: ["价格", "Review"],
        icon: "roundRect",
        itemWidth: 12,
        itemHeight: 8,
        textStyle: axisLabel
      },
      {
        top: "51%",
        left: 8,
        data: ["类目排名", "BSR"],
        icon: "roundRect",
        itemWidth: 12,
        itemHeight: 8,
        textStyle: axisLabel
      }
    ],
    grid: [
      { top: 38, left: 54, right: 58, height: "32%" },
      { top: "59%", left: 54, right: 58, bottom: 32 }
    ],
    xAxis: [
      {
        type: "category",
        gridIndex: 0,
        data: dates,
        boundaryGap: false,
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#d7dee8" } }
      },
      {
        type: "category",
        gridIndex: 1,
        data: dates,
        boundaryGap: false,
        axisLabel: { ...axisLabel, formatter: (value: string) => value.slice(5) },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#d7dee8" } }
      }
    ],
    yAxis: [
      {
        type: "value",
        gridIndex: 0,
        name: "价格",
        nameTextStyle: axisLabel,
        axisLabel: { ...axisLabel, formatter: "${value}" },
        splitLine
      },
      {
        type: "value",
        gridIndex: 0,
        name: "Review",
        nameTextStyle: axisLabel,
        axisLabel,
        splitLine: { show: false }
      },
      {
        type: "value",
        gridIndex: 1,
        inverse: true,
        min: 1,
        name: "排名",
        nameTextStyle: axisLabel,
        axisLabel,
        splitLine
      }
    ],
    series: [
      {
        name: "价格",
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: days.map(bestDayPrice),
        connectNulls: true,
        smooth: 0.2,
        symbolSize: 6,
        lineStyle: { width: 2.5 }
      },
      {
        name: "Review",
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 1,
        data: days.map(reviewCount),
        connectNulls: true,
        smooth: 0.2,
        symbolSize: 5,
        lineStyle: { width: 2 }
      },
      {
        name: "类目排名",
        type: "line",
        xAxisIndex: 1,
        yAxisIndex: 2,
        data: days.map((day) => day.categoryRanks[0]?.rank ?? null),
        connectNulls: true,
        symbolSize: 6,
        lineStyle: { width: 2.5 }
      },
      {
        name: "BSR",
        type: "line",
        xAxisIndex: 1,
        yAxisIndex: 2,
        data: days.map((day) => day.bsrRanks[0]?.rank ?? null),
        connectNulls: true,
        symbolSize: 5,
        lineStyle: { width: 2 }
      }
    ]
  };
}
