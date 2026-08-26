import type { DataQualityReport } from "./data-quality-engine.js";
import {
  validateOpportunity,
  type Opportunity,
  type OpportunityType,
  type ConstraintEvaluation,
  type IntelligenceApprovalDecision,
} from "@amazon-monitor/shared";
import {
  evaluateIntelligenceConstraints,
  intelligenceApproval,
  intelligenceScore,
  isEvidenceAllowed,
} from "./intelligence-engine-utils.js";

export interface OpportunityEvaluationInput {
  opportunity: Opportunity;
  dataQuality: DataQualityReport;
}

export type OpportunityEvaluationReason =
  | "eligible"
  | "invalid"
  | "evidence_blocked"
  | "low_confidence"
  | "constraint_conflict";

export interface OpportunityEvaluation {
  opportunity: Opportunity;
  valid: boolean;
  score: number;
  constraints: ConstraintEvaluation;
  approval: IntelligenceApprovalDecision;
  automaticExecutionEligible: boolean;
  reason: OpportunityEvaluationReason;
  reasons: readonly string[];
}

export function evaluateOpportunity(input: OpportunityEvaluationInput): OpportunityEvaluation {
  const opportunity = input.opportunity;
  const validation = validateOpportunity(opportunity);
  const constraints = evaluateIntelligenceConstraints(opportunity.constraints, opportunity.constraintValues);
  const approval = validation.valid
    ? intelligenceApproval(opportunity.confidence, opportunity.riskLevel)
    : intelligenceApproval(0, "high");
  const evidenceAllowed = isEvidenceAllowed(input.dataQuality.status);
  const reasons: string[] = [...validation.errors];
  if (!evidenceAllowed) reasons.push(`Evidence gate blocked by ${input.dataQuality.status}`);
  if (constraints.conflict) reasons.push("One or more business constraints conflict");
  if (validation.valid && opportunity.confidence < 0.7) reasons.push("Confidence is below the automatic execution threshold");
  const valid = validation.valid && evidenceAllowed && !constraints.conflict;
  const score = validation.valid ? intelligenceScore(
    opportunity.expectedImpact,
    opportunity.confidence,
    opportunity.executionEase,
    opportunity.risk,
    opportunity.marketPotential,
  ) : 0;
  const automaticExecutionEligible = valid && approval.automatic;
  const reason: OpportunityEvaluationReason = !validation.valid
    ? "invalid"
    : !evidenceAllowed
      ? "evidence_blocked"
      : constraints.conflict
        ? "constraint_conflict"
        : opportunity.confidence < 0.7
          ? "low_confidence"
          : "eligible";
  return { opportunity, valid, score, constraints, approval, automaticExecutionEligible, reason, reasons };
}

export function rankOpportunities(
  evaluations: readonly OpportunityEvaluation[],
): OpportunityEvaluation[] {
  return [...evaluations].sort((left, right) => (
    Number(right.automaticExecutionEligible) - Number(left.automaticExecutionEligible)
      || right.score - left.score
      || left.opportunity.id.localeCompare(right.opportunity.id)
  ));
}

export function opportunityTypeLabel(type: OpportunityType): string {
  return type.replaceAll("_", " ");
}
