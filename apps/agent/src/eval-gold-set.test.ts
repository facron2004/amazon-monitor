import { describe, expect, it } from "vitest";
import {
  agentGoldTargets,
  agentGoldTasks,
  measureAgentGoldResults,
} from "./eval-gold-set.js";

describe("Agent gold evaluation contract", () => {
  it("covers at least 30 evidence-first tasks with freshness gating", () => {
    expect(agentGoldTasks).toHaveLength(30);
    expect(new Set(agentGoldTasks.map((task) => task.id)).size).toBe(30);
    expect(agentGoldTasks.every((task) =>
      task.expectedTools[0] === "check_data_freshness"
      && task.expectedTools.length >= 2
      && task.stalePolicy === "recollect_only")).toBe(true);
  });

  it("calculates the five PRD acceptance metrics", () => {
    const metrics = measureAgentGoldResults(agentGoldTasks.map(() => ({
      alertValid: true,
      evidenceSupported: true,
      recoverySucceeded: true,
      toolCalls: [{ success: true }, { success: true }],
      unsupportedDeterministic: false,
    })));

    expect(metrics.dataSupportRate).toBeGreaterThanOrEqual(agentGoldTargets.dataSupportRate);
    expect(metrics.unsupportedConclusionRate).toBeLessThanOrEqual(
      agentGoldTargets.unsupportedConclusionRate,
    );
    expect(metrics.highPriorityAlertValidityRate).toBeGreaterThanOrEqual(
      agentGoldTargets.highPriorityAlertValidityRate,
    );
    expect(metrics.toolSuccessRate).toBeGreaterThanOrEqual(agentGoldTargets.toolSuccessRate);
    expect(metrics.taskRecoveryRate).toBeGreaterThanOrEqual(agentGoldTargets.taskRecoveryRate);
  });
});
