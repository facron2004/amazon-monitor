import { describe, expect, it } from "vitest";
import { buildDataQualityEvidence } from "./data-quality-adapter.js";

const source = {
  id: 1,
  orgId: 7,
  name: "SP API",
  sourceType: "sp_api" as const,
  marketplace: "US",
  status: "connected" as const,
  syncStatus: "success" as const,
  lastSyncedAt: "2026-08-14T00:00:00.000Z",
  lastSuccessAt: "2026-08-14T00:00:00.000Z",
  syncError: null,
  ownerId: null,
  notes: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

describe("Agent OS data quality adapter", () => {
  it("returns INVALID when no real source evidence exists", () => {
    const result = buildDataQualityEvidence({
      checkedAt: "2026-08-14T00:00:00.000Z",
      collectionFreshness: [],
      dataSources: [],
    });
    expect(result.report.status).toBe("INVALID");
    expect(result.evidenceGate.action).toBe("STOP");
  });

  it("marks a fresh connected source as trusted", () => {
    const result = buildDataQualityEvidence({
      checkedAt: "2026-08-14T02:00:00.000Z",
      collectionFreshness: [{
        taskType: "keyword",
        lastCompletedAt: "2026-08-14T01:00:00.000Z",
        lastStartedAt: "2026-08-14T00:55:00.000Z",
        lastStatus: "completed",
        dataSource: "SP API",
        lastSyncedAt: "2026-08-14T01:00:00.000Z",
        syncStatus: "success",
        syncError: null,
        totalJobs: 10,
        failedJobs: 0,
      }],
      dataSources: [source],
    });
    expect(result.report.status).toBe("TRUSTED");
    expect(result.evidenceGate.action).toBe("ANALYZE");
  });

  it("requires refresh for stale or failed and mapping-incomplete evidence", () => {
    const result = buildDataQualityEvidence({
      checkedAt: "2026-08-14T12:00:00.000Z",
      collectionFreshness: [{
        taskType: "keyword",
        lastCompletedAt: "2026-08-10T00:00:00.000Z",
        lastStartedAt: "2026-08-10T00:00:00.000Z",
        lastStatus: "failed",
        dataSource: "SP API",
        lastSyncedAt: "2026-08-10T00:00:00.000Z",
        syncStatus: "failed",
        syncError: "rate limited",
        totalJobs: 2,
        failedJobs: 2,
      }],
      dataSources: [{ ...source, syncStatus: "failed", syncError: "rate limited" }],
      mappingIssues: [{ dataSourceId: 1, openCount: 2 }],
    });
    expect(result.report.status).toBe("INVALID");
    expect(result.refreshRequired).toBe(true);
    expect(result.report.invalidSources.length).toBeGreaterThan(0);
  });
});
