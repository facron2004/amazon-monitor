import type { JsonValue } from "@amazon-monitor/shared";
import { clearRequestCache, request } from "./api-base";

export type AgentOsGoalStatus = "ACTIVE" | "PAUSED" | "ACHIEVED" | "FAILED" | "CANCELLED";
export type AgentOsWorkflowStatus = "PENDING" | "RUNNING" | "WAITING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED";
export type AgentOsActionStatus =
  | "PROPOSED"
  | "APPROVED"
  | "EXECUTING"
  | "SUCCEEDED"
  | "VERIFYING"
  | "EFFECTIVE"
  | "FAILED"
  | "CANCELLED"
  | "ROLLBACK"
  | "INEFFECTIVE";
export type AgentOsRiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type AgentOsOpportunityStatus =
  | "IDENTIFIED"
  | "VALIDATING"
  | "READY"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "ARCHIVED";
export type AgentOsDecisionStatus =
  | "PROPOSED"
  | "REVIEWING"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "COMPLETED"
  | "CANCELLED";
export type AgentOsExperimentStatus = "DRAFT" | "RUNNING" | "OBSERVING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type AgentOsDataQualityStatus = "TRUSTED" | "PARTIAL" | "STALE" | "INVALID";
export type AgentOsDataQualityCollectionStatus = "success" | "partial" | "running" | "failed" | "missing";
export type AgentOsSignalType = "RANKING_JUMP";
export type AgentOsSignalSeverity = "HIGH" | "MEDIUM" | "LOW";
export type AgentOsSignalStatus = "NEW" | "INVESTIGATING" | "ACTIONED" | "IGNORED";

