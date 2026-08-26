import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import type { JsonValue } from "@amazon-monitor/shared";
import {
  agentOsApi,
  type AgentOsActionProposal,
  type AgentOsActionExecution,
  type AgentOsActionExecutionResponse,
  type AgentOsActionVerificationResponse,
  type AgentOsDataQualityEvidence,
  type AgentOsDecision,
  type AgentOsExperiment,
  type AgentOsGoal,
  type AgentOsOpportunity,
  type AgentOsSignal,
  type AgentOsMemoryEntry,
  type AgentOsWorkflowRun,
} from "../api-agent-os";
import type {
  GoalConstraint,
  GoalSummary,
  WorkflowApprovalGate,
  WorkflowEvidence,
  WorkflowNodeStatus,
  WorkflowRun,
  WorkflowRunNode,
} from "../components/agent-os/agent-os-types";

export const useAgentOsStore = defineStore("agentOs", () => {
  const signals = ref<AgentOsSignal[]>([]);
  const goals = ref<GoalSummary[]>([]);
  const memory = ref<AgentOsMemoryEntry[]>([]);
  const runs = ref<WorkflowRun[]>([]);
  const actions = shallowRef<AgentOsActionProposal[]>([]);
  const opportunities = ref<AgentOsOpportunity[]>([]);
  const decisions = ref<AgentOsDecision[]>([]);
  const experiments = ref<AgentOsExperiment[]>([]);
  const dataQuality = ref<AgentOsDataQualityEvidence | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const intelligenceError = ref<string | null>(null);
  const signalError = ref<string | null>(null);
  const dataQualityError = ref<string | null>(null);
  const actionError = ref<string | null>(null);
  const actionBusyId = ref<number | null>(null);
  const signalBusyId = ref<string | null>(null);
  const executions = ref<Record<number, AgentOsActionExecution>>({});
  const selectedRunId = ref<string | null>(null);

  const selectedGoal = computed(() => goals.value[0] ?? null);
  const selectedRun = computed(() =>
    runs.value.find((run) => run.id === selectedRunId.value) ?? runs.value[0] ?? null,
  );
  const activeGoalCount = computed(() => goals.value.filter((goal) =>
    ["on_track", "at_risk", "off_track"].includes(goal.status),
  ).length);
  const pendingActionCount = computed<number>(() => {
    let count = 0;
    for (const action of actions.value) {
      if (action.status === "PROPOSED" || action.status === "APPROVED" || action.status === "EXECUTING" || action.status === "VERIFYING") {
        count += 1;
      }
    }
    return count;
  });

  async function fetchWorkspace(signal?: AbortSignal): Promise<void> {
    loading.value = true;
    error.value = null;
    intelligenceError.value = null;
    signalError.value = null;
    dataQualityError.value = null;
    agentOsApi.clearCache();
    try {
      const results = await Promise.allSettled([
        agentOsApi.listSignals({ limit: 50, signal }),
        agentOsApi.listGoals({ limit: 50, signal }),
        agentOsApi.listMemory({ limit: 50, signal }),
        agentOsApi.listWorkflowRuns({ limit: 50, signal }),
        agentOsApi.listActions({ limit: 50, signal }),
        agentOsApi.listOpportunities({ limit: 50, signal }),
        agentOsApi.listDecisions({ limit: 50, signal }),
        agentOsApi.listExperiments({ limit: 50, signal }),
        agentOsApi.getDataQuality({ maxAgeHours: 24, signal }),
      ]);

      if (signal?.aborted || results.some((result) => result.status === "rejected" && isAbortError(result.reason))) return;

      const [signalResult, goalResult, memoryResult, runResult, actionResult, opportunityResult, decisionResult, experimentResult, qualityResult] = results;
      if (signalResult.status === "fulfilled") signals.value = signalResult.value;
      if (goalResult.status === "fulfilled") goals.value = goalResult.value.map(toGoalSummary);
      if (memoryResult.status === "fulfilled") memory.value = memoryResult.value;
      if (runResult.status === "fulfilled") runs.value = runResult.value.map(toWorkflowRun);
      if (actionResult.status === "fulfilled") actions.value = actionResult.value;
      if (opportunityResult.status === "fulfilled") opportunities.value = opportunityResult.value;
      if (decisionResult.status === "fulfilled") decisions.value = decisionResult.value;
      if (experimentResult.status === "fulfilled") experiments.value = experimentResult.value;
      if (qualityResult.status === "fulfilled") dataQuality.value = qualityResult.value;

      error.value = firstError([goalResult, memoryResult, runResult, actionResult]);
      intelligenceError.value = firstError([opportunityResult, decisionResult, experimentResult]);
      signalError.value = firstError([signalResult]);
      dataQualityError.value = firstError([qualityResult]);
      if (!runs.value.some((run) => run.id === selectedRunId.value)) {
        selectedRunId.value = runs.value[0]?.id ?? null;
      }
    } catch (cause) {
      if (isAbortError(cause)) return;
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading.value = false;
    }
  }

  async function investigateSignal(signal: AgentOsSignal): Promise<void> {
    if (signalBusyId.value !== null) return;
    signalBusyId.value = signal.id;
    signalError.value = null;
    try {
      await agentOsApi.investigateSignal(signal.id);
      await fetchWorkspace();
    } catch (cause) {
      signalError.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      signalBusyId.value = null;
    }
  }

  async function ignoreSignal(signal: AgentOsSignal): Promise<void> {
    if (signalBusyId.value !== null) return;
    signalBusyId.value = signal.id;
    signalError.value = null;
    try {
      const updated = await agentOsApi.updateSignalStatus(signal.id, "IGNORED");
      replaceSignal(updated);
    } catch (cause) {
      signalError.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      signalBusyId.value = null;
    }
  }

  function selectRun(id: string): void {
    selectedRunId.value = id;
  }

  async function approveAction(action: AgentOsActionProposal): Promise<void> {
    await runActionMutation(action, () => agentOsApi.approveAction(action.id, action.version), replaceAction);
  }

  async function executeAction(action: AgentOsActionProposal): Promise<void> {
    await runActionMutation(
      action,
      () => {
        assertExecutableAction(action);
        return agentOsApi.executeAction(action.id);
      },
      (result) => applyActionExecutionResult(result),
    );
  }

  async function verifyAction(action: AgentOsActionProposal): Promise<void> {
    await runActionMutation(
      action,
      () => {
        if (action.status !== "SUCCEEDED" && action.status !== "VERIFYING") {
          throw new Error("动作只有在执行成功或验证中的状态才能发起验证。");
        }
        return agentOsApi.verifyAction(action.id);
      },
      (result) => applyActionVerificationResult(result),
    );
  }

  async function runActionMutation<T extends ActionMutationResult>(
    action: AgentOsActionProposal,
    mutation: () => Promise<T>,
    apply: (result: T) => void,
  ): Promise<void> {
    if (actionBusyId.value !== null) return;
    actionBusyId.value = action.id;
    actionError.value = null;
    try {
      assertLowRiskAction(action);
      const result = await mutation();
      apply(result);
    } catch (cause) {
      actionError.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      actionBusyId.value = null;
    }
  }

  function replaceAction(action: AgentOsActionProposal): void {
    const index = actions.value.findIndex((item) => item.id === action.id);
    if (index < 0) {
      actions.value = [action, ...actions.value];
      return;
    }
    const next = actions.value.slice();
    next[index] = action;
    actions.value = next;
  }

  function replaceSignal(signal: AgentOsSignal): void {
    const index = signals.value.findIndex((item) => item.id === signal.id);
    if (index < 0) {
      signals.value = [signal, ...signals.value];
      return;
    }
    const next = signals.value.slice();
    next[index] = signal;
    signals.value = next;
  }

  function applyActionExecutionResult(result: ActionMutationResult): void {
    if (!isExecutionResponse(result)) return;
    replaceAction(result.proposal);
    executions.value = { ...executions.value, [result.proposal.id]: result.execution };
  }

  function applyActionVerificationResult(result: ActionMutationResult): void {
    if (!isVerificationResponse(result)) return;
    replaceAction(result.proposal);
    executions.value = { ...executions.value, [result.proposal.id]: result.execution };
  }

  return {
    signals,
    goals,
    selectedGoal,
    memory,
    runs,
    selectedRun,
    actions,
    opportunities,
    decisions,
    experiments,
    dataQuality,
    activeGoalCount,
    pendingActionCount,
    loading,
    error,
    intelligenceError,
    signalError,
    dataQualityError,
    actionError,
    actionBusyId,
    signalBusyId,
    executions,
    selectedRunId,
    fetchWorkspace,
    investigateSignal,
    ignoreSignal,
    selectRun,
    approveAction,
    executeAction,
    verifyAction,
  };
});

