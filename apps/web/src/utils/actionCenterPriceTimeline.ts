import type { ProductPriceHistory } from "@amazon-monitor/shared";

export interface ProductPriceTimelinePoint {
  date: string;
  currentPrice: number | null;
  effectivePrice: number | null;
  reviewCount: number | null;
  reviewCountChange: number | null;
  promoLabel: string | null;
}

export interface ProductPriceTimelineSummary {
  latestDate: string;
  latestCurrentPrice: number | null;
  latestEffectivePrice: number | null;
  latestReviewCount: number | null;
  reviewDelta: number | null;
  effectivePriceDelta: number | null;
  lowestEffectivePrice: number | null;
  promoDayCount: number;
  pointCount: number;
  tone: "success" | "warning" | "info";
  label: string;
}

export function getProductPriceTimelinePoints(rows: ProductPriceHistory[]): ProductPriceTimelinePoint[] {
  return [...rows]
    .filter((row) => row.snapshotDate.length > 0)
    .sort((left, right) => left.snapshotDate.localeCompare(right.snapshotDate))
    .map((row) => ({
      date: row.snapshotDate,
      currentPrice: finiteOrNull(row.currentPrice),
      effectivePrice: finiteOrNull(row.finalEstimatedPrice ?? row.currentPrice),
      reviewCount: finiteOrNull(row.reviewCount ?? null),
      reviewCountChange: finiteOrNull(row.reviewCountChange ?? null),
      promoLabel: promoLabel(row)
    }));
}

export function getProductPriceTimelineSummary(rows: ProductPriceHistory[]): ProductPriceTimelineSummary | null {
  const points = getProductPriceTimelinePoints(rows);
  const latest = points.at(-1);
  if (!latest) return null;
  const previous = points.slice(0, -1).reverse().find((point) => point.effectivePrice !== null) ?? null;
  const priceDelta = latest.effectivePrice !== null && previous !== null && previous.effectivePrice !== null
    ? roundCurrency(latest.effectivePrice - previous.effectivePrice)
    : null;
  return {
    latestDate: latest.date,
    latestCurrentPrice: latest.currentPrice,
    latestEffectivePrice: latest.effectivePrice,
    latestReviewCount: latest.reviewCount,
    reviewDelta: latest.reviewCountChange,
    effectivePriceDelta: priceDelta,
    lowestEffectivePrice: lowest(points.map((point) => point.effectivePrice)),
    promoDayCount: points.filter((point) => point.promoLabel !== null).length,
    pointCount: points.length,
    tone: priceTone(priceDelta),
    label: priceLabel(priceDelta)
  };
}

export function buildProductPriceTimelineChartOption(rows: ProductPriceHistory[]): unknown {
  const points = getProductPriceTimelinePoints(rows).slice(-30);
  const dateLabels = points.map((point) => point.date.slice(5));
  const promoMarkers = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.promoLabel !== null && point.effectivePrice !== null)
    .map(({ point, index }) => ({
      name: point.promoLabel,
      coord: [dateLabels[index], point.effectivePrice],
      value: point.promoLabel,
      symbolSize: 44,
      itemStyle: { color: "#f59e0b" },
      label: {
        color: "#78350f",
        formatter: "Promo",
        fontSize: 10
      }
    }));

  return {
    color: ["#2563eb", "#14b8a6", "#f59e0b"],
    tooltip: {
      trigger: "axis"
    },
    legend: {
      bottom: 0,
      data: ["Effective price", "List price", "Review count"]
    },
    grid: {
      top: 20,
      right: 52,
      bottom: 44,
      left: 46
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: dateLabels
    },
    yAxis: [
      {
        type: "value",
        name: "Price",
        min: 0
      },
      {
        type: "value",
        name: "Reviews",
        min: 0
      }
    ],
    series: [
      {
        name: "Effective price",
        type: "line",
        data: points.map((point) => point.effectivePrice),
        connectNulls: true,
        smooth: true,
        symbolSize: 6,
        lineStyle: { width: 3 },
        markPoint: { data: promoMarkers }
      },
      {
        name: "List price",
        type: "line",
        data: points.map((point) => point.currentPrice),
        connectNulls: true,
        smooth: true,
        symbolSize: 5,
        lineStyle: { width: 2, type: "dashed" }
      },
      {
        name: "Review count",
        type: "bar",
        yAxisIndex: 1,
        data: points.map((point) => point.reviewCount),
        barMaxWidth: 18,
        itemStyle: { opacity: 0.32 }
      }
    ],
    aria: {
      enabled: true
    }
  };
}

function promoLabel(row: ProductPriceHistory): string | null {
  const coupon = row.couponText?.trim();
  const deal = row.dealBadge?.trim();
  if (coupon && deal) return `${coupon} / ${deal}`;
  return coupon || deal || null;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function lowest(values: Array<number | null>): number | null {
  const finiteValues = values.filter((value): value is number => value !== null);
  return finiteValues.length > 0 ? Math.min(...finiteValues) : null;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function priceTone(delta: number | null): ProductPriceTimelineSummary["tone"] {
  if (delta === null || delta === 0) return "info";
  return delta < 0 ? "success" : "warning";
}

function priceLabel(delta: number | null): string {
  if (delta === null) return "No prior price";
  if (delta < 0) return `Down $${Math.abs(delta).toFixed(2)}`;
  if (delta > 0) return `Up $${delta.toFixed(2)}`;
  return "Flat";
}
