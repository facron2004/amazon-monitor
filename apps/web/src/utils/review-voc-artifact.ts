import type { AiReviewVocArtifact } from "@amazon-monitor/shared";

export function formatReviewVocArtifact(artifact: AiReviewVocArtifact): string {
  return [
    "# Review VOC Action Pack",
    "",
    "## Negative Summary",
    ...artifact.negativeSummary.map((item) => `- ${item}`),
    "",
    "## Supplier Corrective Actions",
    ...artifact.supplierActions.map((item, index) => (
      `${index + 1}. [${item.priority}] ${item.topic}: ${item.action}\n   Evidence: ${item.evidence}`
    )),
    "",
    "## Listing Recommendations",
    ...artifact.listingRecommendations.map((item) => `- ${item}`),
    "",
    "## Support Response Drafts",
    ...artifact.supportDrafts.map((item, index) => (
      `${index + 1}. ${item.scenario}: ${item.responseTemplate}\n   Evidence: ${item.evidence}`
    )),
    "",
    "## Product Opportunities",
    ...artifact.productOpportunities.map((item, index) => (
      `${index + 1}. ${item.opportunity}\n   Evidence: ${item.evidence}\n   Validate: ${item.validationNeeded}`
    )),
    "",
    "## Competitor Pain Comparison",
    ...artifact.competitorPainComparison.map((item) => (
      `- ${item.topic}: own=${item.ownProductEvidence}; competitor=${item.competitorEvidence ?? "unavailable"}; ${item.conclusion}`
    )),
    "",
    "## Risk Notes",
    ...artifact.riskNotes.map((item) => `- ${item}`)
  ].join("\n");
}
