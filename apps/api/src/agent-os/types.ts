export type JsonPrimitive = string | number | boolean | null;

export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type AgentOsResourceId = string | number;

export type GoalStatus =
  | "ACTIVE"
  | "PAUSED"
  | "ACHIEVED"
  | "FAILED"
  | "CANCELLED";

export interface Goal {
  id: number;
  organizationId: number;
  storeId: AgentOsResourceId | null;
  skuId: AgentOsResourceId | null;
  type: string;
  metric: string;
  targetValue: JsonValue;
  currentValue: JsonValue | null;
  deadline: string | null;
  priority: number;
  status: GoalStatus;
  constraints: JsonObject;
  idempotencyKey: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalInput {
  organizationId: number;
  storeId?: AgentOsResourceId | null;
  skuId?: AgentOsResourceId | null;
  type: string;
  metric: string;
  targetValue: JsonValue;
  currentValue?: JsonValue | null;
  deadline?: string | null;
  priority?: number;
  status?: GoalStatus;
  constraints?: JsonObject;
  idempotencyKey?: string;
}

export interface GoalListFilter {
  organizationId: number;
  type?: string;
  status?: GoalStatus;
  storeId?: AgentOsResourceId | null;
  skuId?: AgentOsResourceId | null;
  limit?: number;
  offset?: number;
}

export interface UpdateGoalInput {
  storeId?: AgentOsResourceId | null;
  skuId?: AgentOsResourceId | null;
  type?: string;
  metric?: string;
  targetValue?: JsonValue;
  currentValue?: JsonValue | null;
  deadline?: string | null;
  priority?: number;
  status?: GoalStatus;
  constraints?: JsonObject;
  expectedVersion?: number;
}

export type MemoryType =
  | "SKU"
  | "PROMOTION"
  | "LISTING"
  | "COMPETITOR"
  | "DECISION"
  | "ORGANIZATION";

export interface MemoryEntry {
  id: number;
  organizationId: number;
  memoryType: string;
  subjectType: string | null;
  subjectId: AgentOsResourceId | null;
  title: string | null;
  content: JsonValue;
  tags: string[];
  confidence: number | null;
  sourceWorkflowRunId: number | null;
  sourceActionProposalId: number | null;
  idempotencyKey: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMemoryEntryInput {
  organizationId: number;
  memoryType: MemoryType | string;
  subjectType?: string | null;
  subjectId?: AgentOsResourceId | null;
  title?: string | null;
  content: JsonValue;
  tags?: string[];
  confidence?: number | null;
  sourceWorkflowRunId?: number | null;
  sourceActionProposalId?: number | null;
  idempotencyKey?: string;
}

export interface MemoryEntryListFilter {
  organizationId: number;
  memoryType?: string;
  subjectType?: string;
  subjectId?: AgentOsResourceId | null;
  sourceWorkflowRunId?: number;
  limit?: number;
  offset?: number;
}

export interface UpdateMemoryEntryInput {
  memoryType?: MemoryType | string;
  subjectType?: string | null;
  subjectId?: AgentOsResourceId | null;
  title?: string | null;
  content?: JsonValue;
  tags?: string[];
  confidence?: number | null;
  sourceWorkflowRunId?: number | null;
  sourceActionProposalId?: number | null;
  expectedVersion?: number;
}

export type WorkflowRunStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type WorkflowNodeType =
  | "TRIGGER"
  | "DATA_FETCH"
  | "DATA_VALIDATE"
  | "AGENT_CALL"
  | "TOOL_CALL"
  | "CONDITION"
  | "DECISION"
  | "HUMAN_APPROVAL"
  | "ACTION"
  | "WAIT"
  | "REVIEW"
  | "MEMORY_WRITE"
  | "NOTIFICATION";

export interface WorkflowRun {
  id: number;
  organizationId: number;
  workflowId: string;
  triggerType: string;
  triggerSource: string | null;
  status: WorkflowRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  currentNode: WorkflowNodeType | string | null;
  context: JsonValue;
  evidence: JsonValue | null;
  plan: JsonValue | null;
  actions: JsonValue | null;
  result: JsonValue | null;
  snapshot: JsonValue | null;
  errorMessage: string | null;
  idempotencyKey: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowRunInput {
  organizationId: number;
  workflowId: string;
  triggerType: string;
  triggerSource?: string | null;
  status?: WorkflowRunStatus;
  startedAt?: string | null;
  currentNode?: WorkflowNodeType | string | null;
  context?: JsonValue;
  evidence?: JsonValue | null;
  plan?: JsonValue | null;
  actions?: JsonValue | null;
  result?: JsonValue | null;
  snapshot?: JsonValue | null;
  errorMessage?: string | null;
  idempotencyKey?: string;
}

export interface WorkflowRunListFilter {
  organizationId: number;
  workflowId?: string;
  status?: WorkflowRunStatus;
  triggerType?: string;
  limit?: number;
  offset?: number;
}

export interface UpdateWorkflowRunInput {
  workflowId?: string;
  triggerType?: string;
  triggerSource?: string | null;
  status?: WorkflowRunStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  currentNode?: WorkflowNodeType | string | null;
  context?: JsonValue;
  evidence?: JsonValue | null;
  plan?: JsonValue | null;
  actions?: JsonValue | null;
  result?: JsonValue | null;
  snapshot?: JsonValue | null;
  errorMessage?: string | null;
  expectedVersion?: number;
}

export type ActionProposalStatus =
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

export type ActionRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface ActionProposal {
  id: number;
  organizationId: number;
  workflowRunId: number | null;
  goalId: number | null;
  type: string;
  targetType: string;
  targetId: AgentOsResourceId | null;
  currentValue: JsonValue | null;
  proposedValue: JsonValue;
  reason: string;
  evidence: JsonValue;
  expectedImpact: JsonValue | null;
  riskLevel: ActionRiskLevel;
  confidence: number;
  requiresApproval: boolean;
  status: ActionProposalStatus;
  idempotencyKey: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateActionProposalInput {
  organizationId: number;
  workflowRunId?: number | null;
  goalId?: number | null;
  type: string;
  targetType: string;
  targetId?: AgentOsResourceId | null;
  currentValue?: JsonValue | null;
  proposedValue: JsonValue;
  reason: string;
  evidence: JsonValue;
  expectedImpact?: JsonValue | null;
  riskLevel: ActionRiskLevel;
  confidence?: number;
  requiresApproval?: boolean;
  idempotencyKey?: string;
}

export interface ActionProposalListFilter {
  organizationId: number;
  workflowRunId?: number;
  goalId?: number;
  type?: string;
  status?: ActionProposalStatus;
  riskLevel?: ActionRiskLevel;
  limit?: number;
  offset?: number;
}

export interface UpdateActionProposalInput {
  workflowRunId?: number | null;
  goalId?: number | null;
  type?: string;
  targetType?: string;
  targetId?: AgentOsResourceId | null;
  currentValue?: JsonValue | null;
  proposedValue?: JsonValue;
  reason?: string;
  evidence?: JsonValue;
  expectedImpact?: JsonValue | null;
  riskLevel?: ActionRiskLevel;
  confidence?: number;
  requiresApproval?: boolean;
  status?: ActionProposalStatus;
  expectedVersion?: number;
}

export interface AgentOsPersistenceAdapter {
  createGoal(input: CreateGoalInput): Goal;
  getGoal(id: number, organizationId: number): Goal | null;
  listGoals(filter: GoalListFilter): Goal[];
  updateGoal(
    id: number,
    organizationId: number,
    input: UpdateGoalInput,
  ): Goal | null;

  createMemoryEntry(input: CreateMemoryEntryInput): MemoryEntry;
  getMemoryEntry(id: number, organizationId: number): MemoryEntry | null;
  listMemoryEntries(filter: MemoryEntryListFilter): MemoryEntry[];
  updateMemoryEntry(
    id: number,
    organizationId: number,
    input: UpdateMemoryEntryInput,
  ): MemoryEntry | null;

  createWorkflowRun(input: CreateWorkflowRunInput): WorkflowRun;
  getWorkflowRun(id: number, organizationId: number): WorkflowRun | null;
  listWorkflowRuns(filter: WorkflowRunListFilter): WorkflowRun[];
  updateWorkflowRun(
    id: number,
    organizationId: number,
    input: UpdateWorkflowRunInput,
  ): WorkflowRun | null;

  createActionProposal(input: CreateActionProposalInput): ActionProposal;
  getActionProposal(id: number, organizationId: number): ActionProposal | null;
  listActionProposals(filter: ActionProposalListFilter): ActionProposal[];
  updateActionProposal(
    id: number,
    organizationId: number,
    input: UpdateActionProposalInput,
  ): ActionProposal | null;
}

export type AgentOsStore = AgentOsPersistenceAdapter;
