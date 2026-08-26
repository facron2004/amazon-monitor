import {
  parseJsonObject,
  parseJsonValue,
  parseRequiredJson,
  parseResourceId,
  parseStringArray,
} from "./json.js";
import type {
  ActionProposal,
  Goal,
  MemoryEntry,
  WorkflowRun,
} from "./types.js";

export interface GoalRow {
  id: number;
  organization_id: number;
  store_id_json: string | null;
  sku_id_json: string | null;
  goal_type: string;
  metric: string;
  target_value_json: string;
  current_value_json: string | null;
  deadline: string | null;
  priority: number;
  status: string;
  constraints_json: string;
  idempotency_key: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface MemoryEntryRow {
  id: number;
  organization_id: number;
  memory_type: string;
  subject_type: string | null;
  subject_id_json: string | null;
  title: string | null;
  content_json: string;
  tags_json: string;
  confidence: number | null;
  source_workflow_run_id: number | null;
  source_action_proposal_id: number | null;
  idempotency_key: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRunRow {
  id: number;
  organization_id: number;
  workflow_id: string;
  trigger_type: string;
  trigger_source: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  current_node: string | null;
  context_json: string;
  evidence_json: string | null;
  plan_json: string | null;
  actions_json: string | null;
  result_json: string | null;
  snapshot_json: string | null;
  error_message: string | null;
  idempotency_key: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ActionProposalRow {
  id: number;
  organization_id: number;
  workflow_run_id: number | null;
  goal_id: number | null;
  action_type: string;
  target_type: string;
  target_id_json: string | null;
  current_value_json: string | null;
  proposed_value_json: string;
  reason: string;
  evidence_json: string;
  expected_impact_json: string | null;
  risk_level: string;
  confidence: number;
  requires_approval: number;
  status: string;
  idempotency_key: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export function mapGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: parseResourceId(row.store_id_json, "goal.storeId"),
    skuId: parseResourceId(row.sku_id_json, "goal.skuId"),
    type: row.goal_type,
    metric: row.metric,
    targetValue: parseRequiredJson(row.target_value_json, "goal.targetValue"),
    currentValue: parseJsonValue(row.current_value_json, "goal.currentValue"),
    deadline: row.deadline,
    priority: row.priority,
    status: row.status as Goal["status"],
    constraints: parseJsonObject(row.constraints_json, "goal.constraints"),
    idempotencyKey: row.idempotency_key,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMemoryEntry(row: MemoryEntryRow): MemoryEntry {
  return {
    id: row.id,
    organizationId: row.organization_id,
    memoryType: row.memory_type,
    subjectType: row.subject_type,
    subjectId: parseResourceId(row.subject_id_json, "memory.subjectId"),
    title: row.title,
    content: parseRequiredJson(row.content_json, "memory.content"),
    tags: parseStringArray(row.tags_json, "memory.tags"),
    confidence: row.confidence,
    sourceWorkflowRunId: row.source_workflow_run_id,
    sourceActionProposalId: row.source_action_proposal_id,
    idempotencyKey: row.idempotency_key,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapWorkflowRun(row: WorkflowRunRow): WorkflowRun {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workflowId: row.workflow_id,
    triggerType: row.trigger_type,
    triggerSource: row.trigger_source,
    status: row.status as WorkflowRun["status"],
    startedAt: row.started_at,
    completedAt: row.completed_at,
    currentNode: row.current_node,
    context: parseRequiredJson(row.context_json, "workflow.context"),
    evidence: parseJsonValue(row.evidence_json, "workflow.evidence"),
    plan: parseJsonValue(row.plan_json, "workflow.plan"),
    actions: parseJsonValue(row.actions_json, "workflow.actions"),
    result: parseJsonValue(row.result_json, "workflow.result"),
    snapshot: parseJsonValue(row.snapshot_json, "workflow.snapshot"),
    errorMessage: row.error_message,
    idempotencyKey: row.idempotency_key,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapActionProposal(row: ActionProposalRow): ActionProposal {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workflowRunId: row.workflow_run_id,
    goalId: row.goal_id,
    type: row.action_type,
    targetType: row.target_type,
    targetId: parseResourceId(row.target_id_json, "action.targetId"),
    currentValue: parseJsonValue(row.current_value_json, "action.currentValue"),
    proposedValue: parseRequiredJson(row.proposed_value_json, "action.proposedValue"),
    reason: row.reason,
    evidence: parseRequiredJson(row.evidence_json, "action.evidence"),
    expectedImpact: parseJsonValue(row.expected_impact_json, "action.expectedImpact"),
    riskLevel: row.risk_level as ActionProposal["riskLevel"],
    confidence: row.confidence,
    requiresApproval: row.requires_approval !== 0,
    status: row.status as ActionProposal["status"],
    idempotencyKey: row.idempotency_key,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