type ActionMutationResult = AgentOsActionProposal | AgentOsActionExecutionResponse | AgentOsActionVerificationResponse;

function assertLowRiskAction(action: AgentOsActionProposal): void {
  if (action.riskLevel !== "LOW") {
    throw new Error("当前 Agent OS 切片只允许审批和执行 LOW 风险动作。");
  }
}

function assertExecutableAction(action: AgentOsActionProposal): void {
  assertLowRiskAction(action);
  if (action.status === "PROPOSED" && action.requiresApproval) {
    throw new Error("该动作需要先完成审批。");
  }
  if (action.status !== "PROPOSED" && action.status !== "APPROVED") {
    throw new Error("该动作当前状态不可执行。");
  }
}

function isExecutionResponse(result: ActionMutationResult): result is AgentOsActionExecutionResponse {
  return "execution" in result && !("status" in result && typeof result.status === "string");
}

function isVerificationResponse(result: ActionMutationResult): result is AgentOsActionVerificationResponse {
  return "execution" in result && "status" in result;
}

function firstError(results: readonly PromiseSettledResult<unknown>[]): string | null {
  for (const result of results) {
    if (result.status === "rejected" && !isAbortError(result.reason)) {
      return result.reason instanceof Error ? result.reason.message : String(result.reason);
    }
  }
  return null;
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === "AbortError"
    || cause instanceof Error && cause.name === "AbortError";
}

