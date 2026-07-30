export const agentTaskTypes = [
  "query",
  "investigation",
  "patrol",
  "report",
  "action",
  "recovery",
] as const;
export type AgentTaskType = (typeof agentTaskTypes)[number];

export const agentRunStatuses = [
  "created",
  "planning",
  "checking_data",
  "running_tools",
  "analyzing",
  "waiting_approval",
  "executing_action",
  "completed",
  "failed",
  "cancelled",
] as const;
export type AgentRunStatus = (typeof agentRunStatuses)[number];

export const actionProposalStatuses = [
  "pending",
  "approved",
  "rejected",
  "executing",
  "completed",
  "failed",
  "expired",
] as const;
export type ActionProposalStatus = (typeof actionProposalStatuses)[number];

export const approvalDecisions = [
  "approved",
  "rejected",
  "modified",
  "expired",
] as const;
export type ApprovalDecision = (typeof approvalDecisions)[number];

export const agentToolNames = [
  "get_category_snapshot",
  "get_keyword_ranking",
  "get_asin_history",
  "compare_asins",
  "compare_brand_matrix",
  "get_price_history",
  "get_promotion_timeline",
  "get_review_growth",
  "get_listing_change",
  "check_data_freshness",
  "find_rank_anomalies",
  "find_new_product_breakouts",
  "find_price_low",
  "find_review_anomalies",
  "find_brand_share_changes",
] as const;
export type AgentToolName = (typeof agentToolNames)[number];

export const agentActionTypes = [
  "recollect",
  "monitor_asin",
  "create_task",
  "send_feishu_report",
  "export_report",
] as const;
export type AgentActionType = (typeof agentActionTypes)[number];
export type AgentRiskLevel = "L1" | "L2" | "L3";
export type AgentFreshnessStatus = "fresh" | "stale" | "missing" | "failed";

export const agentModelProviderKinds = [
  "openai",
  "openai-compatible",
  "chatgpt-oauth",
] as const;
export type AgentModelProviderKind = (typeof agentModelProviderKinds)[number];
export type AgentModelApiMode = "responses" | "chat-completions";

export interface AgentModelConnectionSummary {
  id: string;
  name: string;
  provider: AgentModelProviderKind;
  apiMode: AgentModelApiMode;
  baseUrl: string | null;
  primaryModel: string;
  fallbackModel: string;
  reasoningEnabled: boolean;
  configured: boolean;
}

export interface AgentModelConnectionInput {
  id?: string;
  name: string;
  provider: AgentModelProviderKind;
  apiMode: AgentModelApiMode;
  baseUrl?: string | null;
  primaryModel: string;
  fallbackModel?: string | null;
  reasoningEnabled?: boolean;
  apiKey?: string | null;
}

export interface AgentModelConnectionState {
  activeConnectionId: string | null;
  connections: AgentModelConnectionSummary[];
}

export interface AgentModelRuntimeConnection extends AgentModelConnectionSummary {
  apiKey: string | null;
}

export interface AgentOAuthStatus {
  connected: boolean;
  authMode: "chatgpt" | null;
  planType: string | null;
}

export interface AgentOAuthStartResult {
  loginId: string;
  authUrl: string;
}

export interface AgentEvidenceRef {
  kind: string;
  id: string;
  label: string;
  observedAt: string | null;
}

export interface AgentConclusionScope {
  marketplace: string | null;
  asin: string | null;
  categoryId: number | null;
  categoryName: string | null;
  from: string | null;
  to: string | null;
}

export interface AgentConclusion {
  text: string;
  scope: AgentConclusionScope;
  evidenceRefs: AgentEvidenceRef[];
  snapshotRefs: AgentEvidenceRef[];
  confidence: number;
}

export interface AgentFreshness {
  status: AgentFreshnessStatus;
  checkedAt: string;
  maxAgeHours: number;
  oldestEvidenceAt: string | null;
  staleSources: string[];
  dataGaps: string[];
  warnings: string[];
}

export interface AgentRecommendedAction {
  type: AgentActionType;
  title: string;
  rationale: string;
  riskLevel: AgentRiskLevel;
  requiresApproval: true;
  payload: Record<string, unknown>;
}

export interface AgentRunOutput {
  summary: string;
  conclusions: AgentConclusion[];
  freshness: AgentFreshness;
  riskNotes: string[];
  recommendedActions: AgentRecommendedAction[];
}

