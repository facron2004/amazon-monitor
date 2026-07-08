import { describe, expect, it } from "vitest";
import type { PeriodInsightReportResponse } from "../api-types";
import { buildBrandPressureChartOption, buildReviewLoopChartOption, buildSignalMixChartOption } from "./reportChartOptions";

interface ChartOption {
  title?: { subtext?: string };
  yAxis?: { data?: string[] };
  series: Array<{ data: unknown[] }>;
}

const report: PeriodInsightReportResponse = {
  period: "monthly",
  startDate: "2026-06-01",
  endDate: "2026-06-30",
  days: 30,
  summary: {
    totalEvents: 100,
    sLevelCount: 8,
    aLevelCount: 21,
    coreRiskCount: 13,
    newBreakoutCount: 5,
    reviewDueCount: 7,
    overdueReviewDueCount: 2,
    reviewedCount: 18,
    confirmedCount: 11,
    revertedCount: 3
  },
  topEvents: [],
  topBrands: [
    {
      brand: "Acme",
      eventCount: 12,
      topScore: 96,
      coreRiskCount: 4,
      strategyTags: ["HIGH_THREAT_CORE"],
      representativeEventTitle: "Acme event",
      suggestedAction: "Watch"
    },
    {
      brand: "Beta",
      eventCount: 7,
      topScore: 88,
      coreRiskCount: 1,
      strategyTags: ["LOW_PRICE_RANKING"],
      representativeEventTitle: "Beta event",
      suggestedAction: "Review"
    }
  ],
  reviewDueEvents: [],
  reviewedEvents: [],
  reviewOutcomes: [],
  markdown: "# Monthly Insight Report"
};

describe("report chart options", () => {
  it("maps summary counts into the signal mix bar chart", () => {
    const option = buildSignalMixChartOption(report) as ChartOption;

    expect(option.series[0]?.data).toEqual([8, 21, 13, 5]);
  });

  it("keeps overdue review count as context instead of double-counting donut slices", () => {
    const option = buildReviewLoopChartOption(report) as ChartOption;

    expect(option.title?.subtext).toBe("待复盘 / 2 逾期");
    expect(option.series[0]?.data).toEqual([
      { name: "待复盘队列", value: 7 },
      { name: "已复盘", value: 18 }
    ]);
  });

  it("renders top brands from low to high so the strongest brand anchors the bottom", () => {
    const option = buildBrandPressureChartOption(report) as ChartOption;

    expect(option.yAxis?.data).toEqual(["Beta", "Acme"]);
    expect(option.series[0]?.data).toEqual([7, 12]);
    expect(option.series[1]?.data).toEqual([1, 4]);
  });
});