function toGoalSummary(goal: AgentOsGoal): GoalSummary {
  const current = numericValue(goal.currentValue);
  const target = numericValue(goal.targetValue);
  const ratio = current === null || target === null || target === 0
    ? 0
    : ["bsr_rank", "organic_rank"].includes(goal.metric)
      ? target / Math.max(current, 1) * 100
      : current / target * 100;
  const status = goal.status === "ACHIEVED"
    ? "completed"
    : goal.status === "PAUSED" || goal.status === "CANCELLED"
      ? "paused"
      : goal.status === "FAILED"
        ? "off_track"
        : ratio >= 75 ? "on_track" : ratio >= 40 ? "at_risk" : "off_track";
  return {
    id: String(goal.id),
    title: `${goal.type} · ${goal.metric}`,
    metric: goal.metric,
    currentValue: displayValue(goal.currentValue),
    targetValue: displayValue(goal.targetValue),
    progress: ratio,
    status,
    deadline: goal.deadline,
    constraints: toConstraints(goal.constraints),
    description: `优先级 P${goal.priority} · 版本 ${goal.version}`,
  };
}

function toConstraints(value: Record<string, JsonValue>): GoalConstraint[] {
  return Object.entries(value).map(([label, constraint]) => ({
    id: label,
    label,
    value: displayValue(constraint).toString(),
    tone: label.toLowerCase().includes("risk") ? "warning" : "neutral",
  }));
}

