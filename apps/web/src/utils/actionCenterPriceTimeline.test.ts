import { describe, expect, it } from "vitest";
import type { ProductPriceHistory } from "@amazon-monitor/shared";
import {
  buildProductPriceTimelineChartOption,
  getProductPriceTimelinePoints,
  getProductPriceTimelineSummary
} from "./actionCenterPriceTimeline";

interface PriceTimelineChartOption {
  xAxis: { data: string[] };
  yAxis: Array<{ name: string }>;
  series: Array<{
    name: string;
    data: Array<number | null>;
    markPoint?: { data: Array<{ value: string | null; coord: Array<string | number | null> }> };
  }>;
}

describe("action center price timeline", () => {
  it("sorts rows, uses effective price, and summarizes latest movement", () => {
    const rows = [
      priceRow("2026-06-20", 199, 179, 120, 8, "Save $20", null),
      priceRow("2026-06-18", 209, null, 100, null, null, null),
      priceRow("2026-06-19", 209, 189, 112, 12, null, "Limited Time Deal")
    ];

    expect(getProductPriceTimelinePoints(rows)).toEqual([
      {
        date: "2026-06-18",
        currentPrice: 209,
        effectivePrice: 209,
        reviewCount: 100,
        reviewCountChange: null,
        promoLabel: null
      },
      {
        date: "2026-06-19",
        currentPrice: 209,
        effectivePrice: 189,
        reviewCount: 112,
        reviewCountChange: 12,
        promoLabel: "Limited Time Deal"
      },
      {
        date: "2026-06-20",
        currentPrice: 199,
        effectivePrice: 179,
        reviewCount: 120,
        reviewCountChange: 8,
        promoLabel: "Save $20"
      }
    ]);
    expect(getProductPriceTimelineSummary(rows)).toMatchObject({
      latestDate: "2026-06-20",
      latestCurrentPrice: 199,
      latestEffectivePrice: 179,
      latestReviewCount: 120,
      reviewDelta: 8,
      effectivePriceDelta: -10,
      lowestEffectivePrice: 179,
      promoDayCount: 2,
      pointCount: 3,
      tone: "success",
      label: "Down $10.00"
    });
  });

  it("builds a price plus review chart with promo markers", () => {
    const option = buildProductPriceTimelineChartOption([
      priceRow("2026-06-18", 209, null, 100, null, null, null),
      priceRow("2026-06-19", 209, 189, 112, 12, null, "Limited Time Deal")
    ]) as PriceTimelineChartOption;

    expect(option.xAxis.data).toEqual(["06-18", "06-19"]);
    expect(option.yAxis.map((axis) => axis.name)).toEqual(["Price", "Reviews"]);
    expect(option.series[0]?.name).toBe("Effective price");
    expect(option.series[0]?.data).toEqual([209, 189]);
    expect(option.series[1]?.data).toEqual([209, 209]);
    expect(option.series[2]?.data).toEqual([100, 112]);
    expect(option.series[0]?.markPoint?.data).toMatchObject([
      { value: "Limited Time Deal", coord: ["06-19", 189] }
    ]);
  });
});

function priceRow(
  snapshotDate: string,
  currentPrice: number | null,
  finalEstimatedPrice: number | null,
  reviewCount: number | null,
  reviewCountChange: number | null,
  couponText: string | null,
  dealBadge: string | null
): ProductPriceHistory {
  return {
    snapshotDate,
    categoryId: 1,
    categoryName: "Ice Makers",
    marketplace: "amazon.com",
    asin: "B0PRICE001",
    brand: "Acme",
    title: "Acme Ice Maker",
    currentPrice,
    reviewCount,
    previousReviewCount: null,
    reviewCountChange,
    iceType: null,
    couponText,
    couponValue: null,
    couponRate: null,
    dealBadge,
    finalEstimatedPrice,
    t30LowPrice: null,
    t60LowPrice: null,
    t90LowPrice: null,
    monitoringLowPrice: null
  };
}
