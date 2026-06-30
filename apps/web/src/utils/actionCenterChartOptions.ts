import {
  inferInsightEventStrategyTags,
  strategyTagLabels,
  type InsightEvent,
  type InsightEventLevel,
  type InsightEventStatus
} from "@amazon-monitor/shared";
import { buildReviewCadenceSummary } from "./actionCenterReviewCadence";

type ChartDatum = { name: string; value: number };
type EchartsSeriesData = Array<number | ChartDatum>;

export interface BrandActionPressureRow {
  brand: string;
  value: number;
  eventCount: number;
  p0Count: number;
  topEventId: string;
  topEventTitle: string;
  canFocus: boolean;
}

interface ActionCenterSeries {
  name: string;
  type: "bar" | "pie";
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
const actionableStatuses = new Set<InsightEventStatus>(["TODO", "WATCHING", "REVIEW_PENDING"]);

export function getWorkflowFunnelData(events: InsightEvent[]): ChartDatum[] {
  return [
    { name: "Todo", value: events.filter((event) => event.status === "TODO").length },
    {
      name: "In progress",
      value: events.filter((event) => event.status === "WATCHING" || event.status === "REVIEW_PENDING").length
    },
    {
      name: "Closed",
      value: events.filter((event) => event.status === "FOLLOWED" || event.status === "REVIEWED" || event.status === "IGNORED").length
    }
  ];
}

export function getPriorityMixData(events: InsightEvent[]): ChartDatum[] {
  const levels: InsightEventLevel[] = ["P0", "P1", "P2"];
  return levels.map((level) => ({
    name: level,
    value: events.filter((event) => event.eventLevel === level).length
  }));
}

export function getStrategyFocusData(events: InsightEvent[]): ChartDatum[] {
  const counts = new Map<string, number>();

  for (const event of events) {
    for (const tag of inferInsightEventStrategyTags(event)) {
      counts.set(strategyTagLabels[tag], (counts.get(strategyTagLabels[tag]) ?? 0) + 1);
    }
  }

  const rows = Array.from(counts, ([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name))
    .slice(0, 6);

  return rows.length > 0 ? rows : [{ name: "No strategy tags", value: 0 }];
}

export function getBrandActionPressureRows(events: InsightEvent[], limit = 6): BrandActionPressureRow[] {
  type MutableBrandRow = BrandActionPressureRow & { topScore: number };
  const rows = new Map<string, MutableBrandRow>();

  for (const event of events) {
    if (!actionableStatuses.has(event.status)) continue;

    const explicitBrand = event.brand?.trim() ?? "";
    const brand = explicitBrand || "Unknown brand";
    const current = rows.get(brand);
    if (!current) {
      rows.set(brand, {
        brand,
        value: event.scoreTotal,
        eventCount: 1,
        p0Count: event.eventLevel === "P0" ? 1 : 0,
        topEventId: event.id,
        topEventTitle: event.eventTitle,
        topScore: event.scoreTotal,
        canFocus: explicitBrand.length > 0
      });
      continue;
    }

    current.value += event.scoreTotal;
    current.eventCount += 1;
    if (event.eventLevel === "P0") {
      current.p0Count += 1;
    }
    if (event.scoreTotal > current.topScore) {
      current.topEventId = event.id;
      current.topEventTitle = event.eventTitle;
      current.topScore = event.scoreTotal;
    }
  }

  return Array.from(rows.values())
    .sort((left, right) => (
      right.value - left.value
      || right.p0Count - left.p0Count
      || right.eventCount - left.eventCount
      || left.brand.localeCompare(right.brand)
    ))
    .slice(0, limit)
    .map((row) => ({
      brand: row.brand,
      value: row.value,
      eventCount: row.eventCount,
      p0Count: row.p0Count,
      topEventId: row.topEventId,
      topEventTitle: row.topEventTitle,
      canFocus: row.canFocus
    }));
}

export function getReviewCadenceChartData(
  visibleEvents: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  currentDate: string
): ChartDatum[] {
  return buildReviewCadenceSummary(visibleEvents, reviewDueEvents, currentDate).buckets.map((bucket) => ({
    name: bucket.label,
    value: bucket.count
  }));
}

export function buildWorkflowFunnelChartOption(events: InsightEvent[]) {
  const data = getWorkflowFunnelData(events);

  return {
    aria: {
      show: true,
      description: `Action Center workflow chart for ${events.length} visible events.`
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
      axisLabel: chartTextStyle
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: chartTextStyle
    },
    series: [
      {
        name: "Events",
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
              { offset: 1, color: "#2563eb" }
            ]
          }
        }
      }
    ] satisfies ActionCenterSeries[]
  };
}

