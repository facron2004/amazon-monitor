import type {
  ActionApproval,
  ActionExecution,
  ActionProposal,
  AgentMessage,
  AgentRun,
  AgentRunEvent,
  AgentSession,
  AgentStep,
  AgentToolCall,
} from "@amazon-monitor/shared";

export interface AgentSessionRow {
  id: number; org_id: number; user_id: number; title: string; status: string;
  created_at: string; updated_at: string;
}
export interface AgentMessageRow {
  id: number; session_id: number; run_id: number | null; role: string;
  content: string; created_at: string;
}
export interface AgentRunRow {
  id: number; session_id: number; org_id: number; user_id: number;
  task_type: string; input_text: string; status: string; model: string;
  fallback_model: string; output_json: string | null; error_message: string | null;
  recovery_of_run_id: number | null; created_at: string; updated_at: string;
  completed_at: string | null;
}
export interface AgentRunEventRow {
  id: number; run_id: number; sequence: number; event_type: string;
  payload_json: string; created_at: string;
}
export interface AgentStepRow {
  id: number; run_id: number; sequence: number; title: string; status: string;
  started_at: string | null; completed_at: string | null; error_message: string | null;
}
export interface AgentToolCallRow {
  id: number; run_id: number; step_id: number | null; tool_name: string;
  arguments_json: string; result_json: string | null; status: string;
  started_at: string; completed_at: string | null; error_message: string | null;
}
export interface ActionProposalRow {
  id: number; run_id: number; org_id: number; action_type: string; title: string;
  payload_json: string; risk_level: string; status: string; version: number;
  supersedes_proposal_id: number | null; idempotency_key: string;
  expected_version: number; created_at: string; updated_at: string;
}
export interface ActionApprovalRow {
  id: number; proposal_id: number; user_id: number; decision: string;
  modification_json: string | null; created_at: string;
}
export interface ActionExecutionRow {
  id: number; proposal_id: number; idempotency_key: string; status: string;
  result_json: string | null; error_message: string | null;
  created_at: string; updated_at: string;
}

function parseObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export const mapAgentSession = (row: AgentSessionRow): AgentSession => ({
  id: row.id, orgId: row.org_id, userId: row.user_id, title: row.title,
  status: row.status === "archived" ? "archived" : "active",
  createdAt: row.created_at, updatedAt: row.updated_at,
});

export const mapAgentMessage = (row: AgentMessageRow): AgentMessage => ({
  id: row.id, sessionId: row.session_id, runId: row.run_id,
  role: ["user", "assistant", "system", "tool"].includes(row.role)
    ? row.role as AgentMessage["role"]
    : "system",
  content: row.content, createdAt: row.created_at,
});

export const mapAgentRun = (row: AgentRunRow): AgentRun => ({
  id: row.id, sessionId: row.session_id, orgId: row.org_id, userId: row.user_id,
  taskType: row.task_type as AgentRun["taskType"],
  input: row.input_text, status: row.status as AgentRun["status"],
  model: row.model, fallbackModel: row.fallback_model,
  output: parseObject(row.output_json) as AgentRun["output"],
  errorMessage: row.error_message, recoveryOfRunId: row.recovery_of_run_id,
  createdAt: row.created_at, updatedAt: row.updated_at,
  completedAt: row.completed_at,
});

export const mapAgentRunEvent = (row: AgentRunEventRow): AgentRunEvent => ({
  id: row.id, runId: row.run_id, sequence: row.sequence, type: row.event_type,
  payload: parseObject(row.payload_json) ?? {}, createdAt: row.created_at,
});

export const mapAgentStep = (row: AgentStepRow): AgentStep => ({
  id: row.id, runId: row.run_id, sequence: row.sequence, title: row.title,
  status: row.status as AgentStep["status"], startedAt: row.started_at,
  completedAt: row.completed_at, errorMessage: row.error_message,
});

export const mapAgentToolCall = (row: AgentToolCallRow): AgentToolCall => ({
  id: row.id, runId: row.run_id, stepId: row.step_id,
  toolName: row.tool_name as AgentToolCall["toolName"],
  arguments: parseObject(row.arguments_json) ?? {},
  result: parseObject(row.result_json) as AgentToolCall["result"],
  status: row.status as AgentToolCall["status"], startedAt: row.started_at,
  completedAt: row.completed_at, errorMessage: row.error_message,
});

export const mapActionProposal = (row: ActionProposalRow): ActionProposal => ({
  id: row.id, runId: row.run_id, orgId: row.org_id,
  actionType: row.action_type as ActionProposal["actionType"], title: row.title,
  payload: parseObject(row.payload_json) ?? {},
  riskLevel: row.risk_level as ActionProposal["riskLevel"],
  status: row.status as ActionProposal["status"], version: row.version,
  supersedesProposalId: row.supersedes_proposal_id,
  idempotencyKey: row.idempotency_key, expectedVersion: row.expected_version,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

export const mapActionApproval = (row: ActionApprovalRow): ActionApproval => ({
  id: row.id, proposalId: row.proposal_id, userId: row.user_id,
  decision: row.decision as ActionApproval["decision"],
  modification: parseObject(row.modification_json), createdAt: row.created_at,
});

export const mapActionExecution = (row: ActionExecutionRow): ActionExecution => ({
  id: row.id, proposalId: row.proposal_id, idempotencyKey: row.idempotency_key,
  status: row.status as ActionExecution["status"], result: parseObject(row.result_json),
  errorMessage: row.error_message, createdAt: row.created_at, updatedAt: row.updated_at,
});
