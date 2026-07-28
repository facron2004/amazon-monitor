import { describe, expect, it } from "vitest";
import {
  assessDataFreshness,
  guardAgentOutput,
  isDataFreshnessSafe
} from "./ai-data-freshness.js";

const now = new Date("2026-07-26T12:00:00.000Z");

describe("AI data freshness", () => {
  it("uses the business evidence date while retaining the latest sync time", () => {
    const freshness = assessDataFreshness({
      evidenceDate: "2026-07-26",
      records: [{
        dataSource: "ads_api",
        lastSyncedAt: "2026-07-26T10:00:00.000Z",
        syncStatus: "success"
      }],
      maxAgeHours: 24,
      dataLabel: "Ads",
      now
    });

    expect(freshness).toMatchObject({
      dataSource: "ads_api",
      syncStatus: "success",
      freshnessStatus: "fresh",
      ageHours: 0,
      lastSyncedAt: "2026-07-26T10:00:00.000Z"
    });
    expect(isDataFreshnessSafe(freshness)).toBe(true);
  });

  it("marks incomplete evidence unsafe even when its date is current", () => {
    const freshness = assessDataFreshness({
      evidenceDate: "2026-07-26",
      records: [{
        dataSource: "listing_import",
        lastSyncedAt: "2026-07-26T11:00:00.000Z",
        syncStatus: "partial",
        syncError: "Two images were unavailable"
      }],
      maxAgeHours: 24,
      dataLabel: "Listing",
      now
    });

    expect(freshness.freshnessStatus).toBe("fresh");
    expect(freshness.failureReason).toBe("Two images were unavailable");
    expect(freshness.warning).toContain("partial");
    expect(isDataFreshnessSafe(freshness)).toBe(false);
  });

  it("caps confidence and replaces execution actions when evidence is stale", () => {
    const freshness = assessDataFreshness({
      evidenceDate: "2026-07-24",
      records: [{ dataSource: "manual", lastSyncedAt: null, syncStatus: "manual" }],
      maxAgeHours: 24,
      dataLabel: "Review",
      now
    });
    const guarded = guardAgentOutput({
      summary: "summary",
      evidence: ["domain evidence"],
      impact: "domain impact",
      recommended_actions: [{
        action: "Change the listing",
        priority: "P0",
        reason: "reason",
        risk: "risk",
        needs_human_approval: true
      }],
      confidence: 0.8
    }, freshness, {
      action: "Refresh Review evidence",
      priority: "P2",
      reason: "The evidence is stale.",
      risk: "Acting now may use stale evidence.",
      needs_human_approval: true
    });

    expect(guarded.confidence).toBe(0.49);
    expect(guarded.recommended_actions).toHaveLength(1);
    expect(guarded.recommended_actions[0]?.action).toBe("Refresh Review evidence");
    expect(guarded.dataFreshness?.freshnessStatus).toBe("stale");
  });
});
