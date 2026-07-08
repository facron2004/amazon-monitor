import { describe, expect, it } from "vitest";
import {
  buildReviewPresetOptions,
  reviewPresetOffsetsForEvent,
  type ReviewPresetEvent
} from "./actionCenterReviewPresets";

describe("action center review presets", () => {
  it("builds the PRD review follow-up preset dates from the selected business date", () => {
    expect(buildReviewPresetOptions("2026-06-30")).toEqual([
      { key: "threeDay", label: "3-day review", date: "2026-07-03" },
      { key: "sevenDay", label: "7-day review", date: "2026-07-07" },
      { key: "fourteenDay", label: "14-day review", date: "2026-07-14" }
    ]);
  });

  it("rolls over month and year boundaries with UTC date math", () => {
    expect(buildReviewPresetOptions("2026-12-29")).toEqual([
      { key: "threeDay", label: "3-day review", date: "2027-01-01" },
      { key: "sevenDay", label: "7-day review", date: "2027-01-05" },
      { key: "fourteenDay", label: "14-day review", date: "2027-01-12" }
    ]);
  });

  it("returns no presets when the base date is not a YYYY-MM-DD date", () => {
    expect(buildReviewPresetOptions("")).toEqual([]);
    expect(buildReviewPresetOptions("2026/06/30")).toEqual([]);
  });

  it("builds PRD staged presets for S-level new product breakout events", () => {
    const event = reviewEvent({
      eventType: "NEW_PRODUCT_BREAKOUT",
      scoreLevel: "S",
      attributionTags: ["NEW_PRODUCT_PUSH"]
    });

    expect(reviewPresetOffsetsForEvent(event)).toEqual([3, 7, 14]);
    expect(buildReviewPresetOptions("2026-06-30", event)).toEqual([
      { key: "threeDay", label: "3-day review", date: "2026-07-03" },
      { key: "sevenDay", label: "7-day review", date: "2026-07-07" },
      { key: "fourteenDay", label: "14-day review", date: "2026-07-14" }
    ]);
  });

  it("deduplicates promo-end and S-level review presets", () => {
    const event = reviewEvent({
      eventType: "COUPON_REMOVED",
      scoreLevel: "S",
      attributionTags: ["PROMO_END_DROP"]
    });

    expect(reviewPresetOffsetsForEvent(event)).toEqual([1, 3, 7]);
    expect(buildReviewPresetOptions("2026-06-30", event)).toEqual([
      { key: "oneDay", label: "1-day review", date: "2026-07-01" },
      { key: "threeDay", label: "3-day review", date: "2026-07-03" },
      { key: "sevenDay", label: "7-day review", date: "2026-07-07" }
    ]);
  });

  it("uses the 7-day PRD preset for brand matrix events", () => {
    const event = reviewEvent({
      eventType: "BRAND_MATRIX_SURGE",
      scoreLevel: "B",
      attributionTags: ["BRAND_MATRIX_PUSH"]
    });

    expect(buildReviewPresetOptions("2026-06-30", event)).toEqual([
      { key: "sevenDay", label: "7-day review", date: "2026-07-07" }
    ]);
  });

  it("keeps the manual fallback presets for low-signal events", () => {
    const event = reviewEvent({
      eventType: "RANK_DROP",
      scoreLevel: "C",
      attributionTags: ["NO_CLEAR_DRIVER"]
    });

    expect(reviewPresetOffsetsForEvent(event)).toEqual([3, 7, 14]);
  });
});

function reviewEvent(overrides: ReviewPresetEvent): ReviewPresetEvent {
  return overrides;
}
