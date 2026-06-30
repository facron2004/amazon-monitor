import { describe, expect, it } from "vitest";
import type { InsightEventFilters } from "../stores/insightEvents";
import {
  clearActionFilter,
  clearActionFilters,
  getActionFilterBadges
} from "./actionCenterFilterSummary";

function makeFilters(overrides: Partial<InsightEventFilters> = {}): InsightEventFilters {
  return {
    date: "2026-06-29",
    status: "",
    level: "",
    eventType: "",
    brand: "",
    asin: "",
    assignee: "",
    strategyTag: "",
    unassignedOnly: false,
    sortBy: "score",
    coreOnly: false,
    newBreakoutOnly: false,
    reviewDueOnly: false,
    ...overrides
  };
}

describe("action center filter summary", () => {
  it("builds badges only for active action filters", () => {
    const badges = getActionFilterBadges(makeFilters({
      level: "P0",
      strategyTag: "HIGH_THREAT_CORE",
      brand: "EUHOMY",
      assignee: "Ada",
      coreOnly: true,
      sortBy: "rankChange"
    }));

    expect(badges.map((badge) => badge.key)).toEqual([
      "level",
      "strategyTag",
      "brand",
      "assignee",
      "coreOnly",
      "sortBy"
    ]);
    expect(badges.find((badge) => badge.key === "brand")?.value).toBe("EUHOMY");
  });

  it("clears individual filters without changing the date", () => {
    const filters = makeFilters({
      brand: "EUHOMY",
      strategyTag: "HIGH_THREAT_CORE",
      unassignedOnly: true,
      sortBy: "level"
    });

    expect(clearActionFilter(filters, "strategyTag")).toMatchObject({
      date: "2026-06-29",
      brand: "EUHOMY",
      strategyTag: "",
      unassignedOnly: true,
      sortBy: "level"
    });
    expect(clearActionFilter(filters, "sortBy").sortBy).toBe("score");
  });

  it("clears all action filters while preserving the selected date", () => {
    expect(clearActionFilters(makeFilters({
      status: "TODO",
      level: "P1",
      eventType: "COUPON_ADDED",
      strategyTag: "COUPON_DEPENDENT",
      brand: "Acme",
      asin: "B000",
      assignee: "Ada",
      unassignedOnly: true,
      sortBy: "createdAt",
      coreOnly: true,
      newBreakoutOnly: true,
      reviewDueOnly: true
    }))).toEqual(makeFilters());
  });
});
