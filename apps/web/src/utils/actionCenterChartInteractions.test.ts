import { describe, expect, it } from "vitest";
import { attributionTagLabels, insightEventTypeLabels, insightReviewResultLabels, strategyTagLabels } from "@amazon-monitor/shared";
import {
  attributionChartNameToTag,
  chartBucketNameFromOffset,
  chartBucketNameFromVerticalOffset,
  eventTypeChartNameToType,
  evidenceMovementChartNameToFilter,
  pieChartNameFromOffset,
  priorityChartNameToLevel,
  reviewCadenceChartNameToFilter,
  reviewOutcomeChartNameToResult,
  scoreDriverChartNameToFilter,
  stackedScoreChartNameFromOffset,
  strategyChartNameToTag,
  workflowChartNameToColumn
} from "./actionCenterChartInteractions";

describe("action center chart interactions", () => {
  it("maps workflow chart buckets to Action Center columns", () => {
    expect(workflowChartNameToColumn("待处理")).toBe("todo");
    expect(workflowChartNameToColumn("处理中")).toBe("mid");
    expect(workflowChartNameToColumn("已关闭")).toBe("closed");
    expect(workflowChartNameToColumn("Todo")).toBe("todo");
    expect(workflowChartNameToColumn("Other")).toBeNull();
    expect(workflowChartNameToColumn(undefined)).toBeNull();
  });

  it("maps review cadence chart labels to cadence filters", () => {
    expect(reviewCadenceChartNameToFilter("已逾期")).toBe("overdue");
    expect(reviewCadenceChartNameToFilter("今日到期")).toBe("today");
    expect(reviewCadenceChartNameToFilter("待到期")).toBe("upcoming");
    expect(reviewCadenceChartNameToFilter("Other")).toBeNull();
    expect(reviewCadenceChartNameToFilter(undefined)).toBeNull();
  });

  it("maps priority chart labels to event levels", () => {
    expect(priorityChartNameToLevel("P0")).toBe("P0");
    expect(priorityChartNameToLevel("P1")).toBe("P1");
    expect(priorityChartNameToLevel("P2")).toBe("P2");
    expect(priorityChartNameToLevel("P3")).toBeNull();
    expect(priorityChartNameToLevel(undefined)).toBeNull();
  });

  it("maps strategy chart labels back to strategy tags", () => {
    expect(strategyChartNameToTag(strategyTagLabels.HIGH_THREAT_CORE)).toBe("HIGH_THREAT_CORE");
    expect(strategyChartNameToTag(strategyTagLabels.COUPON_DEPENDENT)).toBe("COUPON_DEPENDENT");
    expect(strategyChartNameToTag("暂无策略标签")).toBeNull();
    expect(strategyChartNameToTag(undefined)).toBeNull();
  });

  it("maps evidence driver chart labels back to attribution tags", () => {
    expect(attributionChartNameToTag(attributionTagLabels.PRICE_DRIVEN)).toBe("PRICE_DRIVEN");
    expect(attributionChartNameToTag(attributionTagLabels.COUPON_DRIVEN)).toBe("COUPON_DRIVEN");
    expect(attributionChartNameToTag("暂无归因驱动")).toBeNull();
    expect(attributionChartNameToTag(undefined)).toBeNull();
  });

  it("maps event type chart labels back to event type filters", () => {
    expect(eventTypeChartNameToType(insightEventTypeLabels.CORE_COMPETITOR_RISK)).toBe("CORE_COMPETITOR_RISK");
    expect(eventTypeChartNameToType(insightEventTypeLabels.COUPON_ADDED)).toBe("COUPON_ADDED");
    expect(eventTypeChartNameToType("暂无事件类型")).toBeNull();
    expect(eventTypeChartNameToType(undefined)).toBeNull();
  });

  it("maps evidence movement chart labels back to movement filters", () => {
    expect(evidenceMovementChartNameToFilter("BSR 上升")).toBe("rankGain");
    expect(evidenceMovementChartNameToFilter("价格下探")).toBe("priceCut");
    expect(evidenceMovementChartNameToFilter("Review 增长")).toBe("reviewGrowth");
    expect(evidenceMovementChartNameToFilter("暂无证据变化")).toBeNull();
    expect(evidenceMovementChartNameToFilter(undefined)).toBeNull();
  });

  it("maps score mix chart labels back to score driver filters", () => {
    expect(scoreDriverChartNameToFilter("排名动能")).toBe("rankingScore");
    expect(scoreDriverChartNameToFilter("商品机会")).toBe("productScore");
    expect(scoreDriverChartNameToFilter("活动/价格")).toBe("promoScore");
    expect(scoreDriverChartNameToFilter("品牌矩阵")).toBe("brandScore");
    expect(scoreDriverChartNameToFilter("核心风险")).toBe("riskScore");
    expect(scoreDriverChartNameToFilter("Other")).toBeNull();
  });

  it("maps review outcome chart labels back to review results", () => {
    expect(reviewOutcomeChartNameToResult(insightReviewResultLabels.CONFIRMED)).toBe("CONFIRMED");
    expect(reviewOutcomeChartNameToResult(insightReviewResultLabels.REVERTED)).toBe("REVERTED");
    expect(reviewOutcomeChartNameToResult("暂无复盘结果")).toBeNull();
    expect(reviewOutcomeChartNameToResult(undefined)).toBeNull();
  });

  it("maps chart pointer offsets to category buckets", () => {
    const buckets = ["Todo", "In progress", "Closed"];

    expect(chartBucketNameFromOffset(39, 487, buckets)).toBeNull();
    expect(chartBucketNameFromOffset(70, 487, buckets)).toBe("Todo");
    expect(chartBucketNameFromOffset(250, 487, buckets)).toBe("In progress");
    expect(chartBucketNameFromOffset(430, 487, buckets)).toBe("Closed");
    expect(chartBucketNameFromOffset(472, 487, buckets)).toBeNull();
    expect(chartBucketNameFromOffset(70, 40, buckets)).toBeNull();
    expect(chartBucketNameFromOffset(70, 487, [])).toBeNull();
  });

  it("maps vertical chart pointer offsets to category buckets", () => {
    const buckets = ["Top", "Middle", "Bottom"];

    expect(chartBucketNameFromVerticalOffset(17, 210, buckets)).toBeNull();
    expect(chartBucketNameFromVerticalOffset(30, 210, buckets)).toBe("Top");
    expect(chartBucketNameFromVerticalOffset(105, 210, buckets)).toBe("Middle");
    expect(chartBucketNameFromVerticalOffset(180, 210, buckets)).toBe("Bottom");
    expect(chartBucketNameFromVerticalOffset(193, 210, buckets)).toBeNull();
    expect(chartBucketNameFromVerticalOffset(30, 36, buckets)).toBeNull();
  });

  it("maps score composition pointer offsets to stacked score buckets", () => {
    const data = [
      { name: "Ranking", value: 30 },
      { name: "Product", value: 20 },
      { name: "Promo", value: 10 },
      { name: "Brand", value: 5 },
      { name: "Risk", value: 5 }
    ];

    expect(stackedScoreChartNameFromOffset(71, 487, data)).toBeNull();
    expect(stackedScoreChartNameFromOffset(80, 487, data)).toBe("Ranking");
    expect(stackedScoreChartNameFromOffset(300, 487, data)).toBe("Product");
    expect(stackedScoreChartNameFromOffset(390, 487, data)).toBe("Promo");
    expect(stackedScoreChartNameFromOffset(455, 487, data)).toBe("Risk");
    expect(stackedScoreChartNameFromOffset(470, 487, data)).toBeNull();
    expect(stackedScoreChartNameFromOffset(80, 90, data)).toBeNull();
    expect(stackedScoreChartNameFromOffset(80, 487, [{ name: "Ranking", value: 0 }])).toBeNull();
  });

  it("maps pie pointer offsets to weighted buckets", () => {
    const data = [
      { name: "P0", value: 1 },
      { name: "P1", value: 1 },
      { name: "P2", value: 2 }
    ];

    expect(pieChartNameFromOffset(105, 25, 210, 210, data)).toBe("P0");
    expect(pieChartNameFromOffset(165, 135, 210, 210, data)).toBe("P1");
    expect(pieChartNameFromOffset(60, 135, 210, 210, data)).toBe("P2");
    expect(pieChartNameFromOffset(105, 90, 210, 210, data)).toBeNull();
    expect(pieChartNameFromOffset(105, 25, 210, 210, [])).toBeNull();
  });
});
