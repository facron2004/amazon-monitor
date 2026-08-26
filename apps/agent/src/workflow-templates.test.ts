import { describe, expect, it } from "vitest";
import {
  getWorkflowTemplate,
  listWorkflowTemplates,
  workflowTemplateIds,
} from "./workflow-templates.js";
import {
  resumeWorkflow,
  runWorkflow,
  type WorkflowDefinition,
} from "./workflow-runtime.js";

const runOptions = {
  now: () => "2026-08-14T00:00:00.000Z",
  runId: "workflow-template-test",
};

const trustedInput = {
  dataQualityStatus: "TRUSTED",
};

describe("workflow templates", () => {
  it("lists and retrieves the roadmap templates including ranking-jump analysis", () => {
    const templates = listWorkflowTemplates();

    expect(templates.map((template) => template.id)).toEqual(workflowTemplateIds);
    expect(new Set(templates.map((template) => template.id)).size).toBe(7);
    expect(getWorkflowTemplate("rank-drop-investigation")).toBe(templates[0]);
    expect(getWorkflowTemplate("ranking-jump-analysis")).toMatchObject({ id: "ranking-jump-analysis" });
    expect(getWorkflowTemplate("missing-template")).toBeUndefined();
  });

  it.each(workflowTemplateIds)("runs %s through approval and proposal review", async (id) => {
    const template = getRequiredTemplate(id);
    const nodeTypes = getNodes(template).map((node) => node.type);

    expect(nodeTypes).toEqual([
      "TRIGGER",
      "DATA_VALIDATE",
      "AGENT_CALL",
      "DECISION",
      "HUMAN_APPROVAL",
      "ACTION",
      "REVIEW",
      "MEMORY_WRITE",
    ]);
    expect(getNodes(template).some((node) => node.type === "HUMAN_APPROVAL")).toBe(true);

    const paused = await runWorkflow(template, trustedInput, runOptions);
    expect(paused.status).toBe("paused");
    expect(paused.pending).toMatchObject({ kind: "approval", nodeId: "human-approval" });
    expect(paused.completedNodeIds).toEqual(["trigger", "data-validate", "agent-analysis", "decision"]);

    const completed = await resumeWorkflow(template, paused, { approval: "approved" }, {
      now: runOptions.now,
    });
    expect(completed.status).toBe("completed");
    expect(completed.completedNodeIds).toContain("review");
    expect(completed.completedNodeIds).toContain("memory-write");
    expect(completed.actions).toHaveLength(1);
    expect(completed.actions[0]).toMatchObject({
      kind: "ACTION_PROPOSAL",
      execution: "proposal-only",
      writesApplied: false,
      requiresHumanApproval: true,
    });
  });

  it.each(workflowTemplateIds)("blocks %s when the data quality gate is stale", async (id) => {
    const failed = await runWorkflow(getRequiredTemplate(id), { dataQualityStatus: "STALE" }, runOptions);

    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("Data quality gate blocked workflow: STALE");
    expect(failed.completedNodeIds).toEqual(["trigger"]);
    expect(failed.nodeStates["data-validate"]).toBe("failed");
  });
});

function getRequiredTemplate(id: string): WorkflowDefinition {
  const template = getWorkflowTemplate(id);
  if (!template) throw new Error(`Missing workflow template ${id}`);
  return template;
}

function getNodes(template: WorkflowDefinition): readonly { type: string }[] {
  if (!Array.isArray(template.nodes)) throw new Error("Workflow template nodes must be an array");
  return template.nodes;
}
