import { describe, expect, it } from "vitest";
import type { AiReviewVocArtifact } from "@amazon-monitor/shared";
import { formatReviewVocArtifact } from "./review-voc-artifact";

describe("formatReviewVocArtifact", () => {
  it("keeps corrective actions, evidence gaps, and safety notes", () => {
    const artifact: AiReviewVocArtifact = {
      negativeSummary: ["quality: 3 negative / 3 mentions"],
      supplierActions: [{
        topic: "quality",
        priority: "P0",
        action: "Request corrective action.",
        evidence: "3 negative reviews"
      }],
      listingRecommendations: ["Clarify operating limits."],
      supportDrafts: [{
        scenario: "quality complaint",
        responseTemplate: "Confirm the exact symptom.",
        evidence: "3 negative reviews"
      }],
      productOpportunities: [{
        opportunity: "Reduce early failures.",
        evidence: "3 negative reviews",
        validationNeeded: "Validate by batch."
      }],
      competitorPainComparison: [{
        topic: "quality",
        ownProductEvidence: "3 negative reviews",
        competitorEvidence: null,
        conclusion: "Competitor evidence is unavailable."
      }],
      customerLanguage: [],
      riskNotes: ["Human review is required."]
    };

    const output = formatReviewVocArtifact(artifact);

    expect(output).toContain("[P0] quality: Request corrective action.");
    expect(output).toContain("competitor=unavailable");
    expect(output).toContain("Validate: Validate by batch.");
    expect(output).toContain("- Human review is required.");
  });
});