function toWorkflowRun(run: AgentOsWorkflowRun): WorkflowRun {
  const status = toRunStatus(run.status);
  const plan = Array.isArray(run.plan) ? run.plan : [];
  const planItems = plan.filter((item): item is string => typeof item === "string");
  const steps = planItems.length > 0 ? planItems : [run.currentNode ?? run.triggerType];
  const evidence = toEvidence(run.evidence);
  const nodes = steps.map((name, index) => {
    const nodeStatus = resolveNodeStatus(status, index, steps.length, run.currentNode, steps);
    const approval: WorkflowApprovalGate | null = nodeStatus === "waiting_approval"
      ? { status: "pending", label: "需要人工确认" }
      : null;
    return {
      id: `${run.id}-${index}`,
      name,
      type: index === 0 ? "trigger" : "agent_call",
      status: nodeStatus,
      summary: index === steps.length - 1 && run.errorMessage ? run.errorMessage : null,
      startedAt: index === 0 ? run.startedAt : null,
      completedAt: status === "succeeded" ? run.completedAt : null,
      evidence: index === steps.length - 1 ? evidence : [],
      approval,
    } satisfies WorkflowRunNode;
  });
  const currentIndex = run.currentNode ? steps.indexOf(run.currentNode) : -1;
  return {
    id: String(run.id),
    name: run.workflowId,
    status,
    currentNodeId: currentIndex >= 0 ? `${run.id}-${currentIndex}` : null,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    nodes,
  };
}

function toRunStatus(status: AgentOsWorkflowRun["status"]): WorkflowRun["status"] {
  const statuses: Record<AgentOsWorkflowRun["status"], WorkflowRun["status"]> = {
    PENDING: "queued",
    RUNNING: "running",
    WAITING: "waiting",
    PAUSED: "waiting_approval",
    COMPLETED: "succeeded",
    FAILED: "failed",
    CANCELLED: "cancelled",
  };
  return statuses[status];
}

function resolveNodeStatus(
  runStatus: WorkflowRun["status"],
  index: number,
  length: number,
  currentNode: string | null,
  steps: readonly string[],
): WorkflowNodeStatus {
  if (runStatus === "succeeded") return "succeeded";
  const matchedIndex = currentNode === null ? -1 : steps.indexOf(currentNode);
  const currentIndex = matchedIndex >= 0 ? matchedIndex : length - 1;
  if (runStatus === "failed") {
    if (index < currentIndex) return "succeeded";
    if (index === currentIndex) return "failed";
    return "pending";
  }
  if (runStatus === "running") {
    if (index < currentIndex) return "succeeded";
    if (index === currentIndex) return "running";
    return "pending";
  }
  if (runStatus === "waiting" || runStatus === "waiting_approval") {
    if (index < currentIndex) return "succeeded";
    if (index === currentIndex) return runStatus === "waiting" ? "waiting" : "waiting_approval";
    return "pending";
  }
  if (runStatus === "cancelled") return index <= currentIndex ? "skipped" : "pending";
  return "pending";
}

function toEvidence(value: JsonValue | null): WorkflowEvidence[] {
  if (!Array.isArray(value)) {
    return value === null ? [] : [{ id: "evidence-1", label: "运行证据", value: displayValue(value).toString() }];
  }
  return value.map((item, index) => ({
    id: `evidence-${index + 1}`,
    label: typeof item === "object" && item !== null && !Array.isArray(item) && typeof item.label === "string"
      ? item.label
      : `证据 ${index + 1}`,
    value: displayValue(item).toString(),
    source: typeof item === "object" && item !== null && !Array.isArray(item) && typeof item.source === "string"
      ? item.source
      : null,
  }));
}

function numericValue(value: JsonValue | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function displayValue(value: JsonValue | null): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value === null) return "—";
  return JSON.stringify(value);
}
