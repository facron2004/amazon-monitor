import type { DataQualityReport } from "./data-quality-engine.js";
import {
  validateDecisionDraft,
  type ConstraintEvaluation,
  type DecisionDraft,
  type DecisionOptionDraft,
  type DecisionEvaluation,
  type RankedDecisionOption,
  type IntelligenceApprovalDecision,
} from "@amazon-monitor/shared";
import {
  evaluateIntelligenceConstraints,
  intelligenceApproval,
  intelligenceScore,
  isEvidenceAllowed,
} from "./intelligence-engine-utils.js";

export interface DecisionEvaluationInput {
  draft: DecisionDraft;
  dataQuality: DataQualityReport;
}

export function evaluateDecision(input: DecisionEvaluationInput): DecisionEvaluation {
  const draft = input.draft;
  const validation = validateDecisionDraft(draft);
  const baseConstraints = evaluateIntelligenceConstraints(draft.constraints, draft.constraintValues);
  const evidenceAllowed = isEvidenceAllowed(input.dataQuality.status);
  const rankedOptions = draft.options.map((option) => evaluateOption(option, draft, evidenceAllowed));
  rankedOptions.sort((left, right) => (
    Number(right.eligible) - Number(left.eligible)
      || right.score - left.score
      || left.option.id.localeCompare(right.option.id)
  ));
  const recommended = validation.valid && evidenceAllowed && !baseConstraints.conflict
    ? rankedOptions.find((option) => option.eligible) ?? null
    : null;
  const approval = recommended?.approval ?? blockedApproval(draft.confidence);
  const automaticExecutionEligible = Boolean(recommended?.eligible && approval.automatic);
  const reason = !validation.valid
    ? "invalid"
    : !evidenceAllowed
      ? "evidence_blocked"
      : baseConstraints.conflict
        ? "constraint_conflict"
        : !recommended
          ? "no_eligible_option"
          : approval.requiresApproval
            ? approval.confidenceLevel === "LOW" ? "low_confidence" : "approval_required"
            : "eligible";
  return {
    draft,
    rankedOptions,
    recommendedOption: recommended?.option.id ?? null,
    expectedImpact: recommended?.option.expectedImpact ?? null,
    risk: recommended?.option.riskLevel ?? null,
    confidence: recommended?.option.confidence ?? draft.confidence,
    constraints: baseConstraints,
    evidenceAllowed,
    requiredApproval: !recommended || approval.requiresApproval,
    automaticExecutionEligible,
    approval,
    reason,
  };
}

function evaluateOption(
  option: DecisionOptionDraft,
  draft: DecisionDraft,
  evidenceAllowed: boolean,
): RankedDecisionOption {
  const constraints = evaluateIntelligenceConstraints(
    [...draft.constraints, ...(option.constraints ?? [])],
    { ...draft.constraintValues, ...option.constraintValues },
  );
  const approval = intelligenceApproval(option.confidence, option.riskLevel);
  const eligible = evidenceAllowed && !constraints.conflict && option.confidence >= 0.7;
  const reasons: string[] = [];
  if (!evidenceAllowed) reasons.push("Evidence gate is blocked");
  if (constraints.conflict) reasons.push("Business constraint conflict");
  if (option.confidence < 0.7) reasons.push("Low confidence");
  if (approval.requiresApproval) reasons.push("Human approval is required");
  if (reasons.length === 0) reasons.push("Eligible option");
  return {
    option,
    score: intelligenceScore(option.expectedImpact, option.confidence, option.executionEase, option.risk),
    eligible,
    constraints,
    approval,
    reasons,
  };
}

function blockedApproval(confidence: number): IntelligenceApprovalDecision {
  const safeConfidence = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0;
  return intelligenceApproval(safeConfidence, "high");
}
