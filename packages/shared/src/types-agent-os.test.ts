import { describe, expect, it } from "vitest";
import {
  assessConfidence,
  canAutoExecute,
  classifyConfidence,
  evaluateAutoExecution,
  isActionProposal,
  isDecision,
  isGoal,
  isMemoryEntry,
  isWorkflowNode,
  validateActionProposal,
  validateDecision,
  validateGoal,
  validateMemoryEntry,
  validateWorkflowNode,
  validateWorkflowRun,
  type ActionProposal,
  type Decision,
  type Goal,
  type MemoryEntry,
  type WorkflowNode,
  type WorkflowRun,
} from "./types-agent-os.js";

describe("Agent OS shared contracts", () => {
  it("validates a goal with measurable guardrails", () => {
    const goal: Goal = {
      id: 1,
      organizationId: 10,
      storeId: 20,
      skuId: 30,
      type: "bsr",
      metric: "bsr_rank",
      targetValue: 20,
      currentValue: 37,
      deadline: "2026-09-01",
      priority: "P0",
      status: "active",
      constraints: [
        { metric: "gross_margin", operator: "gte", value: 25, unit: "percent" },
        { metric: "inventory_coverage_days", operator: "gte", value: 25, unit: "days" },
      ],
    };

    expect(validateGoal(goal)).toEqual({ valid: true, errors: [] });
    expect(isGoal(goal)).toBe(true);
    expect(validateGoal({ ...goal, constraints: [{ ...goal.constraints[0], operator: "between" }] })).toMatchObject({
      valid: false,
      errors: ["constraints[0].upperValue is required for between"],
    });
  });

  it("keeps memory entries suitable for decision and outcome learning", () => {
    const entry: MemoryEntry = {
      id: 2,
      organizationId: 10,
      scope: "decision",
      kind: "outcome",
      subjectId: "B0TESTASIN",
      context: { action: "increase_exact_budget", before: 100, after: 140 },
      expectedResult: { rank: 12 },
      actualResult: { rank: 11 },
      conclusion: "Effective",
      confidence: 0.86,
      tags: ["ads", "rank"],
      createdAt: "2026-08-13T00:00:00.000Z",
    };

    expect(validateMemoryEntry(entry).valid).toBe(true);
    expect(isMemoryEntry({ ...entry, confidence: 1.1 })).toBe(false);
  });

  it("classifies the roadmap confidence boundaries and rejects invalid scores", () => {
    expect(classifyConfidence(0.9)).toBe("high");
    expect(classifyConfidence(0.7)).toBe("medium");
    expect(classifyConfidence(0.69)).toBe("low");
    expect(assessConfidence(0.69)).toMatchObject({ level: "low", automaticExecutionEligible: false });
    expect(() => classifyConfidence(-0.01)).toThrow(RangeError);
    expect(() => classifyConfidence(1.01)).toThrow(RangeError);
  });

  it("gates automatic execution by confidence, risk, and approval", () => {
    expect(canAutoExecute(0.86, "low", false)).toBe(true);
    expect(evaluateAutoExecution(0.69, "low", false)).toMatchObject({ allowed: false, reason: "low_confidence" });
    expect(evaluateAutoExecution(0.95, "medium", false)).toMatchObject({
      allowed: false,
      reason: "risk_requires_approval",
    });
    expect(evaluateAutoExecution(0.95, "low", true)).toMatchObject({
      allowed: false,
      reason: "approval_required",
    });
  });

  it("validates decisions and requires approval for non-eligible recommendations", () => {
    const decision: Decision = {
      id: 3,
      organizationId: 10,
      issue: "Organic rank dropped from #8 to #21",
      rootCauses: ["Ad impressions fell"],
      evidence: ["ads-report-2026-08-13"],
      options: [
        {
          id: "increase-budget",
          label: "Increase exact campaign budget",
          rationale: "Restore lost impression share",
          expectedImpact: { rank: "#12" },
          riskLevel: "medium",
        },
      ],
      recommendedOption: "increase-budget",
      expectedImpact: { rank: "#12" },
      risk: "medium",
      confidence: 0.86,
      constraints: [],
      requiredApproval: true,
      createdAt: "2026-08-13T00:00:00.000Z",
    };

    expect(validateDecision(decision).valid).toBe(true);
    expect(isDecision({ ...decision, requiredApproval: false })).toBe(false);
  });

  it("covers workflow node types and validates a workflow run with actions", () => {
    const node: WorkflowNode = {
      id: "freshness-check",
      type: "DATA_VALIDATE",
      name: "Freshness check",
      config: { maxAgeHours: 24 },
      nextNodeIds: ["analysis"],
    };
    const action: ActionProposal = {
      id: "action-1",
      organizationId: 10,
      type: "RECOLLECT_DATA",
      targetType: "keyword",
      targetId: "ice-maker",
      currentValue: null,
      proposedValue: { reason: "stale" },
      reason: "Refresh stale evidence before analysis",
      evidence: ["freshness-check"],
      expectedImpact: { freshness: "fresh" },
      riskLevel: "low",
      confidence: 0.92,
      requiresApproval: false,
      status: "proposed",
      idempotencyKey: "run-1:recollect:ice-maker",
    };
    const run: WorkflowRun = {
      id: "run-1",
      workflowId: "rank-drop-investigation",
      triggerType: "event",
      triggerSource: "RANK_DROP_EVENT",
      status: "running",
      startedAt: "2026-08-13T00:00:00.000Z",
      completedAt: null,
      currentNode: node.id,
      evidence: ["rank-event-1"],
      plan: ["Check freshness", "Collect evidence", "Rank root causes"],
      actions: [action],
      result: null,
    };

    expect(validateWorkflowNode(node).valid).toBe(true);
    expect(validateWorkflowRun(run).valid).toBe(true);
    expect(isWorkflowNode(node)).toBe(true);
    expect(validateWorkflowRun({ ...run, actions: [{ ...action, requiresApproval: true, status: "approved" }] }).valid).toBe(true);
  });

  it("blocks an action proposal that claims unsafe automatic execution", () => {
    const proposal: ActionProposal = {
      id: "action-2",
      organizationId: 10,
      type: "UPDATE_PRICE",
      targetType: "sku",
      targetId: "sku-1",
      currentValue: 199,
      proposedValue: 179,
      reason: "Respond to a competitor price drop",
      evidence: [{ id: "evidence-1", source: "serp", summary: "Competitor price changed", observedAt: "2026-08-13" }],
      expectedImpact: { conversion: "increase" },
      riskLevel: "high",
      confidence: 0.95,
      requiresApproval: false,
      status: "proposed",
      idempotencyKey: "run-2:update-price:sku-1",
    };

    expect(validateActionProposal(proposal).valid).toBe(false);
    expect(isActionProposal(proposal)).toBe(false);
    expect(validateActionProposal({ ...proposal, requiresApproval: true }).valid).toBe(true);
  });
});
