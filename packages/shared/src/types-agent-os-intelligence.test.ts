import { describe, expect, it } from "vitest";
import {
  intelligenceAttributionTypes,
  intelligenceOutcomeStatuses,
  opportunityTypes,
  validateDecisionDraft,
  validateExperiment,
  validateOpportunity,
  type DecisionDraft,
  type Experiment,
  type Opportunity,
} from "./types-agent-os-intelligence.js";

describe("Agent OS intelligence contracts", () => {
  it("keeps the roadmap opportunity classes explicit and validates score inputs", () => {
    expect(opportunityTypes).toHaveLength(8);
    const opportunity: Opportunity = {
      id: "opp-1",
      type: "price_gap",
      title: "Competitor price gap",
      targetId: "B0TESTASIN",
      marketPotential: 0.8,
      expectedImpact: 0.7,
      executionEase: 0.6,
      risk: 0.4,
      riskLevel: "medium",
      confidence: 0.86,
      evidence: ["serp-2026-08-14"],
      constraints: [],
    };

    expect(validateOpportunity(opportunity)).toEqual({ valid: true, errors: [] });
    expect(validateOpportunity({ ...opportunity, risk: 0 })).toMatchObject({ valid: false });
  });

  it("separates draft/evaluation contracts from the existing Decision contract", () => {
    const draft: DecisionDraft = {
      issue: "Organic rank declined",
      rootCauses: ["Impression share fell"],
      evidence: ["rank-event-1"],
      options: [{
        id: "budget",
        label: "Increase exact budget",
        rationale: "Recover qualified impressions",
        expectedImpact: 0.7,
        executionEase: 0.6,
        risk: 0.4,
        riskLevel: "medium",
        confidence: 0.86,
      }],
      constraints: [],
      confidence: 0.86,
    };

    expect(validateDecisionDraft(draft).valid).toBe(true);
    expect(validateDecisionDraft({ ...draft, options: [] }).valid).toBe(false);
  });

  it("covers experiment outcome and attribution vocabulary", () => {
    const experiment: Experiment = {
      id: "exp-1",
      hypothesis: "A tighter keyword bid improves organic rank",
      action: "Increase exact bid",
      metric: "organic_rank",
      expectedDirection: "decrease",
      expectedValue: 12,
      before: 18,
      after: null,
      evidenceScore: 0.92,
      observationDays: 2,
      plannedObservationDays: 7,
      riskLevel: "medium",
      confidence: 0.88,
      constraints: [],
      status: "OBSERVING",
    };

    expect(validateExperiment(experiment).valid).toBe(true);
    expect(intelligenceOutcomeStatuses).toEqual(["EFFECTIVE", "INEFFECTIVE", "INCONCLUSIVE", "PENDING"]);
    expect(intelligenceAttributionTypes).toEqual(["DIRECT", "CORRELATED", "UNKNOWN"]);
  });
});
