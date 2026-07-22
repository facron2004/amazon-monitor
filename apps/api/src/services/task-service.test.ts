import { describe, expect, it } from "vitest";
import { inferTaskTypeFromEventType } from "./task-service.js";

describe("task service event mapping", () => {
  it.each([
    ["INVENTORY_STOCKOUT_RISK", "inventory"],
    ["ADS_ACOS_SPIKE", "ad"],
    ["REVIEW_NEGATIVE_CLUSTER", "review"],
    ["LISTING_HEALTH_LOW", "listing"],
    ["KEYWORD_PAGE_DROP", "keyword"],
    ["OWNED_RATING_DROP", "review"]
  ] as const)("maps %s to %s tasks", (eventType, taskType) => {
    expect(inferTaskTypeFromEventType(eventType)).toBe(taskType);
  });
});
