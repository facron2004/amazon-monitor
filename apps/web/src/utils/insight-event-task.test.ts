import { describe, expect, it } from "vitest";
import { inferInsightTaskType } from "./insight-event-task";

describe("inferInsightTaskType", () => {
  it.each([
    ["PRICE_DROP", "price"],
    ["COUPON_ADDED", "coupon"],
    ["DEAL_REMOVED", "coupon"],
    ["REVIEW_SPIKE", "review"],
    ["LISTING_CHANGED", "listing"],
    ["NEW_TOP50_ENTRY", "competitor"],
    ["CORE_COMPETITOR_RISK", "competitor"],
    ["RATING_DROP", "other"]
  ] as const)("maps %s to %s", (eventType, expected) => {
    expect(inferInsightTaskType(eventType)).toBe(expected);
  });
});
