import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentOsStore } from "./store.js";

const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function openStore() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  return createAgentOsStore(db);
}

describe("Agent OS SQLite adapter", () => {
  it("scopes goals by organization and de-duplicates idempotent writes", () => {
    const store = openStore();
    const first = store.createGoal({
      organizationId: 1,
      type: "bsr",
      metric: "bsr_rank",
      targetValue: 20,
      currentValue: 37,
      constraints: { grossMarginMin: 25 },
      idempotencyKey: "goal:bsr:sku-1",
    });
    const duplicate = store.createGoal({
      organizationId: 1,
      type: "bsr",
      metric: "bsr_rank",
      targetValue: 10,
      idempotencyKey: "goal:bsr:sku-1",
    });

    expect(duplicate).toEqual(first);
    expect(store.listGoals({ organizationId: 1, limit: 10 })).toHaveLength(1);
    expect(store.listGoals({ organizationId: 2, limit: 10 })).toEqual([]);
    expect(store.updateGoal(first.id, 1, { currentValue: 29, expectedVersion: first.version })?.currentValue).toBe(29);
    expect(store.updateGoal(first.id, 1, { currentValue: 18, expectedVersion: first.version })).toBeNull();
    expect(store.updateGoal(first.id, 1, { expectedVersion: first.version })).toBeNull();
    expect(store.updateGoal(first.id, 1, { expectedVersion: 2 })).toMatchObject({ id: first.id, version: 2 });
  });

  it("persists memory, workflow runs, and action proposals with idempotency", () => {
    const store = openStore();
    const memory = store.createMemoryEntry({
      organizationId: 1,
      memoryType: "DECISION",
      subjectType: "sku",
      subjectId: "B0TESTASIN",
      content: { action: "increase_budget", outcome: "effective" },
      tags: ["ads", "rank"],
      confidence: 0.86,
      idempotencyKey: "memory:sku:B0TESTASIN:2026-08-13",
    });
    const run = store.createWorkflowRun({
      organizationId: 1,
      workflowId: "rank-drop-investigation",
      triggerType: "event",
      triggerSource: "RANK_DROP_EVENT",
      context: { asin: "B0TESTASIN" },
      idempotencyKey: "workflow:rank-drop:2026-08-13:B0TESTASIN",
    });
    const proposal = store.createActionProposal({
      organizationId: 1,
      workflowRunId: run.id,
      type: "GENERATE_ADS_CHANGESET",
      targetType: "sku",
      targetId: "B0TESTASIN",
      proposedValue: { budget: 140 },
      reason: "Restore lost impression share",
      evidence: { source: "ads", delta: -0.45 },
      expectedImpact: { organicRank: "#12" },
      riskLevel: "MEDIUM",
      idempotencyKey: "action:ads-changeset:run-1",
    });

    expect(store.getMemoryEntry(memory.id, 1)?.tags).toEqual(["ads", "rank"]);
    expect(store.getWorkflowRun(run.id, 1)?.context).toEqual({ asin: "B0TESTASIN" });
    expect(store.listActionProposals({ organizationId: 1, workflowRunId: run.id, limit: 10 })).toEqual([proposal]);
    expect(store.createActionProposal({
      organizationId: 1,
      workflowRunId: run.id,
      type: "GENERATE_ADS_CHANGESET",
      targetType: "sku",
      proposedValue: { budget: 200 },
      reason: "duplicate",
      evidence: {},
      riskLevel: "HIGH",
      idempotencyKey: "action:ads-changeset:run-1",
    })).toEqual(proposal);

    const otherOrgGoal = store.createGoal({
      organizationId: 2,
      type: "sales",
      metric: "revenue",
      targetValue: 100,
      idempotencyKey: "goal:other-org",
    });
    expect(() => store.createActionProposal({
      organizationId: 1,
      goalId: otherOrgGoal.id,
      type: "CREATE_TASK",
      targetType: "sku",
      proposedValue: null,
      reason: "cross organization reference",
      evidence: null,
      riskLevel: "LOW",
      idempotencyKey: "action:cross-org",
    })).toThrow(/current organization/);

    const highRisk = store.createActionProposal({
      organizationId: 1,
      type: "UPDATE_PRICE",
      targetType: "sku",
      proposedValue: { price: 120 },
      reason: "price review",
      evidence: {},
      riskLevel: "HIGH",
      requiresApproval: false,
      idempotencyKey: "action:high-risk",
    });
    expect(highRisk.requiresApproval).toBe(true);
    expect(() => store.updateActionProposal(highRisk.id, 1, { status: "EFFECTIVE" })).toThrow(/Invalid action status transition/);
  });
});