export interface AgentOsGoal {
  id: number;
  type: string;
  metric: string;
  targetValue: JsonValue;
  currentValue: JsonValue | null;
  deadline: string | null;
  priority: number;
  status: AgentOsGoalStatus;
  constraints: Record<string, JsonValue>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentOsMemoryEntry {
  id: number;
  memoryType: string;
  subjectType: string | null;
  subjectId: string | number | null;
  title: string | null;
  content: unknown;
  tags: string[];
  confidence: number | null;
  sourceWorkflowRunId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentOsWorkflowRun {
  id: number;
  workflowId: string;
  triggerType: string;
  triggerSource: string | null;
  status: AgentOsWorkflowStatus;
  startedAt: string | null;
  completedAt: string | null;
  currentNode: string | null;
  context: JsonValue;
  evidence: JsonValue | null;
  plan: JsonValue | null;
  actions: JsonValue | null;
  result: JsonValue | null;
  snapshot: JsonValue | null;
  errorMessage: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentOsActionProposal {
  id: number;
  workflowRunId: number | null;
  goalId: number | null;
  type: string;
  targetType: string;
  targetId: string | number | null;
  currentValue: JsonValue | null;
  proposedValue: JsonValue;
  reason: string;
  evidence: JsonValue;
  expectedImpact: JsonValue | null;
  riskLevel: AgentOsRiskLevel;
  requiresApproval: boolean;
  status: AgentOsActionStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentOsSignal {
  id: string;
  organizationId: number;
  type: AgentOsSignalType;
  entityType: "ASIN";
  entityId: string;
  before: number | null;
  after: number | null;
  change: number | null;
  severity: AgentOsSignalSeverity;
  detectedAt: string;
  status: AgentOsSignalStatus;
  title: string;
  summary: string;
  suggestedAction: string;
  evidence: {
    sourceEventId: string;
    sourceEventType: string;
    eventDate: string;
    observedAt: string;
    marketplace: string | null;
    categoryName: string | null;
    evidenceItems: string[];
  };
}

export interface AgentOsSignalInvestigationResponse {
  signal: AgentOsSignal;
  workflow: {
    run: AgentOsWorkflowRun;
    actionProposals: AgentOsActionProposal[];
    memories: AgentOsMemoryEntry[];
  };
}

interface AgentOsIntelligenceAssociations {
  targetType: string | null;
  targetId: string | number | null;
  goalId: number | null;
  sourceType: string | null;
  sourceId: string | null;
  sourceWorkflowRunId: number | null;
  sourceActionProposalId: number | null;
}

export interface AgentOsOpportunity extends AgentOsIntelligenceAssociations {
  id: number;
  type: string;
  title: string;
  summary: string | null;
  signal: JsonValue | null;
  score: number | null;
  expectedImpact: JsonValue | null;
  risk: JsonValue | null;
  confidence: number | null;
  status: AgentOsOpportunityStatus;
  details: JsonValue | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentOsDecision extends AgentOsIntelligenceAssociations {
  id: number;
  issue: string;
  rootCauses: JsonValue;
  evidence: JsonValue;
  options: JsonValue;
  recommendedOption: JsonValue | null;
  expectedImpact: JsonValue | null;
  risk: JsonValue | null;
  confidence: number | null;
  constraints: JsonValue | null;
  requiredApproval: boolean;
  sourceOpportunityId: number | null;
  status: AgentOsDecisionStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentOsExperiment extends AgentOsIntelligenceAssociations {
  id: number;
  title: string;
  hypothesis: JsonValue;
  action: JsonValue | null;
  observation: JsonValue | null;
  result: JsonValue | null;
  learning: JsonValue | null;
  before: JsonValue | null;
  after: JsonValue | null;
  delta: JsonValue | null;
  confidence: number | null;
  attribution: string | null;
  observationWindowDays: number | null;
  sourceOpportunityId: number | null;
  sourceDecisionId: number | null;
  status: AgentOsExperimentStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentOsDataQualitySourceCheck {
  source: string;
  ageHours?: number | null;
  maxAgeHours?: number | null;
  completeness?: number | null;
  collectionStatus?: AgentOsDataQualityCollectionStatus;
  mapped?: boolean | null;
  outlier?: boolean | null;
  apiError?: string | null;
}

export interface AgentOsDataQualityReport {
  status: AgentOsDataQualityStatus;
  score: number;
  checkedAt: string;
  staleSources: string[];
  missingSources: string[];
  invalidSources: string[];
  warnings: string[];
  refreshRequired: boolean;
}

export interface AgentOsEvidenceGate {
  allowed: boolean;
  action: "ANALYZE" | "REFRESH" | "STOP";
  reason: string;
  status: AgentOsDataQualityStatus;
}

export interface AgentOsDataQualityEvidence {
  checkedAt: string;
  sourceChecks: AgentOsDataQualitySourceCheck[];
  report: AgentOsDataQualityReport;
  evidenceGate: AgentOsEvidenceGate;
  refreshRequired: boolean;
  evidenceRefs: Array<{
    id: string;
    source: string;
    status: AgentOsDataQualityStatus;
    observedAt: string;
  }>;
}

export type AgentOsActionExecutionStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "UNCERTAIN" | "VERIFIED";

export interface AgentOsActionExecution {
  id: number;
  organizationId: number;
  actionProposalId: number;
  idempotencyKey: string;
  executor: string;
  status: AgentOsActionExecutionStatus;
  result: JsonValue | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  version: number;
}

export interface AgentOsActionExecutionResponse {
  proposal: AgentOsActionProposal;
  execution: AgentOsActionExecution;
}

export interface AgentOsActionVerificationResponse extends AgentOsActionExecutionResponse {
  status: "EFFECTIVE" | "INEFFECTIVE" | "PENDING";
}

interface ListOptions {
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

interface DataQualityOptions {
  checkedAt?: string;
  maxAgeHours?: number;
  signal?: AbortSignal;
}

function queryString(values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, signal ? { signal } : undefined);
}

function mutate<T>(
  path: string,
  method: "PATCH" | "POST",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  agentOsApi.clearCache();
  return request<T>(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
}

export const agentOsApi = {
  listSignals: (options: ListOptions = {}) => read<AgentOsSignal[]>(
    `/agent-os/signals${queryString({ limit: options.limit, offset: options.offset })}`,
    options.signal,
  ),
  listGoals: (options: ListOptions = {}) => read<AgentOsGoal[]>(
    `/agent-os/goals${queryString({ limit: options.limit, offset: options.offset })}`,
    options.signal,
  ),
  listMemory: (options: ListOptions = {}) => read<AgentOsMemoryEntry[]>(
    `/agent-os/memory${queryString({ limit: options.limit, offset: options.offset })}`,
    options.signal,
  ),
  listWorkflowRuns: (options: ListOptions = {}) => read<AgentOsWorkflowRun[]>(
    `/agent-os/workflows/runs${queryString({ limit: options.limit, offset: options.offset })}`,
    options.signal,
  ),
  listActions: (options: ListOptions = {}) => read<AgentOsActionProposal[]>(
    `/agent-os/actions${queryString({ limit: options.limit, offset: options.offset })}`,
    options.signal,
  ),
  listOpportunities: (options: ListOptions = {}) => read<AgentOsOpportunity[]>(
    `/agent-os/opportunities${queryString({ limit: options.limit, offset: options.offset })}`,
    options.signal,
  ),
  listDecisions: (options: ListOptions = {}) => read<AgentOsDecision[]>(
    `/agent-os/decisions${queryString({ limit: options.limit, offset: options.offset })}`,
    options.signal,
  ),
  listExperiments: (options: ListOptions = {}) => read<AgentOsExperiment[]>(
    `/agent-os/experiments${queryString({ limit: options.limit, offset: options.offset })}`,
    options.signal,
  ),
  investigateSignal: (id: string, idempotencyKey?: string, signal?: AbortSignal) => mutate<AgentOsSignalInvestigationResponse>(
    `/agent-os/signals/${encodeURIComponent(id)}/investigate`,
    "POST",
    idempotencyKey ? { idempotencyKey } : undefined,
    signal,
  ),
  updateSignalStatus: (id: string, status: AgentOsSignalStatus, signal?: AbortSignal) => mutate<AgentOsSignal>(
    `/agent-os/signals/${encodeURIComponent(id)}`,
    "PATCH",
    { status },
    signal,
  ),
  getDataQuality: (options: DataQualityOptions = {}) => read<AgentOsDataQualityEvidence>(
    `/agent-os/data-quality${queryString({
      checkedAt: options.checkedAt,
      maxAgeHours: options.maxAgeHours,
    })}`,
    options.signal,
  ),
  approveAction: (id: number, expectedVersion: number, signal?: AbortSignal) => mutate<AgentOsActionProposal>(
    `/agent-os/actions/${id}`,
    "PATCH",
    { status: "APPROVED", expectedVersion },
    signal,
  ),
  executeAction: (id: number, signal?: AbortSignal) => mutate<AgentOsActionExecutionResponse>(
    `/agent-os/actions/${id}/execute`,
    "POST",
    undefined,
    signal,
  ),
  verifyAction: (id: number, signal?: AbortSignal) => mutate<AgentOsActionVerificationResponse>(
    `/agent-os/actions/${id}/verify`,
    "POST",
    undefined,
    signal,
  ),
  clearCache: () => clearRequestCache("/agent-os"),
};
