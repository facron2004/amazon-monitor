import { describe, expect, it } from "vitest";
import type { InsightEventFilters } from "../stores/insightEvents";
import {
  clearActionFilter,
  clearActionFilters,
  getActionFilterBadges,
  getActionFilterSummaryStats
} from "./actionCenterFilterSummary";

function makeFilters(overrides: Partial<InsightEventFilters> = {}): InsightEventFilters {
  return {
    date: "2026-06-29",
    status: "",
    level: "",
    eventType: "",
    reviewResult: "",
    brand: "",
    asin: "",
    assignee: "",
    attributionTag: "",
    evidenceMovement: "",
    reviewCadence: "",
    actionStage: "",
    scoreDriver: "",
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
      reviewResult: "CONFIRMED",
      attributionTag: "PRICE_DRIVEN",
      evidenceMovement: "priceCut",
      reviewCadence: "today",
      actionStage: "unassigned",
      scoreDriver: "promoScore",
      strategyTag: "HIGH_THREAT_CORE",
      brand: "EUHOMY",
      assignee: "Ada",
      coreOnly: true,
      sortBy: "rankChange"
    }));

    expect(badges.map((badge) => badge.key)).toEqual([
      "level",
      "reviewResult",
      "attributionTag",
      "evidenceMovement",
      "reviewCadence",
      "actionStage",
      "scoreDriver",
      "strategyTag",
      "brand",
      "assignee",
      "coreOnly",
      "sortBy"
    ]);
    expect(badges.find((badge) => badge.key === "brand")?.value).toBe("EUHOMY");
  });

  it("summarizes the global action scope when no filters are active", () => {
    expect(getActionFilterSummaryStats(makeFilters(), 12, 4)).toEqual({
      visibleCount: 12,
      asinCaseCount: 4,
      activeFilterCount: 0,
      scopeLabel: "全局行动视图",
      scopeTone: "info",
      filterDepthPercent: 0,
      eventsPerCase: 3
    });
  });

  it("summarizes focused filters and empty filtered results", () => {
    expect(getActionFilterSummaryStats(makeFilters({
      level: "P0",
      brand: "EUHOMY",
      reviewDueOnly: true
    }), 5, 2)).toMatchObject({
      activeFilterCount: 3,
      scopeLabel: "聚焦视图",
      scopeTone: "success",
      filterDepthPercent: 38,
      eventsPerCase: 2.5
    });

    expect(getActionFilterSummaryStats(makeFilters({
      brand: "Missing"
    }), 0, 0)).toMatchObject({
      activeFilterCount: 1,
      scopeLabel: "聚焦视图",
      scopeTone: "warning",
      filterDepthPercent: 13,
      eventsPerCase: 0
    });
  });

  it("clears individual filters without changing the date", () => {
    const filters = makeFilters({
      brand: "EUHOMY",
      reviewResult: "CONFIRMED",
      attributionTag: "PRICE_DRIVEN",
      evidenceMovement: "priceCut",
      reviewCadence: "overdue",
      actionStage: "reviewDue",
      scoreDriver: "brandScore",
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
    expect(clearActionFilter(filters, "reviewResult").reviewResult).toBe("");
    expect(clearActionFilter(filters, "attributionTag").attributionTag).toBe("");
    expect(clearActionFilter(filters, "evidenceMovement").evidenceMovement).toBe("");
    expect(clearActionFilter(filters, "reviewCadence").reviewCadence).toBe("");
    expect(clearActionFilter(filters, "actionStage").actionStage).toBe("");
    expect(clearActionFilter(filters, "scoreDriver").scoreDriver).toBe("");
  });

  it("clears all action filters while preserving the selected date", () => {
    expect(clearActionFilters(makeFilters({
      status: "TODO",
      level: "P1",
      eventType: "COUPON_ADDED",
      reviewResult: "FAILED",
      attributionTag: "COUPON_DRIVEN",
      evidenceMovement: "reviewGrowth",
      reviewCadence: "upcoming",
      actionStage: "scheduled",
      scoreDriver: "riskScore",
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
