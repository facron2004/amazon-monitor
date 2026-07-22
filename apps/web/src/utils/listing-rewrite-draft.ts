import type { AiListingRewriteDraft } from "@amazon-monitor/shared";

export function formatListingRewriteDraft(draft: AiListingRewriteDraft): string {
  return [
    "# Listing Rewrite Draft",
    "",
    "## Proposed Title",
    draft.proposedTitle,
    "",
    "## Bullet Drafts",
    ...draft.bullets.map((item, index) => (
      `${index + 1}. ${item.label}: ${item.copy}\n   Evidence: ${item.evidence.join(" | ")}`
    )),
    "",
    "## Image Briefs",
    ...draft.imageBriefs.map((item, index) => (
      `${index + 1}. ${item.slot}: ${item.objective}\n   Evidence: ${item.evidence}`
    )),
    "",
    "## A+ Modules",
    ...draft.aPlusModules.map((item, index) => (
      `${index + 1}. ${item.module}: ${item.objective}\n   Evidence: ${item.evidence}`
    )),
    "",
    "## Risk Notes",
    ...draft.riskNotes.map((item) => `- ${item}`)
  ].join("\n");
}
