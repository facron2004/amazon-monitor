import type { OwnedProductDailyMetric } from "@amazon-monitor/shared";
import { describe, expect, it } from "vitest";
import {
  buildProductOperationsChartOption,
  hasProductTrendEvidence,
} from "./productOperationsChartOptions";

describe("product operations chart options", () => {
  it("sorts dated evidence and keeps commercial units on separate axes", () => {
    const option = buildProductOperationsChartOption([
      metric("2026-07-26", { salesAmount: 1200, grossMargin: 0.31 }),
      metric("2026-07-25", { salesAmount: 900, grossMargin: 0.28 }),
    ], "commercial") as {
      xAxis: { data: string[] };
      series: Array<{ name: string; data: Array<number | null>; yAxisIndex?: number }>;
    };

    expect(option.xAxis.data).toEqual(["07-25", "07-26"]);
    expect(option.series).toEqual([
      expect.objectContaining({ name: "销售额", data: [900, 1200] }),
      expect.objectContaining({ name: "毛利率", data: [28, 31], yAxisIndex: 1 }),
    ]);
  });

  it("keeps missing values null and detects evidence per trend mode", () => {
    const rows = [
      metric("2026-07-26", { inventoryDays: 18, bsrRank: 42 }),
    ];
    const option = buildProductOperationsChartOption(rows, "visibility") as {
      series: Array<{ name: string; data: Array<number | null> }>;
    };

    expect(option.series.find((series) => series.name === "核心词排名")?.data).toEqual([null]);
    expect(hasProductTrendEvidence(rows, "visibility")).toBe(true);
    expect(hasProductTrendEvidence(rows, "ads")).toBe(false);
  });
});

function metric(
  date: string,
  overrides: Partial<OwnedProductDailyMetric>,
): OwnedProductDailyMetric {
  return {
    id: Number(date.replaceAll("-", "")),
    productId: 1,
    date,
    sessions: null,
    pageViews: null,
    orders: null,
    unitsSold: null,
    salesAmount: null,
    buyBoxPercentage: null,
    conversionRate: null,
    rating: null,
    reviewCount: null,
    bsrRank: null,
    inventoryAvailable: null,
    inventoryDays: null,
    adSpend: null,
    adSales: null,
    acos: null,
    tacos: null,
    grossMargin: null,
    keywordRank: null,
    dataSource: "test",
    lastSyncedAt: `${date}T08:00:00.000Z`,
    syncStatus: "success",
    syncError: null,
    createdAt: `${date}T08:00:00.000Z`,
    ...overrides,
  };
}
