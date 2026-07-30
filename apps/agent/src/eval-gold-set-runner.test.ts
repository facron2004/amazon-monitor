import type { AgentRunOutput } from "@amazon-monitor/shared";
import { describe, expect, it } from "vitest";
import {
  evaluateAgentGoldExecution,
  runAgentGoldEvaluation,
  type AgentGoldTask,
} from "./eval-gold-set.js";

const task: AgentGoldTask = {
  id: "test",
  prompt: "Investigate",
  expectedTools: ["check_data_freshness", "get_asin_history"],
  stalePolicy: "recollect_only",
};

describe("Agent gold evaluation runner", () => {
  it("scores required tool coverage and cited conclusions", async () => {
    const evaluation = await runAgentGoldEvaluation(async () => ({
      output: output("fresh", 0.82, "create_task"),
      toolCalls: [
        { toolName: "check_data_freshness", status: "completed" },
        { toolName: "get_asin_history", status: "completed" },
      ],
      alertValid: true,
      recoverySucceeded: true,
    }), [task]);

    expect(evaluation.tasks[0]).toMatchObject({
      missingTools: [],
      result: {
        evidenceSupported: true,
        unsupportedDeterministic: false,
      },
    });
    expect(evaluation.metrics).toEqual({
      dataSupportRate: 1,
      unsupportedConclusionRate: 0,
      highPriorityAlertValidityRate: 1,
      toolSuccessRate: 1,
      taskRecoveryRate: 1,
    });
  });

  it("flags stale deterministic output and a missing required tool", () => {
    const evaluation = evaluateAgentGoldExecution(task, {
      output: output("stale", 0.8, "monitor_asin"),
      toolCalls: [
        { toolName: "check_data_freshness", status: "completed" },
        { toolName: "get_asin_history", status: "failed" },
      ],
    });

    expect(evaluation).toMatchObject({
      missingTools: ["get_asin_history"],
      result: {
        evidenceSupported: false,
        unsupportedDeterministic: true,
        toolCalls: [{ success: true }, { success: false }],
      },
    });
  });
});

function output(
  freshness: AgentRunOutput["freshness"]["status"],
  confidence: number,
  actionType: AgentRunOutput["recommendedActions"][number]["type"],
): AgentRunOutput {
  return {
    summary: "Summary",
    conclusions: [{
      text: "Conclusion",
      scope: { asin: "B000TEST01" },
      evidenceRefs: [{ kind: "snapshot", id: "1", label: "Evidence" }],
      snapshotRefs: [{ kind: "snapshot", id: "1", label: "Snapshot" }],
      confidence,
    }],
    freshness: {
      status: freshness,
      checkedAt: "2026-07-29T00:00:00.000Z",
      maxAgeHours: 24,
      oldestEvidenceAt: "2026-07-29T00:00:00.000Z",
      staleSources: freshness === "fresh" ? [] : ["category"],
      dataGaps: [],
      warnings: [],
    },
    riskNotes: [],
    recommendedActions: [{
      type: actionType,
      title: "Action",
      rationale: "Rationale",
      riskLevel: "L2",
      requiresApproval: true,
      payload: {},
    }],
  };
}
