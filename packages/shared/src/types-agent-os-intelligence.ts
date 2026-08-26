import {
  actionRiskLevels,
  constraintMetrics,
  constraintOperators,
  type ActionRiskLevel,
  type ConstraintMetric,
  type Constraints,
  type Evidence,
} from "./types-agent-os.js";

/** The seven opportunity classes used by the intelligence slice. */
export const opportunityTypes = [
  "keyword",
  "competitor_weakness",
  "price_gap",
  "review_gap",
  "launch",
  "traffic",
  "promotion",
  "inventory",
] as const;
export type OpportunityType = (typeof opportunityTypes)[number];
export type IntelligenceOpportunityType = OpportunityType;

export const intelligenceConfidenceLevels = ["HIGH", "MEDIUM", "LOW"] as const;
export type IntelligenceConfidenceLevel = (typeof intelligenceConfidenceLevels)[number];

export type ConstraintValues = Partial<Record<ConstraintMetric, number>>;

export interface Opportunity {
  id: string;
  type: OpportunityType;
  title: string;
  targetId: string;
  marketPotential: number;
  expectedImpact: number;
  executionEase: number;
  /** Optional inverse of executionEase, accepted only as a consistency check. */
  executionDifficulty?: number;
  /** A non-zero unit-interval divisor used by the roadmap score formula. */
  risk: number;
  riskLevel: ActionRiskLevel;
  confidence: number;
  evidence: readonly Evidence[];
  constraints: Constraints;
  constraintValues?: ConstraintValues;
}

export interface ConstraintCheck {
  metric: ConstraintMetric;
  operator: (typeof constraintOperators)[number];
  expectedValue: number;
  upperValue: number | null;
  actualValue: number | null;
  satisfied: boolean;
  conflict: boolean;
  reason: string;
}

export interface ConstraintEvaluation {
  satisfied: boolean;
  conflict: boolean;
  checks: readonly ConstraintCheck[];
}

export type IntelligenceApprovalReason =
  | "low_confidence"
  | "approval_required"
  | "risk_requires_approval"
  | "eligible";

export interface IntelligenceApprovalDecision {
  automatic: boolean;
  requiresApproval: boolean;
  confidenceLevel: IntelligenceConfidenceLevel;
  reason: IntelligenceApprovalReason;
}

export interface DecisionOptionDraft {
  id: string;
  label: string;
  rationale: string;
  expectedImpact: number;
  executionEase: number;
  risk: number;
  riskLevel: ActionRiskLevel;
  confidence: number;
  constraints?: Constraints;
  constraintValues?: ConstraintValues;
}

export interface DecisionDraft {
  id?: string;
  issue: string;
  rootCauses: readonly string[];
  evidence: readonly Evidence[];
  options: readonly DecisionOptionDraft[];
  constraints: Constraints;
  constraintValues?: ConstraintValues;
  confidence: number;
}

export interface RankedDecisionOption {
  option: DecisionOptionDraft;
  score: number;
  eligible: boolean;
  constraints: ConstraintEvaluation;
  approval: IntelligenceApprovalDecision;
  reasons: readonly string[];
}

export type DecisionEvaluationReason =
  | "eligible"
  | "approval_required"
  | "low_confidence"
  | "constraint_conflict"
  | "evidence_blocked"
  | "no_eligible_option"
  | "invalid";

export interface DecisionEvaluation {
  draft: DecisionDraft;
  rankedOptions: readonly RankedDecisionOption[];
  recommendedOption: string | null;
  expectedImpact: number | null;
  risk: ActionRiskLevel | null;
  confidence: number;
  constraints: ConstraintEvaluation;
  evidenceAllowed: boolean;
  requiredApproval: boolean;
  automaticExecutionEligible: boolean;
  approval: IntelligenceApprovalDecision;
  reason: DecisionEvaluationReason;
}

export const experimentStatuses = ["PLANNED", "RUNNING", "OBSERVING", "COMPLETED", "CANCELLED"] as const;
export type ExperimentStatus = (typeof experimentStatuses)[number];
export type ExperimentDirection = "increase" | "decrease" | "maintain";

export interface Experiment {
  id: string;
  hypothesis: string;
  action: string;
  metric: string;
  expectedDirection: ExperimentDirection;
  expectedValue?: number | null;
  before: number | null;
  after: number | null;
  evidenceScore: number;
  observationDays: number;
  plannedObservationDays: number;
  confounders?: readonly string[];
  riskLevel: ActionRiskLevel;
  confidence: number;
  constraints: Constraints;
  constraintValues?: ConstraintValues;
  status: ExperimentStatus;
}

