import { describe, expect, it } from "vitest";
import { reviewScheduleDates, scheduleNextReviewDate, scheduleReviewDate } from "./review-scheduler.js";

describe("review scheduler", () => {
  it("schedules staged reviews for S-level and breakout events", () => {
    const breakout = {
      eventDate: "2026-06-19",
      eventType: "NEW_PRODUCT_BREAKOUT" as const,
      scoreLevel: "S" as const,
      attributionTags: ["NEW_PRODUCT_PUSH" as const]
    };

    expect(reviewScheduleDates(breakout)).toEqual(["2026-06-22", "2026-06-26", "2026-07-03"]);
    expect(scheduleReviewDate(breakout)).toBe("2026-06-22");
    expect(scheduleNextReviewDate(breakout, "2026-06-22")).toBe("2026-06-26");
    expect(scheduleNextReviewDate(breakout, "2026-07-03")).toBeNull();
  });

  it("combines score and event rules without duplicate review dates", () => {
    expect(reviewScheduleDates({
      eventDate: "2026-06-19",
      eventType: "COUPON_REMOVED",
      scoreLevel: "S",
      attributionTags: ["PROMO_END_DROP"]
    })).toEqual(["2026-06-20", "2026-06-22", "2026-06-26"]);

    expect(reviewScheduleDates({
      eventDate: "2026-06-19",
      eventType: "BRAND_MATRIX_SURGE",
      scoreLevel: "B",
      attributionTags: ["BRAND_MATRIX_PUSH"]
    })).toEqual(["2026-06-26"]);
  });
});