import type { SerpSnapshot } from "@amazon-monitor/shared";

export function buildKeywordChartOption(snapshots: SerpSnapshot[]) {
  const items = snapshots.slice(0, 12);

  return {
    aria: {
      show: true,
      description: "关键词监控图，用于对比当前价格与绝对排名。"
    },
    color: ["#2563eb", "#f97316"],
    animationDuration: 450,
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "shadow",
        shadowStyle: {
          color: "rgba(148, 163, 184, 0.12)"
        }
      },
      backgroundColor: "rgba(255, 255, 255, 0.96)",
      borderColor: "#dbe4f0",
      borderWidth: 1,
      textStyle: { color: "#0f172a" },
      extraCssText: "box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12); border-radius: 14px;"
    },
    legend: {
      top: 0,
      right: 0,
      icon: "roundRect",
      itemWidth: 14,
      itemHeight: 10,
      textStyle: {
        color: "#475569",
        fontFamily: "Noto Sans SC",
        fontWeight: 600
      }
    },
    grid: { top: 54, left: 48, right: 36, bottom: 56 },
    xAxis: {
      type: "category",
      data: items.map((item) => item.asin),
      axisLabel: {
        rotate: 18,
        color: "#475569",
        fontFamily: "Noto Sans SC",
        margin: 14
      },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } }
    },
    yAxis: [
      {
        type: "value",
        name: "价格",
        nameTextStyle: {
          color: "#64748b",
          fontWeight: 600,
          padding: [0, 0, 6, 0]
        },
        axisLabel: {
          formatter: "${value}",
          color: "#475569",
          fontFamily: "Noto Sans SC"
        },
        splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } }
      },
      {
        type: "value",
        name: "排名",
        inverse: true,
        nameTextStyle: {
          color: "#64748b",
          fontWeight: 600,
          padding: [0, 0, 6, 0]
        },
        axisLabel: {
          color: "#475569",
          fontFamily: "Noto Sans SC"
        },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: "当前价格",
        type: "bar",
        data: items.map((item) => item.currentPrice ?? 0),
        barWidth: 16,
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#38bdf8" },
              { offset: 1, color: "#2563eb" }
            ]
          },
          borderRadius: [4, 4, 0, 0]
        }
      },
      {
        name: "绝对排名",
        type: "line",
        yAxisIndex: 1,
        data: items.map((item) => item.absoluteRank),
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { width: 3, color: "#f97316" },
        itemStyle: { color: "#f97316", borderColor: "#ffffff", borderWidth: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(249, 115, 22, 0.18)" },
              { offset: 1, color: "rgba(249, 115, 22, 0.02)" }
            ]
          }
        }
      }
    ]
  };
}
