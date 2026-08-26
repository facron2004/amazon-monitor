import { describe, expect, it } from "vitest";
import {
  deserializeWorkflowSnapshot,
  serializeWorkflowSnapshot,
  WorkflowRuntime,
  type WorkflowDefinition,
} from "./workflow-runtime.js";

function runtime(): WorkflowRuntime {
  return new WorkflowRuntime({ now: () => "2026-08-13T00:00:00.000Z" });
}

describe("WorkflowRuntime", () => {
  it("runs a multi-step flow and merges evidence into a resumable snapshot", async () => {
    const definition: WorkflowDefinition = {
      id: "rank-drop-investigation",
      nodes: [
        { id: "trigger", type: "TRIGGER", next: "fetch" },
        {
          id: "fetch",
          type: "DATA_FETCH",
          handler: () => ({
            data: { adsImpressionDelta: -0.45 },
            evidence: [{ id: "ads-1", kind: "ads", label: "Ads report" }],
          }),
          next: "validate",
        },
        { id: "validate", type: "DATA_VALIDATE", handler: () => ({ valid: true }), next: "action" },
        { id: "action", type: "ACTION", handler: () => ({ output: { type: "CREATE_TASK" } }) },
      ],
    };

    const snapshot = await runtime().run(definition, { rankDrop: 13 });

    expect(snapshot.status).toBe("completed");
    expect(snapshot.completedNodeIds).toEqual(["trigger", "fetch", "validate", "action"]);
    expect(snapshot.evidence).toEqual([{ id: "ads-1", kind: "ads", label: "Ads report" }]);
    expect(snapshot.actions).toEqual([{ type: "CREATE_TASK" }]);
    expect(deserializeWorkflowSnapshot(serializeWorkflowSnapshot(snapshot)).runId).toBe(snapshot.runId);
  });

  it("takes a condition branch and records the unselected branch as skipped", async () => {
    const definition: WorkflowDefinition = {
      id: "conditional-flow",
      nodes: [
        { id: "trigger", type: "TRIGGER", next: "condition" },
        {
          id: "condition",
          type: "CONDITION",
          condition: () => false,
          onTrue: "true-branch",
          onFalse: "false-branch",
        },
        { id: "true-branch", type: "ACTION", handler: () => ({ output: "true" }) },
        { id: "false-branch", type: "ACTION", handler: () => ({ output: "false" }) },
      ],
    };

    const snapshot = await runtime().run(definition, null);

    expect(snapshot.status).toBe("completed");
    expect(snapshot.outputs["false-branch"]).toBe("false");
    expect(snapshot.skippedNodeIds).toContain("true-branch");
    expect(snapshot.outputs["true-branch"]).toBeUndefined();
  });

  it("pauses for human approval and resumes into the action node", async () => {
    const definition: WorkflowDefinition = {
      id: "approval-flow",
      nodes: [
        { id: "approval", type: "HUMAN_APPROVAL", next: "action" },
        { id: "action", type: "ACTION", handler: () => ({ output: "executed" }) },
      ],
    };

    const paused = await runtime().run(definition, null);
    expect(paused.status).toBe("paused");
    expect(paused.pending).toMatchObject({ kind: "approval", nodeId: "approval" });

    const completed = await runtime().resume(definition, paused, { approval: "approved" });
    expect(completed.status).toBe("completed");
    expect(completed.data["approval:approval"]).toMatchObject({ decision: "approved" });
    expect(completed.outputs.action).toBe("executed");
  });

  it("fails a node and can recover by retrying the failed node", async () => {
    let calls = 0;
    const definition: WorkflowDefinition = {
      id: "recoverable-flow",
      nodes: [{
        id: "fetch",
        type: "DATA_FETCH",
        handler: () => {
          calls += 1;
          if (calls === 1) throw new Error("temporary failure");
          return { output: "recovered" };
        },
      }],
    };

    const failed = await runtime().run(definition, null);
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("temporary failure");

    const recovered = await runtime().resume(definition, failed, { retryFailed: true });
    expect(recovered.status).toBe("completed");
    expect(recovered.outputs.fetch).toBe("recovered");
  });

  it("fails instead of silently completing a node without a handler", async () => {
    const snapshot = await runtime().run({
      id: "missing-handler",
      nodes: [{ id: "action", type: "ACTION" }],
    }, null);

    expect(snapshot.status).toBe("failed");
    expect(snapshot.error).toContain("No handler registered");
  });

  it("rejects malformed snapshots before resume", async () => {
    const definition: WorkflowDefinition = {
      id: "snapshot-validation",
      nodes: [{ id: "action", type: "ACTION", handler: () => ({ output: "ok" }) }],
    };
    const snapshot = await runtime().run(definition, null);
    const malformed = JSON.parse(serializeWorkflowSnapshot(snapshot)) as Record<string, unknown>;
    delete malformed.nodeStates;

    expect(() => deserializeWorkflowSnapshot(JSON.stringify(malformed))).toThrow(/Invalid workflow snapshot/);
    await expect(runtime().resume(definition, malformed as never)).rejects.toThrow(/Invalid workflow snapshot/);
  });
});
