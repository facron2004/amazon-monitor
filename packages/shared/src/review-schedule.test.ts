import { describe, expect, it } from "vitest";
import {
  isoDateOffset,
  reviewScheduleDates,
  reviewScheduleOffsetsForEvent,
  reviewScheduleOffsetsOrDefault
} from "./review-schedule.js";

describe("review schedule rules", () => {
  it("schedules staged reviews for S-level new product breakout events", () => {
    const input = {
      eventDate: "2026-06-19",
      eventType: "NEW_PRODUCT_BREAKOUT" as const,
      scoreLevel: "S" as const,
      attributionTags: ["NEW_PRODUCT_PUSH" as const]
    };

    expect(reviewScheduleOffsetsForEvent(input)).toEqual([3, 7, 14]);
    expect(reviewScheduleDates(input)).toEqual(["2026-06-22", "2026-06-26", "2026-07-03"]);
  });

  it("combines promo-end, brand-matrix, and score rules without duplicate dates", () => {
    expect(reviewScheduleOffsetsForEvent({
      eventType: "COUPON_REMOVED",
      scoreLevel: "S",
      attributionTags: ["PROMO_END_DROP"]
    })).toEqual([1, 3, 7]);

    expect(reviewScheduleOffsetsForEvent({
      eventType: "BRAND_MATRIX_DROP",
      scoreLevel: "B",
      attributionTags: ["NO_CLEAR_DRIVER"]
    })).toEqual([7]);
  });

  it("keeps manual default offsets separate from automatic backend scheduling", () => {
    const lowSignal = {
      eventType: "RANK_DROP" as const,
      scoreLevel: "C" as const,
      attributionTags: ["NO_CLEAR_DRIVER" as const]
    };

    expect(reviewScheduleOffsetsForEvent(lowSignal)).toEqual([]);
    expect(reviewScheduleOffsetsOrDefault(lowSignal)).toEqual([3, 7, 14]);
  });

  it("uses UTC date math across month and year boundaries", () => {
    expect(isoDateOffset("2026-12-29", 3)).toBe("2027-01-01");
  });
});
