/**
 * Agent OS domain contracts.
 *
 * This module is intentionally self-contained. It models the first Goal →
 * Memory → Decision → Workflow → Action slice without coupling shared types
 * to an API, persistence layer, or model provider.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const goalTypes = [
  "sales",
  "profit",
  "advertising",
  "bsr",
  "keyword",
  "inventory",
  "review",
  "launch",
] as const;
export type GoalType = (typeof goalTypes)[number];

export const goalMetrics = [
  "revenue",
  "gross_margin",
  "acos",
  "tacos",
  "bsr_rank",
  "organic_rank",
  "inventory_coverage_days",
  "rating",
] as const;
export type GoalMetric = (typeof goalMetrics)[number];

export const goalPriorities = ["P0", "P1", "P2", "P3"] as const;
export type GoalPriority = (typeof goalPriorities)[number];

export const goalStatuses = ["draft", "active", "achieved", "paused", "expired", "cancelled"] as const;
export type GoalStatus = (typeof goalStatuses)[number];

export const constraintMetrics = [
  "gross_margin",
  "acos",
  "tacos",
  "inventory_coverage_days",
  "price",
  "ad_spend",
  "bsr_rank",
  "organic_rank",
] as const;
export type ConstraintMetric = (typeof constraintMetrics)[number];

export const constraintOperators = ["gte", "lte", "eq", "between"] as const;
export type ConstraintOperator = (typeof constraintOperators)[number];

export const constraintUnits = ["currency", "percent", "days", "rank", "count", "score"] as const;
export type ConstraintUnit = (typeof constraintUnits)[number];

export interface GoalConstraint {
  metric: ConstraintMetric;
  operator: ConstraintOperator;
  value: number;
  upperValue?: number;
  unit: ConstraintUnit;
}

export type Constraints = readonly GoalConstraint[];
export type GoalConstraints = Constraints;

export interface Goal {
  id: number;
  organizationId: number;
  storeId: number | null;
  skuId: number | null;
  type: GoalType;
  metric: GoalMetric;
  targetValue: number;
  currentValue: number | null;
  deadline: string | null;
  priority: GoalPriority;
  status: GoalStatus;
  constraints: Constraints;
}

export const memoryScopes = ["sku", "promotion", "listing", "competitor", "decision", "organization"] as const;
export type MemoryScope = (typeof memoryScopes)[number];

export const memoryEntryKinds = ["observation", "decision", "outcome", "pattern", "learning"] as const;
export type MemoryEntryKind = (typeof memoryEntryKinds)[number];

export type Confidence = number;
export const confidenceLevels = ["high", "medium", "low"] as const;
export type ConfidenceLevel = (typeof confidenceLevels)[number];

export const CONFIDENCE_HIGH_MIN = 0.9;
export const CONFIDENCE_MEDIUM_MIN = 0.7;

export interface ConfidenceAssessment {
  score: Confidence;
  level: ConfidenceLevel;
  automaticExecutionEligible: boolean;
}

export interface EvidenceItem {
  id: string;
  source: string;
  summary: string;
  observedAt: string;
  metadata?: JsonObject;
}

export type Evidence = string | EvidenceItem;

export interface MemoryEntry {
  id: number;
  organizationId: number;
  scope: MemoryScope;
  kind: MemoryEntryKind;
  subjectId: string | null;
  context: JsonObject;
  action?: string | null;
  expectedResult?: JsonValue | null;
  actualResult?: JsonValue | null;
  conclusion?: string | null;
  confidence: Confidence;
  tags?: string[];
  createdAt: string;
}

export const actionRiskLevels = ["low", "medium", "high"] as const;
export type ActionRiskLevel = (typeof actionRiskLevels)[number];

export interface DecisionOption {
  id: string;
  label: string;
  rationale: string;
  expectedImpact: JsonValue | null;
  riskLevel: ActionRiskLevel;
}

export interface Decision {
  id: number;
  organizationId: number;
  issue: string;
  rootCauses: string[];
  evidence: Evidence[];
  options: DecisionOption[];
  recommendedOption: string | null;
  expectedImpact: JsonValue | null;
  risk: ActionRiskLevel;
  confidence: Confidence;
  constraints: Constraints;
  requiredApproval: boolean;
  createdAt: string;
}

export const workflowNodeTypes = [
  "TRIGGER",
  "DATA_FETCH",
  "DATA_VALIDATE",
  "AGENT_CALL",
  "TOOL_CALL",
  "CONDITION",
  "DECISION",
  "HUMAN_APPROVAL",
  "ACTION",
  "WAIT",
  "REVIEW",
  "MEMORY_WRITE",
  "NOTIFICATION",
] as const;
export type WorkflowNodeType = (typeof workflowNodeTypes)[number];

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  config: JsonObject;
  nextNodeIds: string[];
}

export const workflowTriggerTypes = ["manual", "event", "goal", "schedule", "recovery"] as const;
export type WorkflowTriggerType = (typeof workflowTriggerTypes)[number];

export const workflowRunStatuses = [
  "pending",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type WorkflowRunStatus = (typeof workflowRunStatuses)[number];

export const actionProposalTypes = [
  "RECOLLECT_DATA",
  "CREATE_TASK",
  "CREATE_REPORT",
  "SEND_FEISHU",
  "SEND_EMAIL",
  "EXPORT_CSV",
  "GENERATE_LISTING_DRAFT",
  "GENERATE_ADS_CHANGESET",
  "GENERATE_REPLENISHMENT_PLAN",
  "UPDATE_AD_BUDGET",
  "UPDATE_AD_BID",
  "PAUSE_CAMPAIGN",
  "ENABLE_CAMPAIGN",
  "UPDATE_PRICE",
  "UPDATE_COUPON",
  "UPDATE_LISTING",
  "CREATE_PROMOTION",
] as const;
export type ActionProposalType = (typeof actionProposalTypes)[number];

export const actionProposalStatuses = [
  "proposed",
  "approved",
  "executing",
  "succeeded",
  "verifying",
  "effective",
  "failed",
  "cancelled",
  "rollback",
  "ineffective",
] as const;
export type ActionProposalStatus = (typeof actionProposalStatuses)[number];

export interface ActionProposal {
  id: string;
  organizationId: number;
  type: ActionProposalType;
  targetType: string;
  targetId: string;
  currentValue: JsonValue | null;
  proposedValue: JsonValue | null;
  reason: string;
  evidence: Evidence[];
  expectedImpact: JsonValue | null;
  riskLevel: ActionRiskLevel;
  confidence: Confidence;
  requiresApproval: boolean;
  status: ActionProposalStatus;
  idempotencyKey: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  triggerType: WorkflowTriggerType;
  triggerSource: string;
  status: WorkflowRunStatus;
  startedAt: string;
  completedAt: string | null;
  currentNode: string | null;
  evidence: Evidence[];
  plan: string[];
  actions: ActionProposal[];
  result: JsonValue | null;
}

export interface AutoExecutionDecision {
  allowed: boolean;
  level: ConfidenceLevel;
  reason: "low_confidence" | "approval_required" | "risk_requires_approval" | "eligible";
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function isConfidence(value: unknown): value is Confidence {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function classifyConfidence(score: Confidence): ConfidenceLevel {
  if (!isConfidence(score)) {
    throw new RangeError("confidence must be a finite number between 0 and 1");
  }
  if (score >= CONFIDENCE_HIGH_MIN) return "high";
  if (score >= CONFIDENCE_MEDIUM_MIN) return "medium";
  return "low";
}

export function assessConfidence(score: Confidence): ConfidenceAssessment {
  const level = classifyConfidence(score);
  return {
    score,
    level,
    automaticExecutionEligible: level !== "low",
  };
}

export function evaluateAutoExecution(
  confidence: Confidence,
  riskLevel: ActionRiskLevel,
  requiresApproval: boolean,
): AutoExecutionDecision {
  const level = classifyConfidence(confidence);
  if (level === "low") return { allowed: false, level, reason: "low_confidence" };
  if (requiresApproval) return { allowed: false, level, reason: "approval_required" };
  if (riskLevel !== "low") return { allowed: false, level, reason: "risk_requires_approval" };
  return { allowed: true, level, reason: "eligible" };
}

export function canAutoExecute(
  confidence: Confidence,
  riskLevel: ActionRiskLevel,
  requiresApproval: boolean,
): boolean {
  return evaluateAutoExecution(confidence, riskLevel, requiresApproval).allowed;
}

export function validateGoal(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid("goal must be an object");
  requirePositiveInteger(value.id, "id", errors);
  requirePositiveInteger(value.organizationId, "organizationId", errors);
  requireNullablePositiveInteger(value.storeId, "storeId", errors);
  requireNullablePositiveInteger(value.skuId, "skuId", errors);
  requireOneOf(value.type, goalTypes, "type", errors);
  requireOneOf(value.metric, goalMetrics, "metric", errors);
  requireFiniteNumber(value.targetValue, "targetValue", errors);
  requireNullableFiniteNumber(value.currentValue, "currentValue", errors);
  requireNullableString(value.deadline, "deadline", errors);
  requireOneOf(value.priority, goalPriorities, "priority", errors);
  requireOneOf(value.status, goalStatuses, "status", errors);
  errors.push(...validateConstraints(value.constraints).errors);
  return result(errors);
}

export function validateMemoryEntry(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid("memory entry must be an object");
  requirePositiveInteger(value.id, "id", errors);
  requirePositiveInteger(value.organizationId, "organizationId", errors);
  requireOneOf(value.scope, memoryScopes, "scope", errors);
  requireOneOf(value.kind, memoryEntryKinds, "kind", errors);
  requireNullableString(value.subjectId, "subjectId", errors);
  requireJsonObject(value.context, "context", errors);
  requireOptionalNullableString(value.action, "action", errors);
  requireOptionalJsonValue(value.expectedResult, "expectedResult", errors);
  requireOptionalJsonValue(value.actualResult, "actualResult", errors);
  requireOptionalNullableString(value.conclusion, "conclusion", errors);
  requireConfidence(value.confidence, "confidence", errors);
  requireOptionalStringArray(value.tags, "tags", errors);
  requireNonEmptyString(value.createdAt, "createdAt", errors);
  return result(errors);
}

export function validateDecision(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid("decision must be an object");
  requirePositiveInteger(value.id, "id", errors);
  requirePositiveInteger(value.organizationId, "organizationId", errors);
  requireNonEmptyString(value.issue, "issue", errors);
  requireStringArray(value.rootCauses, "rootCauses", errors);
  requireEvidenceArray(value.evidence, "evidence", errors);
  requireDecisionOptions(value.options, errors);
  requireNullableString(value.recommendedOption, "recommendedOption", errors);
  requireNullableJsonValue(value.expectedImpact, "expectedImpact", errors);
  requireOneOf(value.risk, actionRiskLevels, "risk", errors);
  requireConfidence(value.confidence, "confidence", errors);
  errors.push(...validateConstraints(value.constraints).errors);
  requireBoolean(value.requiredApproval, "requiredApproval", errors);
  requireNonEmptyString(value.createdAt, "createdAt", errors);
  if (isConfidence(value.confidence) && isActionRiskLevel(value.risk) && typeof value.requiredApproval === "boolean") {
    if (!value.requiredApproval && !canAutoExecute(value.confidence, value.risk, false)) {
      errors.push("requiredApproval must be true for this confidence and risk");
    }
  }
  return result(errors);
}

export function validateWorkflowNode(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid("workflow node must be an object");
  requireNonEmptyString(value.id, "id", errors);
  requireOneOf(value.type, workflowNodeTypes, "type", errors);
  requireNonEmptyString(value.name, "name", errors);
  requireJsonObject(value.config, "config", errors);
  requireStringArray(value.nextNodeIds, "nextNodeIds", errors);
  return result(errors);
}

export function validateWorkflowRun(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid("workflow run must be an object");
  requireNonEmptyString(value.id, "id", errors);
  requireNonEmptyString(value.workflowId, "workflowId", errors);
  requireOneOf(value.triggerType, workflowTriggerTypes, "triggerType", errors);
  requireNonEmptyString(value.triggerSource, "triggerSource", errors);
  requireOneOf(value.status, workflowRunStatuses, "status", errors);
  requireNonEmptyString(value.startedAt, "startedAt", errors);
  requireNullableString(value.completedAt, "completedAt", errors);
  requireNullableString(value.currentNode, "currentNode", errors);
  requireEvidenceArray(value.evidence, "evidence", errors);
  requireStringArray(value.plan, "plan", errors);
  requireActionArray(value.actions, errors);
  requireNullableJsonValue(value.result, "result", errors);
  return result(errors);
}

export function validateActionProposal(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return invalid("action proposal must be an object");
  requireNonEmptyString(value.id, "id", errors);
  requirePositiveInteger(value.organizationId, "organizationId", errors);
  requireOneOf(value.type, actionProposalTypes, "type", errors);
  requireNonEmptyString(value.targetType, "targetType", errors);
  requireNonEmptyString(value.targetId, "targetId", errors);
  requireNullableJsonValue(value.currentValue, "currentValue", errors);
  requireNullableJsonValue(value.proposedValue, "proposedValue", errors);
  requireNonEmptyString(value.reason, "reason", errors);
  requireEvidenceArray(value.evidence, "evidence", errors);
  requireNullableJsonValue(value.expectedImpact, "expectedImpact", errors);
  requireOneOf(value.riskLevel, actionRiskLevels, "riskLevel", errors);
  requireConfidence(value.confidence, "confidence", errors);
  requireBoolean(value.requiresApproval, "requiresApproval", errors);
  requireOneOf(value.status, actionProposalStatuses, "status", errors);
  requireNonEmptyString(value.idempotencyKey, "idempotencyKey", errors);
  if (isConfidence(value.confidence) && isActionRiskLevel(value.riskLevel) && typeof value.requiresApproval === "boolean") {
    if (!value.requiresApproval && !canAutoExecute(value.confidence, value.riskLevel, false)) {
      errors.push("requiresApproval must be true for this confidence and risk");
    }
  }
  return result(errors);
}

export function isGoal(value: unknown): value is Goal {
  return validateGoal(value).valid;
}

export function isMemoryEntry(value: unknown): value is MemoryEntry {
  return validateMemoryEntry(value).valid;
}

export function isDecision(value: unknown): value is Decision {
  return validateDecision(value).valid;
}

export function isWorkflowNode(value: unknown): value is WorkflowNode {
  return validateWorkflowNode(value).valid;
}

export function isWorkflowRun(value: unknown): value is WorkflowRun {
  return validateWorkflowRun(value).valid;
}

export function isActionProposal(value: unknown): value is ActionProposal {
  return validateActionProposal(value).valid;
}

function validateConstraints(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!Array.isArray(value)) return invalid("constraints must be an array");
  value.forEach((constraint, index) => {
    if (!isRecord(constraint)) {
      errors.push(`constraints[${index}] must be an object`);
      return;
    }
    requireOneOf(constraint.metric, constraintMetrics, `constraints[${index}].metric`, errors);
    requireOneOf(constraint.operator, constraintOperators, `constraints[${index}].operator`, errors);
    requireFiniteNumber(constraint.value, `constraints[${index}].value`, errors);
    if (constraint.upperValue !== undefined) {
      requireFiniteNumber(constraint.upperValue, `constraints[${index}].upperValue`, errors);
    }
    requireOneOf(constraint.unit, constraintUnits, `constraints[${index}].unit`, errors);
    if (constraint.operator === "between" && typeof constraint.upperValue !== "number") {
      errors.push(`constraints[${index}].upperValue is required for between`);
    }
  });
  return result(errors);
}

function requireDecisionOptions(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("options must be an array");
    return;
  }
  value.forEach((option, index) => {
    if (!isRecord(option)) {
      errors.push(`options[${index}] must be an object`);
      return;
    }
    requireNonEmptyString(option.id, `options[${index}].id`, errors);
    requireNonEmptyString(option.label, `options[${index}].label`, errors);
    requireNonEmptyString(option.rationale, `options[${index}].rationale`, errors);
    requireNullableJsonValue(option.expectedImpact, `options[${index}].expectedImpact`, errors);
    requireOneOf(option.riskLevel, actionRiskLevels, `options[${index}].riskLevel`, errors);
  });
}

function requireActionArray(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("actions must be an array");
    return;
  }
  value.forEach((action, index) => {
    const validation = validateActionProposal(action);
    errors.push(...validation.errors.map((error) => `actions[${index}].${error}`));
  });
}

function requireEvidenceArray(value: unknown, field: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return;
  }
  value.forEach((evidence, index) => {
    if (typeof evidence === "string") {
      if (evidence.trim().length === 0) errors.push(`${field}[${index}] must not be empty`);
      return;
    }
    if (!isRecord(evidence)) {
      errors.push(`${field}[${index}] must be a string or evidence object`);
      return;
    }
    requireNonEmptyString(evidence.id, `${field}[${index}].id`, errors);
    requireNonEmptyString(evidence.source, `${field}[${index}].source`, errors);
    requireNonEmptyString(evidence.summary, `${field}[${index}].summary`, errors);
    requireNonEmptyString(evidence.observedAt, `${field}[${index}].observedAt`, errors);
    if (evidence.metadata !== undefined) requireJsonObject(evidence.metadata, `${field}[${index}].metadata`, errors);
  });
}

function isActionRiskLevel(value: unknown): value is ActionRiskLevel {
  return isOneOf(value, actionRiskLevels);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isOneOf<const T extends readonly string[]>(value: unknown, choices: T): value is T[number] {
  return typeof value === "string" && choices.includes(value);
}

function requireOneOf<const T extends readonly string[]>(value: unknown, choices: T, field: string, errors: string[]): void {
  if (!isOneOf(value, choices)) errors.push(`${field} is invalid`);
}

function requireConfidence(value: unknown, field: string, errors: string[]): void {
  if (!isConfidence(value)) errors.push(`${field} must be between 0 and 1`);
}

function requireBoolean(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "boolean") errors.push(`${field} must be a boolean`);
}

function requireFiniteNumber(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${field} must be a finite number`);
}

function requireNullableFiniteNumber(value: unknown, field: string, errors: string[]): void {
  if (value !== null) requireFiniteNumber(value, field, errors);
}

function requirePositiveInteger(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) errors.push(`${field} must be a positive integer`);
}

function requireNullablePositiveInteger(value: unknown, field: string, errors: string[]): void {
  if (value !== null) requirePositiveInteger(value, field, errors);
}

function requireNonEmptyString(value: unknown, field: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim().length === 0) errors.push(`${field} must be a non-empty string`);
}

function requireNullableString(value: unknown, field: string, errors: string[]): void {
  if (value !== null) requireNonEmptyString(value, field, errors);
}

function requireOptionalNullableString(value: unknown, field: string, errors: string[]): void {
  if (value !== undefined && value !== null) requireNonEmptyString(value, field, errors);
}

function requireStringArray(value: unknown, field: string, errors: string[]): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) errors.push(`${field} must be an array of strings`);
}

function requireOptionalStringArray(value: unknown, field: string, errors: string[]): void {
  if (value !== undefined) requireStringArray(value, field, errors);
}

function requireJsonObject(value: unknown, field: string, errors: string[]): void {
  if (!isRecord(value) || !isJsonValue(value)) errors.push(`${field} must be a JSON object`);
}

function requireJsonValue(value: unknown, field: string, errors: string[]): void {
  if (!isJsonValue(value)) errors.push(`${field} must be a JSON value`);
}

function requireNullableJsonValue(value: unknown, field: string, errors: string[]): void {
  if (value !== null) requireJsonValue(value, field, errors);
}

function requireOptionalJsonValue(value: unknown, field: string, errors: string[]): void {
  if (value !== undefined) requireNullableJsonValue(value, field, errors);
}

function result(errors: string[]): ValidationResult {
  return { valid: errors.length === 0, errors };
}

function invalid(error: string): ValidationResult {
  return { valid: false, errors: [error] };
}
