import { describe, expect, it } from "vitest";
import {
  applyEvidenceGate,
  assessDataQuality,
  classifyAgentConfidence,
  resolveApprovalPolicy,
  scoreOpportunity,
} from "./data-quality-engine.js";

describe("data quality evidence gate", () => {
  it("classifies trusted, partial, stale, and invalid evidence", () => {
    expect(assessDataQuality([
      { source: "serp", ageHours: 2, completeness: 1, collectionStatus: "success", mapped: true },
    ], "2026-08-13T00:00:00.000Z").status).toBe("TRUSTED");
    expect(assessDataQuality([
      { source: "ads", ageHours: 2, completeness: 0.8, collectionStatus: "partial", mapped: true },
    ], "2026-08-13T00:00:00.000Z").status).toBe("PARTIAL");
    expect(assessDataQuality([
      { source: "reviews", ageHours: 48, maxAgeHours: 24, collectionStatus: "success", mapped: true },
    ], "2026-08-13T00:00:00.000Z").status).toBe("STALE");
    expect(assessDataQuality([
      { source: "inventory", ageHours: 1, collectionStatus: "failed", mapped: false, apiError: "timeout" },
    ], "2026-08-13T00:00:00.000Z").status).toBe("INVALID");
    expect(assessDataQuality([
      { source: "mapping", ageHours: 1, collectionStatus: "success", mapped: false },
    ], "2026-08-13T00:00:00.000Z").status).toBe("INVALID");
  });

  it("prioritizes refresh for stale evidence and blocks invalid evidence", () => {
    const stale = assessDataQuality([
      { source: "serp", ageHours: 72, maxAgeHours: 24, collectionStatus: "success" },
    ], "2026-08-13T00:00:00.000Z");
    expect(applyEvidenceGate(stale)).toMatchObject({ allowed: false, action: "REFRESH" });
    expect(applyEvidenceGate({ ...stale, status: "INVALID" })).toMatchObject({ allowed: false, action: "STOP" });
  });
});

describe("opportunity and approval policy", () => {
  it("scores opportunities and never treats zero risk as infinite opportunity", () => {
    expect(scoreOpportunity({
      marketPotential: 0.8,
      confidence: 0.9,
      expectedImpact: 0.7,
      executionEase: 0.6,
      risk: 0.4,
    })).toMatchObject({ score: 0.756, eligible: true });
    expect(scoreOpportunity({
      marketPotential: 1,
      confidence: 1,
      expectedImpact: 1,
      executionEase: 1,
      risk: 0,
    })).toMatchObject({ score: 0, eligible: false });
    expect(scoreOpportunity({
      marketPotential: 1.2,
      confidence: 0.8,
      expectedImpact: 0.5,
      executionEase: 0.5,
      risk: 0.5,
    })).toMatchObject({ score: 0, reason: "invalid_input" });
  });

  it("keeps low confidence and risky actions behind approval", () => {
    expect(classifyAgentConfidence(0.95)).toBe("HIGH");
    expect(classifyAgentConfidence(0.7)).toBe("MEDIUM");
    expect(classifyAgentConfidence(0.69)).toBe("LOW");
    expect(resolveApprovalPolicy(0.69, "LOW")).toMatchObject({ automatic: false, requiresApproval: true });
    expect(resolveApprovalPolicy(0.95, "HIGH")).toMatchObject({ automatic: false, requiresApproval: true });
    expect(resolveApprovalPolicy(0.95, "LOW")).toMatchObject({ automatic: true, requiresApproval: false });
  });
});
