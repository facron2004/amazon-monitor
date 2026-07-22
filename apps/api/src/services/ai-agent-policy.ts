import type { AiActionPriority, AiAgentOutput } from "@amazon-monitor/shared";

export const MIN_ACTIONABLE_CONFIDENCE = 0.5;

export function normalizeAiActionPriority(
  priority: AiActionPriority,
  confidence: number
): AiActionPriority {
  if (confidence >= MIN_ACTIONABLE_CONFIDENCE || priority !== "P0") return priority;
  return "P1";
}

export function validateAiAgentOutput(output: AiAgentOutput): string[] {
  const errors: string[] = [];
  if (!output.summary.trim()) errors.push("summary is required");
  if (!output.impact.trim()) errors.push("impact is required");
  if (!Number.isFinite(output.confidence) || output.confidence < 0 || output.confidence > 1) {
    errors.push("confidence must be between 0 and 1");
  }
  if (!Array.isArray(output.evidence) || output.evidence.length === 0 || output.evidence.some((item) => !item.trim())) {
    errors.push("evidence must contain non-empty strings");
  }
  if (!Array.isArray(output.recommended_actions) || output.recommended_actions.length === 0) {
    errors.push("recommended_actions must contain at least one action");
  }
  for (const [index, action] of output.recommended_actions.entries()) {
    if (!action.action.trim()) errors.push(`recommended_actions.${index}.action is required`);
    if (!action.reason.trim()) errors.push(`recommended_actions.${index}.reason is required`);
    if (!action.risk.trim()) errors.push(`recommended_actions.${index}.risk is required`);
    if (action.needs_human_approval !== true) errors.push(`recommended_actions.${index}.needs_human_approval must be true`);
    if (action.priority !== "P0" && action.priority !== "P1" && action.priority !== "P2") {
      errors.push(`recommended_actions.${index}.priority is invalid`);
    }
    if (output.confidence < MIN_ACTIONABLE_CONFIDENCE && action.priority === "P0") {
      errors.push(`recommended_actions.${index}.priority cannot be P0 when confidence is below ${MIN_ACTIONABLE_CONFIDENCE}`);
    }
  }
  const listingRewrite = output.artifacts?.listingRewrite;
  if (listingRewrite) {
    if (!listingRewrite.proposedTitle.trim()) errors.push("artifacts.listingRewrite.proposedTitle is required");
    if (listingRewrite.titleEvidence.length === 0 || listingRewrite.titleEvidence.some((item) => !item.trim())) {
      errors.push("artifacts.listingRewrite.titleEvidence must contain non-empty strings");
    }
    if (listingRewrite.bullets.length === 0 || listingRewrite.bullets.some((item) => !item.label.trim() || !item.copy.trim() || item.evidence.length === 0)) {
      errors.push("artifacts.listingRewrite.bullets must contain evidence-backed drafts");
    }
    if (listingRewrite.imageBriefs.length === 0 || listingRewrite.imageBriefs.some((item) => !item.slot.trim() || !item.objective.trim() || !item.evidence.trim())) {
      errors.push("artifacts.listingRewrite.imageBriefs must contain evidence-backed briefs");
    }
    if (listingRewrite.aPlusModules.length === 0 || listingRewrite.aPlusModules.some((item) => !item.module.trim() || !item.objective.trim() || !item.evidence.trim())) {
      errors.push("artifacts.listingRewrite.aPlusModules must contain evidence-backed modules");
    }
    if (listingRewrite.riskNotes.length === 0 || listingRewrite.riskNotes.some((item) => !item.trim())) {
      errors.push("artifacts.listingRewrite.riskNotes must contain non-empty strings");
    }
  }
  const reviewVoc = output.artifacts?.reviewVoc;
  if (reviewVoc) {
    if (reviewVoc.negativeSummary.length === 0 || reviewVoc.negativeSummary.some((item) => !item.trim())) {
      errors.push("artifacts.reviewVoc.negativeSummary must contain non-empty strings");
    }
    if (reviewVoc.supplierActions.length === 0 || reviewVoc.supplierActions.some((item) => !item.topic.trim() || !item.action.trim() || !item.evidence.trim())) {
      errors.push("artifacts.reviewVoc.supplierActions must contain evidence-backed actions");
    }
    if (reviewVoc.listingRecommendations.length === 0 || reviewVoc.listingRecommendations.some((item) => !item.trim())) {
      errors.push("artifacts.reviewVoc.listingRecommendations must contain non-empty strings");
    }
    if (reviewVoc.supportDrafts.length === 0 || reviewVoc.supportDrafts.some((item) => !item.scenario.trim() || !item.responseTemplate.trim() || !item.evidence.trim())) {
      errors.push("artifacts.reviewVoc.supportDrafts must contain evidence-backed drafts");
    }
    if (reviewVoc.productOpportunities.length === 0 || reviewVoc.productOpportunities.some((item) => !item.opportunity.trim() || !item.evidence.trim() || !item.validationNeeded.trim())) {
      errors.push("artifacts.reviewVoc.productOpportunities must contain evidence-backed opportunities");
    }
    if (reviewVoc.competitorPainComparison.length === 0 || reviewVoc.competitorPainComparison.some((item) => !item.topic.trim() || !item.ownProductEvidence.trim() || !item.conclusion.trim())) {
      errors.push("artifacts.reviewVoc.competitorPainComparison must contain explicit evidence boundaries");
    }
    if (reviewVoc.customerLanguage.some((item) => !item.phrase.trim() || !item.safeUse.trim() || !Number.isInteger(item.evidenceReviewId))) {
      errors.push("artifacts.reviewVoc.customerLanguage entries must reference review evidence");
    }
    if (reviewVoc.riskNotes.length === 0 || reviewVoc.riskNotes.some((item) => !item.trim())) {
      errors.push("artifacts.reviewVoc.riskNotes must contain non-empty strings");
    }
  }
  const adsOptimization = output.artifacts?.adsOptimization;
  if (adsOptimization) {
    if (!adsOptimization.evidenceDate.trim()) errors.push("artifacts.adsOptimization.evidenceDate is required");
    if (adsOptimization.wasteCandidates.some((item) => !item.campaign.trim() || !item.target.trim() || !item.reason.trim() || item.evidence.length === 0)) {
      errors.push("artifacts.adsOptimization.wasteCandidates must contain evidence-backed candidates");
    }
    if (adsOptimization.negativeKeywordSuggestions.some((item) => !item.term.trim() || !item.campaign.trim() || !item.reason.trim() || item.evidence.length === 0)) {
      errors.push("artifacts.adsOptimization.negativeKeywordSuggestions must contain evidence-backed suggestions");
    }
    if (adsOptimization.bidAdjustments.some((item) => !item.target.trim() || !item.campaign.trim() || !item.reason.trim() || item.evidence.length === 0)) {
      errors.push("artifacts.adsOptimization.bidAdjustments must contain evidence-backed adjustments");
    }
    if (adsOptimization.budgetAdjustments.some((item) => !item.campaign.trim() || !item.reason.trim() || item.guardrails.length === 0)) {
      errors.push("artifacts.adsOptimization.budgetAdjustments must contain guarded adjustments");
    }
    if (adsOptimization.scaleCandidates.some((item) => !item.campaign.trim() || !item.target.trim() || !item.recommendation.trim() || item.evidence.length === 0)) {
      errors.push("artifacts.adsOptimization.scaleCandidates must contain evidence-backed candidates");
    }
    if (adsOptimization.dataGaps.length === 0 || adsOptimization.dataGaps.some((item) => !item.trim())) {
      errors.push("artifacts.adsOptimization.dataGaps must contain non-empty strings");
    }
    if (adsOptimization.riskNotes.length === 0 || adsOptimization.riskNotes.some((item) => !item.trim())) {
      errors.push("artifacts.adsOptimization.riskNotes must contain non-empty strings");
    }
  }
  return errors;
}
