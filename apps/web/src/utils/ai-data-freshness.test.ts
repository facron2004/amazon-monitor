import { describe, expect, it } from "vitest";
import type { AiDataFreshness } from "@amazon-monitor/shared";
import { isAiDataFreshnessSafe } from "./ai-data-freshness";

const freshness: AiDataFreshness = {
  evidenceDate: "2026-07-26",
  evaluatedAt: "2026-07-26T05:00:00.000Z",
  dataSource: "manual",
  lastSyncedAt: null,
  syncStatus: "manual",
  freshnessStatus: "fresh",
  ageHours: 0,
  maxAgeHours: 24,
  failureReason: null,
  warning: null
};

describe("isAiDataFreshnessSafe", () => {
  it("accepts complete fresh evidence and legacy output without freshness metadata", () => {
    expect(isAiDataFreshnessSafe(freshness)).toBe(true);
    expect(isAiDataFreshnessSafe(undefined)).toBe(true);
  });

  it("rejects stale or incomplete evidence", () => {
    expect(isAiDataFreshnessSafe({ ...freshness, freshnessStatus: "stale" })).toBe(false);
    expect(isAiDataFreshnessSafe({ ...freshness, syncStatus: "partial" })).toBe(false);
  });
});
