import type { AiAdsOptimizationArtifact } from "@amazon-monitor/shared";

export function formatAdsOptimizationArtifact(artifact: AiAdsOptimizationArtifact): string {
  return [
    `# Ads Optimization Action Pack (${artifact.evidenceDate})`,
    "",
    "## Waste Candidates",
    ...artifact.wasteCandidates.map((item) => (
      `- ${item.campaign} / ${item.target}: spend=${item.spend ?? "n/a"}, sales=${item.sales ?? "n/a"}, clicks=${item.clicks ?? "n/a"}; ${item.reason}`
    )),
    "",
    "## Negative Keyword Suggestions",
    ...artifact.negativeKeywordSuggestions.map((item) => (
      `- [${item.matchType}] ${item.term} (${item.campaign}): ${item.reason}`
    )),
    "",
    "## Bid Adjustments",
    ...artifact.bidAdjustments.map((item) => (
      `- ${item.direction} ${item.suggestedChangePercent ?? 0}%: ${item.campaign} / ${item.target}; ${item.reason}`
    )),
    "",
    "## Budget Adjustments",
    ...artifact.budgetAdjustments.map((item) => (
      `- ${item.direction} ${item.suggestedChangePercent ?? 0}%: ${item.campaign}; ${item.reason}\n  Guardrails: ${item.guardrails.join(" | ")}`
    )),
    "",
    "## Scale Candidates",
    ...artifact.scaleCandidates.map((item) => (
      `- ${item.campaign} / ${item.target}: ${item.recommendation}`
    )),
    "",
    "## Data Gaps",
    ...artifact.dataGaps.map((item) => `- ${item}`),
    "",
    "## Risk Notes",
    ...artifact.riskNotes.map((item) => `- ${item}`)
  ].join("\n");
}
