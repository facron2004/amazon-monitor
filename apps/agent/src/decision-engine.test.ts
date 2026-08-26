import { describe, expect, it } from "vitest";
import { evaluateDecision } from "./decision-engine.js";

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

const baseDraft = {
  id: "decision-1",
  issue: "Organic rank declined",
  rootCauses: ["Impression share fell"],
  evidence: ["rank-event-1"],
  constraints: [],
  confidence: 0.9,
  options: [
    {
      id: "budget",
      label: "Increase exact budget",
      rationale: "Recover qualified impressions",
      expectedImpact: 0.8,
      executionEase: 0.7,
      risk: 0.4,
      riskLevel: "medium" as const,
      confidence: 0.92,
    },
    {
      id: "report",
      label: "Create report",
      rationale: "Collect more context",
      expectedImpact: 0.5,
      executionEase: 0.9,
      risk: 0.2,
      riskLevel: "low" as const,
      confidence: 0.95,
    },
  ],
};

describe("decision engine", () => {
  it("sorts options by eligible score and recommends the best option", () => {
    const result = evaluateDecision({ draft: baseDraft, dataQuality: trustedData });

    expect(result.rankedOptions.map((item) => item.option.id)).toEqual(["report", "budget"]);
    expect(result.recommendedOption).toBe("report");
    expect(result.automaticExecutionEligible).toBe(true);
    expect(result.requiredApproval).toBe(false);
  });

  it("requires approval for medium risk even with high confidence", () => {
    const result = evaluateDecision({
      draft: { ...baseDraft, options: [baseDraft.options[0]] },
      dataQuality: trustedData,
    });

    expect(result).toMatchObject({
      recommendedOption: "budget",
      requiredApproval: true,
      automaticExecutionEligible: false,
      reason: "approval_required",
    });
  });

  it("does not recommend an option when constraints conflict or evidence is blocked", () => {
    const constrained = evaluateDecision({
      draft: {
        ...baseDraft,
        constraints: [{ metric: "acos", operator: "lte", value: 0.3, unit: "percent" }],
      },
      dataQuality: trustedData,
    });
    expect(constrained).toMatchObject({
      recommendedOption: null,
      automaticExecutionEligible: false,
      reason: "constraint_conflict",
    });

    const stale = evaluateDecision({
      draft: baseDraft,
      dataQuality: { ...trustedData, status: "STALE", refreshRequired: true },
    });
    expect(stale).toMatchObject({ automaticExecutionEligible: false, reason: "evidence_blocked" });
  });
});