export interface AgentSession {
  id: number;
  orgId: number;
  userId: number;
  title: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface AgentMessage {
  id: number;
  sessionId: number;
  runId: number | null;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string;
}

export interface AgentRun {
  id: number;
  sessionId: number;
  orgId: number;
  userId: number;
  taskType: AgentTaskType;
  input: string;
  status: AgentRunStatus;
  model: string;
  fallbackModel: string;
  output: AgentRunOutput | null;
  errorMessage: string | null;
  recoveryOfRunId: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface AgentRunEvent {
  id: number;
  runId: number;
  sequence: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AgentStep {
  id: number;
  runId: number;
  sequence: number;
  title: string;
  status: "running" | "completed" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface AgentToolCall {
  id: number;
  runId: number;
  stepId: number | null;
  toolName: AgentToolName;
  arguments: Record<string, unknown>;
  result: AgentToolEnvelope | null;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface ActionProposal {
  id: number;
  runId: number;
  orgId: number;
  actionType: AgentActionType;
  title: string;
  payload: Record<string, unknown>;
  riskLevel: AgentRiskLevel;
  status: ActionProposalStatus;
  version: number;
  supersedesProposalId: number | null;
  idempotencyKey: string;
  expectedVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActionApproval {
  id: number;
  proposalId: number;
  userId: number;
  decision: ApprovalDecision;
  modification: Record<string, unknown> | null;
  createdAt: string;
}

export interface ActionExecution {
  id: number;
  proposalId: number;
  idempotencyKey: string;
  status: "executing" | "completed" | "failed" | "uncertain";
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentToolEnvelope<T = unknown> {
  data: T;
  evidenceRefs: AgentEvidenceRef[];
  freshness: AgentFreshness;
  dataGaps: string[];
  warnings: string[];
}

export interface CreateAgentSessionInput {
  orgId: number;
  userId: number;
  title: string;
}

export interface CreateAgentRunInput {
  sessionId: number;
  orgId: number;
  userId: number;
  taskType: AgentTaskType;
  input: string;
  model: string;
  fallbackModel: string;
  recoveryOfRunId?: number | null;
}

export interface CreateActionProposalInput {
  runId: number;
  orgId: number;
  actionType: AgentActionType;
  title: string;
  payload: Record<string, unknown>;
  riskLevel: AgentRiskLevel;
  idempotencyKey: string;
}

export interface DesktopAgentRunStart {
  type: "agent.run.start";
  config: {
    enabled: boolean;
    primaryModel: string;
    fallbackModel: string;
    reasoningEffort: "low" | "medium" | "high";
    maxTurns: number;
    tracingDisabled: true;
  };
  run: {
    id: number;
    sessionId: number;
    orgId: number;
    userId: number;
    input: string;
    taskType: AgentTaskType;
    freshnessInput: Record<string, unknown>;
  };
}

export interface DesktopAgentActiveConnectionMessage {
  type: "agent.connection.active";
  connection: AgentModelConnectionSummary | null;
}

export interface DesktopAgentRunCancel {
  type: "agent.run.cancel";
  runId: number;
}

export interface DesktopAgentRunEventMessage {
  type: "agent.run.event";
  runId: number;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface DesktopAgentRunCompleteMessage {
  type: "agent.run.complete";
  runId: number;
  output: AgentRunOutput;
}

export interface DesktopAgentRunFailMessage {
  type: "agent.run.fail";
  runId: number;
  errorMessage: string;
}

export interface DesktopAgentRecoveryReadyMessage {
  type: "agent.recovery.ready";
  jobId: number;
}

export interface DesktopAgentProcessUnavailableMessage {
  type: "agent.process.unavailable";
  role: "agent";
  errorMessage: string;
}

export type DesktopAgentRpcMethod =
  | "tool.execute"
  | "session.get"
  | "session.add"
  | "session.pop"
  | "session.clear";

export interface DesktopAgentRpcRequest {
  type: "agent.rpc.request";
  requestId: string;
  runId: number;
  method: DesktopAgentRpcMethod;
  payload: Record<string, unknown>;
}

export interface DesktopAgentRpcResult {
  type: "agent.rpc.result";
  requestId: string;
  ok: boolean;
  result?: unknown;
  errorMessage?: string;
}

export type DesktopAgentBridgeMessage =
  | DesktopAgentRunStart
  | DesktopAgentActiveConnectionMessage
  | DesktopAgentRunCancel
  | DesktopAgentRunEventMessage
  | DesktopAgentRunCompleteMessage
  | DesktopAgentRunFailMessage
  | DesktopAgentRecoveryReadyMessage
  | DesktopAgentProcessUnavailableMessage
  | DesktopAgentRpcRequest
  | DesktopAgentRpcResult;
