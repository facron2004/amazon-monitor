import type {
  NotificationErrorType,
  NotificationTrendPoint
} from "../composables/useNotificationStats.js";

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

const axisLine = { lineStyle: { color: "#cbd5e1" } };
const splitLine = { lineStyle: { color: "#e2e8f0", type: "dashed" as const } };

export function buildNotificationTrendOption(trend: NotificationTrendPoint[]) {
  return {
    aria: { show: true, description: "近 7 天邮件发送趋势，含成功与失败两条曲线。" },
    animationDuration: 420,
    color: ["#10b981", "#ef4444"],
    tooltip: { ...tooltip, trigger: "axis" as const, axisPointer: { type: "shadow" } },
    legend: {
      data: ["成功", "失败"],
      top: 4,
      right: 8,
      icon: "roundRect",
      itemWidth: 12,
      itemHeight: 8,
      textStyle: chartTextStyle
    },
    grid: { top: 36, right: 16, bottom: 30, left: 38 },
    xAxis: {
      type: "category" as const,
      data: trend.map((p) => p.date),
      axisTick: { show: false },
      axisLine,
      axisLabel: chartTextStyle
    },
    yAxis: {
      type: "value" as const,
      minInterval: 1,
      splitLine,
      axisLabel: chartTextStyle
    },
    series: [
      {
        name: "成功",
        type: "line" as const,
        data: trend.map((p) => p.success),
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { width: 2.4 },
        areaStyle: {
          color: {
            type: "linear" as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(16,185,129,0.22)" },
              { offset: 1, color: "rgba(16,185,129,0.02)" }
            ]
          }
        }
      },
      {
        name: "失败",
        type: "line" as const,
        data: trend.map((p) => p.failed),
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { width: 2.4, type: "dashed" as const }
      }
    ]
  };
}

export function buildNotificationChannelOption(channelMix: { email: number; feishu: number }) {
  const total = channelMix.email + channelMix.feishu;
  return {
    aria: { show: true, description: `通道占比：邮箱 ${channelMix.email}，飞书 ${channelMix.feishu}。` },
    animationDuration: 420,
    color: ["#3b82f6", "#14b8a6"],
    tooltip: {
      ...tooltip,
      trigger: "item" as const,
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${p.name} · ${p.value} 封 (${p.percent}%)`
    },
    legend: {
      bottom: 0,
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      textStyle: chartTextStyle
    },
    series: [
      {
        type: "pie" as const,
        radius: ["48%", "72%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          position: "center" as const,
          formatter: () => `{a|${total}}\n{b|累计}`,
          rich: {
            a: { fontSize: 22, fontWeight: 700, color: "#0f172a", lineHeight: 26 },
            b: { fontSize: 11, color: "#94a3b8" }
          }
        },
        labelLine: { show: false },
        data: [
          { name: "邮箱", value: channelMix.email },
          { name: "飞书", value: channelMix.feishu }
        ]
      }
    ]
  };
}

export function buildNotificationErrorTypeOption(errorTypes: NotificationErrorType[]) {
  const hasData = errorTypes.length > 0;
  const palette = ["#ef4444", "#f59e0b", "#f97316", "#8b5cf6", "#06b6d4", "#64748b"];
  return {
    aria: { show: true, description: "失败邮件按错误类型分布。" },
    animationDuration: 420,
    color: palette,
    tooltip: { ...tooltip, trigger: "axis" as const, axisPointer: { type: "shadow" } },
    grid: { top: 12, right: 16, bottom: 8, left: 80, containLabel: false },
    xAxis: {
      type: "value" as const,
      minInterval: 1,
      splitLine,
      axisLabel: chartTextStyle
    },
    yAxis: {
      type: "category" as const,
      data: hasData ? errorTypes.map((e) => e.type) : ["暂无失败"],
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: chartTextStyle
    },
    series: [
      {
        type: "bar" as const,
        data: hasData
          ? errorTypes.map((e) => e.count)
          : [{ value: 0, itemStyle: { color: "#e2e8f0" } }],
        barWidth: 14,
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: hasData
            ? {
                type: "linear" as const,
                x: 0, y: 0, x2: 1, y2: 0,
                colorStops: [
                  { offset: 0, color: "#fb7185" },
                  { offset: 1, color: "#ef4444" }
                ]
              }
            : "#e2e8f0"
        },
        label: {
          show: true,
          position: "right" as const,
          color: "#475569",
          fontSize: 11,
          formatter: (p: { value: number }) => (p.value > 0 ? `${p.value}` : "")
        }
      }
    ]
  };
}

export function buildNotificationScheduleStatusOption(scheduleStatus: {
  enabled: number;
  disabled: number;
}) {
  return {
    aria: { show: true, description: `排期状态：启用 ${scheduleStatus.enabled}，停用 ${scheduleStatus.disabled}。` },
    animationDuration: 420,
    color: ["#10b981", "#cbd5e1"],
    tooltip: {
      ...tooltip,
      trigger: "item" as const,
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${p.name} · ${p.value} 个 (${p.percent}%)`
    },
    legend: {
      bottom: 0,
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      textStyle: chartTextStyle
    },
    series: [
      {
        type: "pie" as const,
        radius: ["48%", "72%"],
        center: ["50%", "44%"],
        itemStyle: { borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          position: "center" as const,
          formatter: () => `{a|${scheduleStatus.enabled}}\n{b|启用中}`,
          rich: {
            a: { fontSize: 22, fontWeight: 700, color: "#0f172a", lineHeight: 26 },
            b: { fontSize: 11, color: "#94a3b8" }
          }
        },
        labelLine: { show: false },
        data: [
          { name: "启用", value: scheduleStatus.enabled },
          { name: "停用", value: scheduleStatus.disabled }
        ]
      }
    ]
  };
}
