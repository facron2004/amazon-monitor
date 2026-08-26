import { describe, expect, it } from "vitest";
import { evaluateOpportunity, rankOpportunities, type OpportunityEvaluationInput } from "./opportunity-engine.js";

const trustedData = {
  status: "TRUSTED" as const,
  score: 1,
  checkedAt: "2026-08-14T00:00:00.000Z",
  staleSources: [],
  missingSources: [],
  invalidSources: [],
  warnings: [],
  refreshRequired: false,
};

function opportunity(overrides: Partial<OpportunityEvaluationInput["opportunity"]> = {}): OpportunityEvaluationInput {
  return {
    opportunity: {
      id: "opp-1",
      type: "keyword",
      title: "Keyword gap",
      targetId: "B0TESTASIN",
      marketPotential: 0.8,
      expectedImpact: 0.7,
      executionEase: 0.6,
      risk: 0.4,
      riskLevel: "low",
      confidence: 0.92,
      evidence: ["serp-1"],
      constraints: [],
      ...overrides,
    },
    dataQuality: trustedData,
  };
}

describe("opportunity engine", () => {
  it("scores and ranks valid opportunities with the roadmap formula", () => {
    const first = evaluateOpportunity(opportunity());
    const second = evaluateOpportunity(opportunity({ id: "opp-2", expectedImpact: 0.4 }));

    expect(first.score).toBe(0.773);
    expect(first.automaticExecutionEligible).toBe(true);
    expect(rankOpportunities([second, first]).map((item) => item.opportunity.id)).toEqual(["opp-1", "opp-2"]);
  });

  it("fails closed when evidence is stale, confidence is low, or constraints conflict", () => {
    expect(evaluateOpportunity({
      ...opportunity({ confidence: 0.69 }),
      dataQuality: { ...trustedData, status: "STALE", refreshRequired: true },
    })).toMatchObject({ automaticExecutionEligible: false, reason: "evidence_blocked" });

    expect(evaluateOpportunity(opportunity({ confidence: 0.69 }))).toMatchObject({
      automaticExecutionEligible: false,
      reason: "low_confidence",
    });

    expect(evaluateOpportunity(opportunity({
      constraints: [{ metric: "acos", operator: "lte", value: 0.3, unit: "percent" }],
    }))).toMatchObject({ automaticExecutionEligible: false, reason: "constraint_conflict" });
  });

  it("rejects inconsistent execution difficulty and invalid scores", () => {
    const result = evaluateOpportunity(opportunity({ executionEase: 0.8, executionDifficulty: 0.8 }));
    expect(result.valid).toBe(false);
    expect(result.reasons.some((reason) => reason.includes("executionEase"))).toBe(true);
  });
});
