export type AgentOsViewState = "loading" | "empty" | "failed" | "ready";

export type GoalStatus = "on_track" | "at_risk" | "off_track" | "completed" | "paused";

export type GoalConstraintTone = "neutral" | "success" | "warning" | "danger";

export interface GoalConstraint {
  id?: string;
  label: string;
  value: string;
  tone?: GoalConstraintTone;
}

export interface GoalSummary {
  id: string;
  title: string;
  metric: string;
  currentValue: string | number;
  targetValue: string | number;
  /** Percentage from 0 to 100. The component clamps values outside this range. */
  progress: number;
  status: GoalStatus;
  deadline: string | null;
  constraints: GoalConstraint[];
  description?: string | null;
  owner?: string | null;
}

export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled";

export type WorkflowNodeType =
  | "trigger"
  | "data_fetch"
  | "data_validate"
  | "agent_call"
  | "tool_call"
  | "condition"
  | "decision"
  | "human_approval"
  | "action"
  | "wait"
  | "review"
  | "memory_write"
  | "notification";

export type WorkflowNodeStatus =
  | "pending"
  | "running"
  | "waiting"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "skipped";

export type WorkflowApprovalStatus = "not_required" | "pending" | "approved" | "rejected";

export interface WorkflowApprovalGate {
  status: WorkflowApprovalStatus;
  label?: string | null;
  actor?: string | null;
  decidedAt?: string | null;
}

export interface WorkflowEvidence {
  id: string;
  label: string;
  value?: string | null;
  source?: string | null;
  href?: string | null;
}

export interface WorkflowRunNode {
  id: string;
  name: string;
  type: WorkflowNodeType;
  status: WorkflowNodeStatus;
  summary?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  evidence: WorkflowEvidence[];
  approval?: WorkflowApprovalGate | null;
}

export interface WorkflowRun {
  id: string;
  name: string;
  status: WorkflowRunStatus;
  currentNodeId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  nodes: WorkflowRunNode[];
}
