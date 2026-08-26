import type {
  AgentOsViewState,
  GoalConstraintTone,
  GoalStatus,
  WorkflowApprovalStatus,
  WorkflowNodeStatus,
  WorkflowNodeType,
  WorkflowRunStatus
} from "./agent-os-types";

export type AgentOsTagType = "info" | "success" | "warning" | "danger";
export type AgentOsProgressStatus = "success" | "warning" | "exception";

export function resolveAgentOsViewState(
  loading: boolean,
  error: string | null | undefined,
  hasData: boolean
): AgentOsViewState {
  if (loading) return "loading";
  if (error?.trim()) return "failed";
  return hasData ? "ready" : "empty";
}

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function formatProgressPercent(value: number): string {
  return `${Math.round(clampProgress(value))}%`;
}

export function formatAgentOsDate(value: string | null | undefined): string {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日期无效";

  const pad = (part: number): string => String(part).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  ].join(" ");
}

export function goalStatusLabel(status: GoalStatus): string {
  const labels: Record<GoalStatus, string> = {
    on_track: "进展正常",
    at_risk: "存在风险",
    off_track: "偏离目标",
    completed: "已完成",
    paused: "已暂停"
  };
  return labels[status];
}

export function goalStatusTagType(status: GoalStatus): AgentOsTagType {
  const types: Record<GoalStatus, AgentOsTagType> = {
    on_track: "success",
    at_risk: "warning",
    off_track: "danger",
    completed: "success",
    paused: "info"
  };
  return types[status];
}

export function goalProgressStatus(status: GoalStatus): AgentOsProgressStatus | undefined {
  if (status === "on_track" || status === "completed") return "success";
  if (status === "at_risk") return "warning";
  if (status === "off_track") return "exception";
  return undefined;
}

export function constraintTagType(tone: GoalConstraintTone = "neutral"): AgentOsTagType {
  if (tone === "success") return "success";
  if (tone === "warning") return "warning";
  if (tone === "danger") return "danger";
  return "info";
}

export function workflowRunStatusLabel(status: WorkflowRunStatus): string {
  const labels: Record<WorkflowRunStatus, string> = {
    queued: "排队中",
    running: "运行中",
    waiting: "等待继续",
    waiting_approval: "等待审批",
    succeeded: "已完成",
    failed: "失败",
    cancelled: "已取消"
  };
  return labels[status];
}

export function workflowRunStatusTagType(status: WorkflowRunStatus): AgentOsTagType {
  const types: Record<WorkflowRunStatus, AgentOsTagType> = {
    queued: "info",
    running: "warning",
    waiting: "info",
    waiting_approval: "warning",
    succeeded: "success",
    failed: "danger",
    cancelled: "info"
  };
  return types[status];
}

export function workflowNodeTypeLabel(type: WorkflowNodeType): string {
  const labels: Record<WorkflowNodeType, string> = {
    trigger: "触发器",
    data_fetch: "数据获取",
    data_validate: "数据校验",
    agent_call: "Agent 调用",
    tool_call: "工具调用",
    condition: "条件判断",
    decision: "决策",
    human_approval: "人工审批",
    action: "执行动作",
    wait: "等待",
    review: "结果复核",
    memory_write: "写入记忆",
    notification: "通知"
  };
  return labels[type];
}

export function workflowNodeStatusLabel(status: WorkflowNodeStatus): string {
  const labels: Record<WorkflowNodeStatus, string> = {
    pending: "待执行",
    running: "执行中",
    waiting: "等待继续",
    waiting_approval: "待审批",
    succeeded: "已完成",
    failed: "失败",
    skipped: "已跳过"
  };
  return labels[status];
}

export function workflowNodeStatusTagType(status: WorkflowNodeStatus): AgentOsTagType {
  const types: Record<WorkflowNodeStatus, AgentOsTagType> = {
    pending: "info",
    running: "warning",
    waiting: "info",
    waiting_approval: "warning",
    succeeded: "success",
    failed: "danger",
    skipped: "info"
  };
  return types[status];
}

export function workflowApprovalLabel(status: WorkflowApprovalStatus): string {
  const labels: Record<WorkflowApprovalStatus, string> = {
    not_required: "无需审批",
    pending: "等待审批",
    approved: "已审批",
    rejected: "已拒绝"
  };
  return labels[status];
}

export function workflowApprovalTagType(status: WorkflowApprovalStatus): AgentOsTagType {
  const types: Record<WorkflowApprovalStatus, AgentOsTagType> = {
    not_required: "info",
    pending: "warning",
    approved: "success",
    rejected: "danger"
  };
  return types[status];
}

export function formatEvidenceValue(value: string | null | undefined): string {
  return value?.trim() || "已记录";
}
