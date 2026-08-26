import { describe, expect, it } from "vitest";
import { WorkflowRuntime } from "./workflow-runtime.js";
import {
  buildSupervisorPlan,
  buildSupervisorWorkflow,
  createSupervisorSkillRegistry,
  executeSupervisorPlan,
  type SupervisorSkill,
} from "./supervisor.js";

const trustedChecks = [
  { source: "ads", ageHours: 2, completeness: 1, collectionStatus: "success" as const, mapped: true },
  { source: "keyword", ageHours: 2, completeness: 1, collectionStatus: "success" as const, mapped: true },
];

describe("Operations Supervisor", () => {
  it("selects a bounded skill plan from the request and goal context", () => {
    const plan = buildSupervisorPlan({
      request: "分析广告 ACOS 和关键词排名，给出下一步",
      checkedAt: "2026-08-13T00:00:00.000Z",
      dataChecks: trustedChecks,
      goal: { id: "goal-1", metric: "acos", targetValue: 0.28, currentValue: 0.34, constraints: [] },
    });

    expect(plan.evidenceGate.action).toBe("ANALYZE");
    expect(plan.tasks.map((task) => task.skill)).toEqual(["ads_analyst"]);
    expect(plan.goalId).toBe("goal-1");
  });

  it("blocks stale evidence and proposes refresh instead of analysis", async () => {
    const input = {
      request: "分析竞品价格",
      checkedAt: "2026-08-13T00:00:00.000Z",
      dataChecks: [{ source: "price", ageHours: 72, maxAgeHours: 24, collectionStatus: "success" as const }],
    };
    const plan = buildSupervisorPlan(input);
    const result = await executeSupervisorPlan(input);

    expect(plan.evidenceGate.action).toBe("REFRESH");
    expect(result).toMatchObject({ status: "refresh_required", actionTypes: ["RECOLLECT_DATA"] });
  });

  it("runs registered skills through the workflow runtime and keeps evidence", async () => {
    const customSkill: SupervisorSkill = {
      name: "ads_analyst",
      description: "test skill",
      requiredSources: ["ads"],
      matches: () => true,
      execute: async () => ({
        output: { recommendation: "reduce waste" },
        evidence: [{ id: "ads-1", source: "ads", label: "Ads report" }],
        confidence: 0.88,
      }),
    };
    const registry = createSupervisorSkillRegistry([customSkill]);
    const input = {
      request: "分析广告",
      checkedAt: "2026-08-13T00:00:00.000Z",
      dataChecks: trustedChecks,
    };
    const result = await executeSupervisorPlan(input, registry);
    expect(result.status).toBe("completed");
    expect(result.evidence).toHaveLength(1);
    expect(result.confidence).toBe(0.88);

    const snapshot = await new WorkflowRuntime({ now: () => "2026-08-13T00:00:00.000Z" })
      .run(buildSupervisorWorkflow(input, registry), input);
    expect(snapshot.status).toBe("completed");
    expect(snapshot.evidence).toEqual([{ id: "ads-1", source: "ads", label: "Ads report" }]);
  });
});
