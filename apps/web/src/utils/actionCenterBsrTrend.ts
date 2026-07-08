import type { BsrRankHistory } from "@amazon-monitor/shared";

export interface BsrTrendPoint {
  date: string;
  rank: number;
  price: number | null;
}

export interface BsrTrendSummary {
  currentRank: number;
  previousRank: number | null;
  rankDelta: number | null;
  bestRank: number;
  worstRank: number;
  pointCount: number;
  tone: "success" | "warning" | "info";
  label: string;
}

export function getBsrTrendPoints(rows: BsrRankHistory[]): BsrTrendPoint[] {
  return [...rows]
    .filter((row) => Number.isFinite(row.rank) && row.rank > 0)
    .sort((left, right) => left.snapshotDate.localeCompare(right.snapshotDate))
    .map((row) => ({
      date: row.snapshotDate,
      rank: row.rank,
      price: row.currentPrice
    }));
}

export function getBsrTrendSummary(rows: BsrRankHistory[]): BsrTrendSummary | null {
  const points = getBsrTrendPoints(rows);
  const latest = points.at(-1);
  if (!latest) {
    return null;
  }
  const previous = points.at(-2) ?? null;
  const rankDelta = previous ? previous.rank - latest.rank : null;
  return {
    currentRank: latest.rank,
    previousRank: previous?.rank ?? null,
    rankDelta,
    bestRank: Math.min(...points.map((point) => point.rank)),
    worstRank: Math.max(...points.map((point) => point.rank)),
    pointCount: points.length,
    tone: trendTone(rankDelta),
    label: trendLabel(rankDelta)
  };
}

export function buildBsrTrendChartOption(rows: BsrRankHistory[]): unknown {
  const points = getBsrTrendPoints(rows).slice(-30);
  return {
    color: ["#2563eb", "#f97316"],
    tooltip: {
      trigger: "axis"
    },
    legend: {
      bottom: 0,
      data: ["BSR rank", "Price"]
    },
    grid: {
      top: 18,
      right: 46,
      bottom: 42,
      left: 42
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: points.map((point) => point.date.slice(5))
    },
    yAxis: [
      {
        type: "value",
        name: "BSR",
        inverse: true,
        minInterval: 1
      },
      {
        type: "value",
        name: "Price",
        min: 0
      }
    ],
    series: [
      {
        name: "BSR rank",
        type: "line",
        data: points.map((point) => point.rank),
        smooth: true,
        symbolSize: 6,
        lineStyle: { width: 3 },
        areaStyle: { opacity: 0.1 }
      },
      {
        name: "Price",
        type: "line",
        yAxisIndex: 1,
        data: points.map((point) => point.price),
        connectNulls: true,
        smooth: true,
        symbolSize: 5,
        lineStyle: { width: 2, type: "dashed" }
      }
    ],
    aria: {
      enabled: true
    }
  };
}

function trendTone(rankDelta: number | null): BsrTrendSummary["tone"] {
  if (rankDelta === null || rankDelta === 0) return "info";
  return rankDelta > 0 ? "success" : "warning";
}

function trendLabel(rankDelta: number | null): string {
  if (rankDelta === null) return "No prior rank";
  if (rankDelta > 0) return `Up ${rankDelta}`;
  if (rankDelta < 0) return `Down ${Math.abs(rankDelta)}`;
  return "Flat";
}
