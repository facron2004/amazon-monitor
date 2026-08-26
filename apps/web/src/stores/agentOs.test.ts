import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { agentOsApi } from "../api-agent-os";
import { useAgentOsStore } from "./agentOs";

const emptyQuality = {
  checkedAt: "2026-08-13T00:00:00.000Z",
  sourceChecks: [],
  report: {
    status: "INVALID" as const,
    score: 0,
    checkedAt: "2026-08-13T00:00:00.000Z",
    staleSources: [],
    missingSources: [],
    invalidSources: [],
    warnings: [],
    refreshRequired: true,
  },
  evidenceGate: {
    allowed: false,
    action: "STOP" as const,
    reason: "No evidence",
    status: "INVALID" as const,
  },
  refreshRequired: true,
  evidenceRefs: [],
};

describe("agent OS store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it("refreshes the real API cache and maps persisted records for the workspace", async () => {
    const clearCache = vi.spyOn(agentOsApi, "clearCache").mockImplementation(() => undefined);
    vi.spyOn(agentOsApi, "listGoals").mockResolvedValue([{
      id: 7,
      type: "sales",
      metric: "revenue",
      targetValue: 1000,
      currentValue: 800,
      deadline: "2026-08-20T00:00:00.000Z",
      priority: 1,
      status: "ACTIVE",
      constraints: { gross_margin: 0.3 },
      version: 1,
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
    }]);
    vi.spyOn(agentOsApi, "listMemory").mockResolvedValue([]);
    vi.spyOn(agentOsApi, "listWorkflowRuns").mockResolvedValue([{
      id: 9,
      workflowId: "sales-review",
      triggerType: "goal",
      triggerSource: null,
      status: "RUNNING",
      startedAt: "2026-08-13T00:00:00.000Z",
      completedAt: null,
      currentNode: "生成建议",
      context: {},
      evidence: [{ id: "e-1", label: "fresh", source: "sales" }],
      plan: ["读取数据", "生成建议"],
      actions: null,
      result: null,
      snapshot: null,
      errorMessage: null,
      version: 1,
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
    }]);
    vi.spyOn(agentOsApi, "listActions").mockResolvedValue([]);
    vi.spyOn(agentOsApi, "listOpportunities").mockResolvedValue([{
      id: 3,
      type: "price_gap",
      title: "价格差机会",
      summary: "真实机会摘要",
      signal: null,
      score: 0.8,
      expectedImpact: 0.2,
      risk: 0.1,
      confidence: 0.9,
      status: "READY",
      details: null,
      targetType: "asin",
      targetId: "B000000001",
      goalId: 7,
      sourceType: "collector",
      sourceId: "price",
      sourceWorkflowRunId: null,
      sourceActionProposalId: null,
      version: 1,
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
    }]);
    vi.spyOn(agentOsApi, "listDecisions").mockResolvedValue([]);
    vi.spyOn(agentOsApi, "listExperiments").mockResolvedValue([]);
    vi.spyOn(agentOsApi, "getDataQuality").mockResolvedValue(emptyQuality);

    const store = useAgentOsStore();
    await store.fetchWorkspace();

    expect(clearCache).toHaveBeenCalledOnce();
    expect(store.selectedGoal).toMatchObject({ id: "7", progress: 80, status: "on_track" });
    expect(store.selectedRun).toMatchObject({ id: "9", status: "running", currentNodeId: "9-1" });
    expect(store.selectedRun?.nodes.map((node) => node.status)).toEqual(["succeeded", "running"]);
    expect(store.opportunities).toHaveLength(1);
    expect(store.dataQuality?.report.status).toBe("INVALID");
    expect(store.error).toBeNull();
  });

  it("keeps the action state tied to approve, execute, and verify responses", async () => {
    const action = {
      id: 12,
      workflowRunId: null,
      goalId: null,
      type: "CREATE_TASK",
      targetType: "workflow",
      targetId: null,
      currentValue: null,
      proposedValue: { title: "创建复核任务" },
      reason: "低风险动作，有明确证据",
      evidence: [{ source: "agent-os" }],
      expectedImpact: { task: "created" },
      riskLevel: "LOW" as const,
      requiresApproval: true,
      status: "PROPOSED" as const,
      version: 1,
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
    };
    const approved = { ...action, status: "APPROVED" as const, version: 2 };
    const succeeded = { ...approved, status: "SUCCEEDED" as const, version: 3 };
    const effective = { ...succeeded, status: "EFFECTIVE" as const, version: 5 };
    const execution = {
      id: 21,
      organizationId: 1,
      actionProposalId: action.id,
      idempotencyKey: "action-12",
      executor: "CREATE_TASK",
      status: "SUCCEEDED" as const,
      result: { taskId: 99 },
      errorMessage: null,
      startedAt: "2026-08-13T00:00:00.000Z",
      completedAt: "2026-08-13T00:01:00.000Z",
      version: 1,
    };
    const verifiedExecution = { ...execution, status: "VERIFIED" as const, result: { taskId: 99, verified: true }, version: 2 };
    const store = useAgentOsStore();
    store.actions.push(action);
    const initialActions = store.actions;
    vi.spyOn(agentOsApi, "approveAction").mockResolvedValue(approved);
    vi.spyOn(agentOsApi, "executeAction").mockResolvedValue({ proposal: succeeded, execution });
    vi.spyOn(agentOsApi, "verifyAction").mockResolvedValue({ proposal: effective, execution: verifiedExecution, status: "EFFECTIVE" });

    await store.approveAction(action);
    expect(store.actions).not.toBe(initialActions);
    expect(store.actions[0]).toMatchObject({ status: "APPROVED", version: 2 });
    await store.executeAction(store.actions[0]);
    expect(store.actions[0]).toMatchObject({ status: "SUCCEEDED", version: 3 });
    expect(store.executions[12]).toMatchObject({ status: "SUCCEEDED", result: { taskId: 99 } });
    await store.verifyAction(store.actions[0]);
    expect(store.actions[0]).toMatchObject({ status: "EFFECTIVE", version: 5 });
    expect(store.executions[12]).toMatchObject({ status: "VERIFIED", result: { verified: true } });
  });
});