export const intelligenceOutcomeStatuses = ["EFFECTIVE", "INEFFECTIVE", "INCONCLUSIVE", "PENDING"] as const;
export type IntelligenceOutcomeStatus = (typeof intelligenceOutcomeStatuses)[number];

export const intelligenceAttributionTypes = ["DIRECT", "CORRELATED", "UNKNOWN"] as const;
export type IntelligenceAttribution = (typeof intelligenceAttributionTypes)[number];

export interface IntelligenceOutcome {
  experimentId: string;
  metric: string;
  status: IntelligenceOutcomeStatus;
  attribution: IntelligenceAttribution;
  before: number | null;
  after: number | null;
  delta: number | null;
  deltaPercent: number | null;
  observationDays: number;
  conclusion: string;
  confidence: number;
  confounders: readonly string[];
}

export type IntelligenceLearningAction = "REUSE" | "ADJUST" | "REJECT" | "CONTINUE_OBSERVING";

export interface IntelligenceLearning {
  kind: "learning";
  experimentId: string;
  conclusion: string;
  nextAction: IntelligenceLearningAction;
  confidence: number;
}

export interface ExperimentEvaluation {
  experiment: Experiment;
  outcome: IntelligenceOutcome;
  attribution: IntelligenceAttribution;
  learning: IntelligenceLearning;
  constraints: ConstraintEvaluation;
  approval: IntelligenceApprovalDecision;
  automaticExecutionEligible: boolean;
}

export interface IntelligenceValidationResult {
  valid: boolean;
  errors: readonly string[];
}

export function isIntelligenceUnitInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateOpportunity(value: unknown): IntelligenceValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid("opportunity must be an object");
  requireNonEmptyString(value.id, "id", errors);
  requireOneOf(value.type, opportunityTypes, "type", errors);
  requireNonEmptyString(value.title, "title", errors);
  requireNonEmptyString(value.targetId, "targetId", errors);
  requireUnitInterval(value.marketPotential, "marketPotential", errors);
  requireUnitInterval(value.expectedImpact, "expectedImpact", errors);
  requireUnitInterval(value.executionEase, "executionEase", errors);
  if (value.executionDifficulty !== undefined) {
    requireUnitInterval(value.executionDifficulty, "executionDifficulty", errors);
    if (isIntelligenceUnitInterval(value.executionEase) && isIntelligenceUnitInterval(value.executionDifficulty)
      && Math.abs(value.executionEase + value.executionDifficulty - 1) > 0.001) {
      errors.push("executionEase and executionDifficulty must sum to 1");
    }
  }
  requireRiskScore(value.risk, "risk", errors);
  requireOneOf(value.riskLevel, actionRiskLevels, "riskLevel", errors);
  requireUnitInterval(value.confidence, "confidence", errors);
  requireEvidence(value.evidence, "evidence", errors);
  errors.push(...validateConstraints(value.constraints, "constraints"));
  errors.push(...validateConstraintValues(value.constraintValues, "constraintValues"));
  return result(errors);
}

export function validateDecisionDraft(value: unknown): IntelligenceValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid("decision draft must be an object");
  if (value.id !== undefined) requireNonEmptyString(value.id, "id", errors);
  requireNonEmptyString(value.issue, "issue", errors);
  requireNonEmptyStringArray(value.rootCauses, "rootCauses", errors);
  requireEvidence(value.evidence, "evidence", errors);
  if (!Array.isArray(value.options) || value.options.length === 0) {
    errors.push("options must contain at least one option");
  } else {
    value.options.forEach((option, index) => validateDecisionOption(option, `options[${index}]`, errors));
  }
  errors.push(...validateConstraints(value.constraints, "constraints"));
  errors.push(...validateConstraintValues(value.constraintValues, "constraintValues"));
  requireUnitInterval(value.confidence, "confidence", errors);
  return result(errors);
}

