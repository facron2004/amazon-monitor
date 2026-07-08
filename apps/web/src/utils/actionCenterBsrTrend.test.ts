import { describe, expect, it } from "vitest";
import type { BsrRankHistory } from "@amazon-monitor/shared";
import {
  buildBsrTrendChartOption,
  getBsrTrendPoints,
  getBsrTrendSummary
} from "./actionCenterBsrTrend";

interface BsrTrendChartOption {
  xAxis: { data: string[] };
  yAxis: Array<{ inverse?: boolean }>;
  series: Array<{ data: Array<number | null> }>;
}

describe("action center BSR trend", () => {
  it("sorts history ascending and summarizes rank gains", () => {
    const rows = [
      bsrRow("2026-06-19", 20, 189),
      bsrRow("2026-06-17", 52, 199),
      bsrRow("2026-06-18", 45, 189)
    ];

    expect(getBsrTrendPoints(rows).map((point) => `${point.date}:${point.rank}`)).toEqual([
      "2026-06-17:52",
      "2026-06-18:45",
      "2026-06-19:20"
    ]);
    expect(getBsrTrendSummary(rows)).toMatchObject({
      currentRank: 20,
      previousRank: 45,
      rankDelta: 25,
      bestRank: 20,
      worstRank: 52,
      pointCount: 3,
      tone: "success",
      label: "Up 25"
    });
  });

  it("builds an inverse BSR line with price as the secondary series", () => {
    const option = buildBsrTrendChartOption([
      bsrRow("2026-06-18", 45, 189),
      bsrRow("2026-06-19", 20, null)
    ]) as BsrTrendChartOption;

    expect(option.xAxis.data).toEqual(["06-18", "06-19"]);
    expect(option.yAxis[0]?.inverse).toBe(true);
    expect(option.series[0]?.data).toEqual([45, 20]);
    expect(option.series[1]?.data).toEqual([189, null]);
  });
});

function bsrRow(snapshotDate: string, rank: number, currentPrice: number | null): BsrRankHistory {
  return {
    snapshotDate,
    sourceType: "category_bestseller",
    sourceId: 1,
    sourceName: "Ice Makers",
    marketplace: "amazon.com",
    asin: "B0SURGE001",
    title: "Surging Ice Maker",
    brand: "LiftBrand",
    category: "Ice Makers",
    rank,
    rankUrl: "https://www.amazon.com/Best-Sellers-Ice-Makers/zgbs",
    productUrl: "https://www.amazon.com/dp/B0SURGE001",
    currentPrice,
    parentRank: null,
    isSpecificRank: true
  };
}