export function buildBrandActionPressureChartOption(events: InsightEvent[]) {
  const data = getBrandActionPressureRows(events).reverse();

  return {
    aria: {
      show: true,
      description: "Action Center brand pressure chart for unresolved visible events."
    },
    animationDuration: 420,
    color: ["#0f766e"],
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { top: 18, right: 18, bottom: 18, left: 112 },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: chartTextStyle
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.brand),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: {
        ...chartTextStyle,
        overflow: "truncate",
        width: 96
      }
    },
    series: [
      {
        name: "Open score",
        type: "bar",
        data: data.map((item) => ({
          name: item.brand,
          value: item.value
        })),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 7, 7, 0] }
      }
    ] satisfies ActionCenterSeries[]
  };
}

export function buildPriorityMixChartOption(events: InsightEvent[]) {
  const data = getPriorityMixData(events);

  return {
    aria: {
      show: true,
      description: `Action Center priority mix chart for ${events.length} visible events.`
    },
    animationDuration: 420,
    color: ["#ef4444", "#f97316", "#64748b"],
    tooltip: { ...tooltip, trigger: "item" },
    legend: {
      bottom: 0,
      icon: "roundRect",
      textStyle: chartTextStyle
    },
    title: {
      text: String(events.length),
      subtext: "visible events",
      left: "center",
      top: "35%",
      textStyle: { color: "#0f172a", fontSize: 24, fontWeight: 800 },
      subtextStyle: { color: "#64748b", fontSize: 12 }
    },
    series: [
      {
        name: "Priority",
        type: "pie",
        radius: ["54%", "74%"],
        center: ["50%", "43%"],
        avoidLabelOverlap: true,
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: 700 } },
        data
      }
    ] satisfies ActionCenterSeries[]
  };
}

export function buildStrategyFocusChartOption(events: InsightEvent[]) {
  const data = getStrategyFocusData(events).reverse();

  return {
    aria: {
      show: true,
      description: "Action Center strategy focus chart for visible events."
    },
    animationDuration: 420,
    color: ["#14b8a6"],
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { top: 18, right: 16, bottom: 18, left: 116 },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: chartTextStyle
    },
    yAxis: {
      type: "category",
      data: data.map((item) => item.name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: {
        ...chartTextStyle,
        overflow: "truncate",
        width: 100
      }
    },
    series: [
      {
        name: "Events",
        type: "bar",
        data: data.map((item) => ({
          name: item.name,
          value: item.value
        })),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 7, 7, 0] }
      }
    ] satisfies ActionCenterSeries[]
  };
}

export function buildReviewCadenceChartOption(
  visibleEvents: InsightEvent[],
  reviewDueEvents: InsightEvent[],
  currentDate: string
) {
  const data = getReviewCadenceChartData(visibleEvents, reviewDueEvents, currentDate);

  return {
    aria: {
      show: true,
      description: "Action Center review cadence chart for scheduled follow-up events."
    },
    animationDuration: 420,
    color: ["#ef4444", "#f59e0b", "#22c55e"],
    tooltip: { ...tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { top: 24, right: 16, bottom: 30, left: 40 },
    xAxis: {
      type: "category",
      data: data.map((item) => item.name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: chartTextStyle
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" } },
      axisLabel: chartTextStyle
    },
    series: [
      {
        name: "Review queue",
        type: "bar",
        data: data.map((item) => ({
          name: item.name,
          value: item.value
        })),
        barWidth: 28,
        itemStyle: { borderRadius: [7, 7, 0, 0] }
      }
    ] satisfies ActionCenterSeries[]
  };
}
