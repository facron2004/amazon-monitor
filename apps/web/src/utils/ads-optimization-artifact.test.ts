import { describe, expect, it } from "vitest";
import type { AiAdsOptimizationArtifact } from "@amazon-monitor/shared";
import { formatAdsOptimizationArtifact } from "./ads-optimization-artifact";

describe("formatAdsOptimizationArtifact", () => {
  it("preserves negative review state, bounded changes, and guardrails", () => {
    const artifact: AiAdsOptimizationArtifact = {
      evidenceDate: "2026-07-16",
      wasteCandidates: [{
        campaign: "Waste",
        target: "cheap ice maker",
        spend: 95,
        sales: 0,
        clicks: 65,
        reason: "Spend without sales.",
        evidence: ["spend=95"]
      }],
      negativeKeywordSuggestions: [{
        term: "cheap ice maker",
        matchType: "exact",
        campaign: "Waste",
        reason: "No attributed sales.",
        evidence: ["sales=0"]
      }],
      bidAdjustments: [{
        target: "cheap ice maker",
        campaign: "Waste",
        direction: "decrease",
        suggestedChangePercent: 20,
        reason: "Waste risk.",
        evidence: ["spend=95"]
      }],
      budgetAdjustments: [{
        campaign: "Scale",
        direction: "increase",
        currentBudget: 32,
        suggestedChangePercent: 10,
        reason: "Efficient and capped.",
        guardrails: ["Check inventory."]
      }],
      scaleCandidates: [],
      dataGaps: ["Current bid is unavailable."],
      riskNotes: ["Human approval is required."]
    };

    const output = formatAdsOptimizationArtifact(artifact);

    expect(output).toContain("[exact] cheap ice maker");
    expect(output).toContain("decrease 20%");
    expect(output).toContain("Guardrails: Check inventory.");
    expect(output).toContain("- Human approval is required.");
  });
});
