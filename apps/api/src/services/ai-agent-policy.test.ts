import { describe, expect, it } from "vitest";
import type { AiAgentOutput } from "@amazon-monitor/shared";
import { normalizeAiActionPriority, validateAiAgentOutput } from "./ai-agent-policy.js";

function validOutput(): AiAgentOutput {
  return {
    summary: "Competitor price pressure detected.",
    evidence: ["Competitor price fell by 8%."],
    impact: "Conversion may decline if the price gap persists.",
    recommended_actions: [{
      action: "Review the price gap",
      priority: "P1",
      reason: "The current gap exceeds the alert threshold.",
      risk: "A price change can reduce margin.",
      needs_human_approval: true
    }],
    confidence: 0.8
  };
}

describe("AI Agent policy", () => {
  it("downgrades low-confidence P0 actions", () => {
    expect(normalizeAiActionPriority("P0", 0.49)).toBe("P1");
    expect(normalizeAiActionPriority("P0", 0.5)).toBe("P0");
    expect(normalizeAiActionPriority("P1", 0.2)).toBe("P1");
  });

  it("rejects actions that bypass approval or promote low-confidence output to P0", () => {
    const output = validOutput();
    output.confidence = 0.35;
    output.recommended_actions[0] = {
      ...output.recommended_actions[0],
      priority: "P0",
      needs_human_approval: false as true
    };

    expect(validateAiAgentOutput(output)).toEqual(expect.arrayContaining([
      "recommended_actions.0.needs_human_approval must be true",
      "recommended_actions.0.priority cannot be P0 when confidence is below 0.5"
    ]));
  });

  it("accepts a complete approval-gated output", () => {
    expect(validateAiAgentOutput(validOutput())).toEqual([]);
  });

  it("rejects an incomplete Listing rewrite artifact", () => {
    const output = validOutput();
    output.artifacts = {
      listingRewrite: {
        proposedTitle: "",
        titleEvidence: [],
        bullets: [],
        imageBriefs: [],
        aPlusModules: [],
        riskNotes: []
      }
    };

    expect(validateAiAgentOutput(output)).toEqual(expect.arrayContaining([
      "artifacts.listingRewrite.proposedTitle is required",
      "artifacts.listingRewrite.bullets must contain evidence-backed drafts",
      "artifacts.listingRewrite.riskNotes must contain non-empty strings"
    ]));
  });

  it("rejects an incomplete Review VOC artifact", () => {
    const output = validOutput();
    output.artifacts = {
      reviewVoc: {
        negativeSummary: [],
        supplierActions: [],
        listingRecommendations: [],
        supportDrafts: [],
        productOpportunities: [],
        competitorPainComparison: [],
        customerLanguage: [],
        riskNotes: []
      }
    };

    expect(validateAiAgentOutput(output)).toEqual(expect.arrayContaining([
      "artifacts.reviewVoc.negativeSummary must contain non-empty strings",
      "artifacts.reviewVoc.supplierActions must contain evidence-backed actions",
      "artifacts.reviewVoc.competitorPainComparison must contain explicit evidence boundaries",
      "artifacts.reviewVoc.riskNotes must contain non-empty strings"
    ]));
  });

  it("rejects an incomplete Ads optimization artifact", () => {
    const output = validOutput();
    output.artifacts = {
      adsOptimization: {
        evidenceDate: "",
        wasteCandidates: [],
        negativeKeywordSuggestions: [],
        bidAdjustments: [],
        budgetAdjustments: [],
        scaleCandidates: [],
        dataGaps: [],
        riskNotes: []
      }
    };

    expect(validateAiAgentOutput(output)).toEqual(expect.arrayContaining([
      "artifacts.adsOptimization.evidenceDate is required",
      "artifacts.adsOptimization.dataGaps must contain non-empty strings",
      "artifacts.adsOptimization.riskNotes must contain non-empty strings"
    ]));
  });
});
