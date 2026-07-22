import { describe, expect, it } from "vitest";
import type { AiListingRewriteDraft } from "@amazon-monitor/shared";
import { formatListingRewriteDraft } from "./listing-rewrite-draft";

describe("formatListingRewriteDraft", () => {
  it("preserves evidence, draft sections, and approval risks", () => {
    const draft: AiListingRewriteDraft = {
      proposedTitle: "Acme Nugget Ice Maker",
      titleEvidence: ["Core keyword: nugget ice maker"],
      bullets: [{
        label: "Buyer theme 1",
        copy: "Explain verified cleaning behavior.",
        evidence: ["Review highlight: cleaning"]
      }],
      imageBriefs: [{
        slot: "Cleaning guide",
        objective: "Show verified cleaning steps.",
        evidence: "Q&A gap: How do I clean it?"
      }],
      aPlusModules: [{
        module: "FAQ",
        objective: "Resolve open buyer questions.",
        evidence: "Two Q&A gaps"
      }],
      riskNotes: ["Human approval is required."]
    };

    const output = formatListingRewriteDraft(draft);

    expect(output).toContain("Acme Nugget Ice Maker");
    expect(output).toContain("Evidence: Review highlight: cleaning");
    expect(output).toContain("Show verified cleaning steps.");
    expect(output).toContain("- Human approval is required.");
  });
});