export function validateExperiment(value: unknown): IntelligenceValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid("experiment must be an object");
  requireNonEmptyString(value.id, "id", errors);
  requireNonEmptyString(value.hypothesis, "hypothesis", errors);
  requireNonEmptyString(value.action, "action", errors);
  requireNonEmptyString(value.metric, "metric", errors);
  requireOneOf(value.expectedDirection, ["increase", "decrease", "maintain"] as const, "expectedDirection", errors);
  requireNullableFiniteNumber(value.expectedValue, "expectedValue", errors);
  requireNullableFiniteNumber(value.before, "before", errors);
  requireNullableFiniteNumber(value.after, "after", errors);
  requireUnitInterval(value.evidenceScore, "evidenceScore", errors);
  requireNonNegativeInteger(value.observationDays, "observationDays", errors);
  requirePositiveInteger(value.plannedObservationDays, "plannedObservationDays", errors);
  if (value.confounders !== undefined) requireStringArray(value.confounders, "confounders", errors);
  requireOneOf(value.riskLevel, actionRiskLevels, "riskLevel", errors);
  requireUnitInterval(value.confidence, "confidence", errors);
  errors.push(...validateConstraints(value.constraints, "constraints"));
  errors.push(...validateConstraintValues(value.constraintValues, "constraintValues"));
  requireOneOf(value.status, experimentStatuses, "status", errors);
  return result(errors);
}

function validateDecisionOption(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  requireNonEmptyString(value.id, `${path}.id`, errors);
  requireNonEmptyString(value.label, `${path}.label`, errors);
  requireNonEmptyString(value.rationale, `${path}.rationale`, errors);
  requireUnitInterval(value.expectedImpact, `${path}.expectedImpact`, errors);
  requireUnitInterval(value.executionEase, `${path}.executionEase`, errors);
  requireRiskScore(value.risk, `${path}.risk`, errors);
  requireOneOf(value.riskLevel, actionRiskLevels, `${path}.riskLevel`, errors);
  requireUnitInterval(value.confidence, `${path}.confidence`, errors);
  if (value.constraints !== undefined) errors.push(...validateConstraints(value.constraints, `${path}.constraints`));
  if (value.constraintValues !== undefined) errors.push(...validateConstraintValues(value.constraintValues, `${path}.constraintValues`));
}

function validateConstraints(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) return [`${path} must be an array`];
  const errors: string[] = [];
  value.forEach((constraint, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(constraint)) {
      errors.push(`${itemPath} must be an object`);
      return;
    }
    requireOneOf(constraint.metric, constraintMetrics, `${itemPath}.metric`, errors);
    requireOneOf(constraint.operator, constraintOperators, `${itemPath}.operator`, errors);
    requireFiniteNumber(constraint.value, `${itemPath}.value`, errors);
    if (constraint.operator === "between") {
      requireFiniteNumber(constraint.upperValue, `${itemPath}.upperValue`, errors);
    }
  });
  return errors;
}

function validateConstraintValues(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return [`${path} must be an object`];
  return Object.entries(value).flatMap(([key, item]) => (
    constraintMetrics.includes(key as ConstraintMetric) && typeof item === "number" && Number.isFinite(item)
      ? []
      : [`${path}.${key} must be a finite number for a supported metric`]
  ));
}

function requireEvidence(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) errors.push(`${path} must contain at least one evidence item`);
}

function requireNonEmptyString(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim().length === 0) errors.push(`${path} must be a non-empty string`);
}

function requireNonEmptyStringArray(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    errors.push(`${path} must contain non-empty strings`);
  }
}

function requireStringArray(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) errors.push(`${path} must contain strings`);
}

function requireUnitInterval(value: unknown, path: string, errors: string[]): void {
  if (!isIntelligenceUnitInterval(value)) errors.push(`${path} must be between 0 and 1`);
}

function requireRiskScore(value: unknown, path: string, errors: string[]): void {
  if (!isIntelligenceUnitInterval(value) || value === 0) errors.push(`${path} must be greater than 0 and at most 1`);
}

function requireFiniteNumber(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${path} must be a finite number`);
}

function requireNullableFiniteNumber(value: unknown, path: string, errors: string[]): void {
  if (value !== null && value !== undefined) requireFiniteNumber(value, path, errors);
}

function requireNonNegativeInteger(value: unknown, path: string, errors: string[]): void {
  if (!Number.isInteger(value) || (value as number) < 0) errors.push(`${path} must be a non-negative integer`);
}

function requirePositiveInteger(value: unknown, path: string, errors: string[]): void {
  if (!Number.isInteger(value) || (value as number) < 1) errors.push(`${path} must be a positive integer`);
}

function requireOneOf<T extends string>(value: unknown, values: readonly T[], path: string, errors: string[]): void {
  if (typeof value !== "string" || !values.includes(value as T)) errors.push(`${path} must be one of ${values.join(", ")}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(error: string): IntelligenceValidationResult {
  return { valid: false, errors: [error] };
}

function result(errors: readonly string[]): IntelligenceValidationResult {
  return { valid: errors.length === 0, errors };
}
