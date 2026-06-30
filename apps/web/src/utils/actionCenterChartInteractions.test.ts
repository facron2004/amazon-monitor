import { describe, expect, it } from "vitest";
import { strategyTagLabels } from "@amazon-monitor/shared";
import {
  chartBucketNameFromOffset,
  chartBucketNameFromVerticalOffset,
  isDueReviewCadenceChartName,
  pieChartNameFromOffset,
  priorityChartNameToLevel,
  strategyChartNameToTag,
  workflowChartNameToColumn
} from "./actionCenterChartInteractions";

describe("action center chart interactions", () => {
  it("maps workflow chart buckets to Action Center columns", () => {
    expect(workflowChartNameToColumn("Todo")).toBe("todo");
    expect(workflowChartNameToColumn("In progress")).toBe("mid");
    expect(workflowChartNameToColumn("Closed")).toBe("closed");
    expect(workflowChartNameToColumn("Other")).toBeNull();
    expect(workflowChartNameToColumn(undefined)).toBeNull();
  });

  it("only treats overdue and today cadence buckets as due-review filters", () => {
    expect(isDueReviewCadenceChartName("Overdue")).toBe(true);
    expect(isDueReviewCadenceChartName("Today")).toBe(true);
    expect(isDueReviewCadenceChartName("Upcoming")).toBe(false);
    expect(isDueReviewCadenceChartName(undefined)).toBe(false);
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
    expect(strategyChartNameToTag("No strategy tags")).toBeNull();
    expect(strategyChartNameToTag(undefined)).toBeNull();
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
