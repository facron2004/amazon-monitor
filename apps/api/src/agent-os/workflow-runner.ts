import {
  deserializeWorkflowSnapshot,
  getWorkflowTemplate,
  listWorkflowTemplates,
  resumeWorkflow,
  runWorkflow,
  type WorkflowResumeInput,
  type WorkflowRunSnapshot,
} from "@amazon-monitor/agent";
import type { JsonObject, JsonValue, MemoryEntry, ActionProposal, WorkflowRun } from "./types.js";
import { collectCurrentDataQualityEvidence } from "./data-quality-adapter.js";
import type { Store } from "../store.js";

export interface StartWorkflowRunInput {
  organizationId: number;
  workflowId: string;
  triggerType: string;
  triggerSource?: string | null;
  input: JsonValue;
  context?: JsonObject;
  idempotencyKey?: string;
}

export interface ResumeWorkflowRunInput {
  organizationId: number;
  runId: number;
  input?: WorkflowResumeInput;
}

export interface WorkflowRunExecutionResult {
  run: WorkflowRun;
  snapshot: WorkflowRunSnapshot;
  actionProposals: ActionProposal[];
  memories: MemoryEntry[];
}

export class AgentOsWorkflowRunner {
  public constructor(private readonly store: Store) {}

  public listTemplates(): readonly { id: string; nodeCount: number }[] {
    return listWorkflowTemplates().map((template) => ({
      id: template.id,
      nodeCount: Array.isArray(template.nodes)
        ? template.nodes.length
        : Object.keys(template.nodes).length,
    }));
  }

  public async start(input: StartWorkflowRunInput): Promise<WorkflowRunExecutionResult> {
    const template = getWorkflowTemplate(input.workflowId);
    if (!template) throw runnerError(404, `Unknown workflow template ${input.workflowId}`);

    const run = this.store.agentOs.createWorkflowRun({
      organizationId: input.organizationId,
      workflowId: input.workflowId,
      triggerType: input.triggerType,
      triggerSource: input.triggerSource ?? "agent-os",
      status: "PENDING",
      context: input.context ?? {},
      idempotencyKey: input.idempotencyKey,
    });
    if (run.snapshot !== null) {
      return this.withArtifacts(run, deserializeWorkflowSnapshot(JSON.stringify(run.snapshot)));
    }

    const dataQuality = collectCurrentDataQualityEvidence(this.store, input.organizationId);
    const runtimeInput = injectDataQualityEvidence(input.input, dataQuality);
    const snapshot = await runWorkflow(template, runtimeInput, {
      runId: `agent-os-run-${run.id}`,
      triggerType: input.triggerType,
      triggerSource: input.triggerSource ?? "agent-os",
      context: input.context,
    });
    const persisted = this.persistSnapshot(run, snapshot);
    return this.withArtifacts(persisted, snapshot);
  }

  public async resume(input: ResumeWorkflowRunInput): Promise<WorkflowRunExecutionResult> {
    const run = this.store.agentOs.getWorkflowRun(input.runId, input.organizationId);
    if (!run) throw runnerError(404, "Workflow run not found");
    if (run.snapshot === null) throw runnerError(409, "Workflow run has no resumable snapshot");
    const template = getWorkflowTemplate(run.workflowId);
    if (!template) throw runnerError(422, `Unknown workflow template ${run.workflowId}`);

    const dataQuality = collectCurrentDataQualityEvidence(this.store, input.organizationId);
    if (!dataQuality.evidenceGate.allowed) {
      throw runnerError(
        409,
        `Data quality gate blocked workflow resume: ${dataQuality.evidenceGate.reason} (${dataQuality.report.status})`,
      );
    }
    const snapshot = deserializeWorkflowSnapshot(JSON.stringify(run.snapshot));
    const runtimeInput = injectDataQualityEvidence(
      toJsonValue(snapshot.input, "workflow snapshot input"),
      dataQuality,
    );
    snapshot.input = runtimeInput;
    if (isJsonObject(runtimeInput)) {
      snapshot.data = { ...snapshot.data, dataQuality: runtimeInput.dataQuality };
      snapshot.context = snapshot.data;
    }
    const resumed = await resumeWorkflow(template, snapshot, input.input ?? {});
    const persisted = this.persistSnapshot(run, resumed);
    return this.withArtifacts(persisted, resumed);
  }

  private persistSnapshot(run: WorkflowRun, snapshot: WorkflowRunSnapshot): WorkflowRun {
    const updated = this.store.agentOs.updateWorkflowRun(run.id, run.organizationId, {
      status: toPersistedStatus(snapshot.status),
      startedAt: snapshot.startedAt,
      completedAt: snapshot.completedAt,
      currentNode: snapshot.currentNodeId,
      context: toJsonObject(snapshot.context, "workflow snapshot context"),
      evidence: toJsonValue(snapshot.evidence, "workflow snapshot evidence"),
      plan: toNullableJsonValue(snapshot.plan, "workflow snapshot plan"),
      actions: toJsonValue(snapshot.actions, "workflow snapshot actions"),
      result: toNullableJsonValue(snapshot.result, "workflow snapshot result"),
      snapshot: toJsonValue(snapshot, "workflow snapshot"),
      errorMessage: snapshot.error,
      expectedVersion: run.version,
    });
    if (!updated) throw runnerError(409, "Workflow run version conflict; refresh before resuming");
    return updated;
  }

  private withArtifacts(run: WorkflowRun, snapshot: WorkflowRunSnapshot): WorkflowRunExecutionResult {
    const actionProposals = this.persistActionProposals(run, snapshot);
    const memories = this.persistMemoryCandidates(run, snapshot);
    return { run, snapshot, actionProposals, memories };
  }

  private persistActionProposals(run: WorkflowRun, snapshot: WorkflowRunSnapshot): ActionProposal[] {
    const outputs = snapshot.actions
      .map((value) => asJsonObject(value))
      .filter((value): value is JsonObject => value !== null && value.kind === "ACTION_PROPOSAL");
    return outputs.map((proposal, index) => this.store.agentOs.createActionProposal({
      organizationId: run.organizationId,
      workflowRunId: run.id,
      type: typeof proposal.proposalType === "string" ? proposal.proposalType : "WORKFLOW_ACTION_PROPOSAL",
      targetType: "WORKFLOW_RUN",
      targetId: run.id,
      proposedValue: proposal,
      reason: `Workflow ${run.workflowId} generated a proposal requiring review`,
      evidence: toJsonValue(snapshot.evidence, "workflow action evidence"),
      expectedImpact: null,
      riskLevel: "HIGH",
      confidence: 1,
      requiresApproval: true,
      idempotencyKey: `workflow-run:${run.id}:action:${index}`,
    }));
  }

  private persistMemoryCandidates(run: WorkflowRun, snapshot: WorkflowRunSnapshot): MemoryEntry[] {
    const candidates = Object.values(snapshot.outputs)
      .map((value) => asJsonObject(value))
      .filter((value): value is JsonObject => value !== null && value.kind === "MEMORY_CANDIDATE");
    return candidates.map((candidate, index) => this.store.agentOs.createMemoryEntry({
      organizationId: run.organizationId,
      memoryType: "DECISION",
      subjectType: "WORKFLOW_RUN",
      subjectId: run.id,
      title: typeof candidate.topic === "string" ? candidate.topic : `Workflow ${run.workflowId} memory candidate`,
      content: candidate,
      tags: ["agent-os", run.workflowId],
      confidence: 1,
      sourceWorkflowRunId: run.id,
      idempotencyKey: `workflow-run:${run.id}:memory:${index}`,
    }));
  }
}

function injectDataQualityEvidence(
  input: JsonValue,
  evidence: ReturnType<typeof collectCurrentDataQualityEvidence>,
): JsonValue {
  const dataQuality: JsonObject = {
    status: evidence.report.status,
    score: evidence.report.score,
    checkedAt: evidence.checkedAt,
    refreshRequired: evidence.refreshRequired,
    evidenceGate: {
      allowed: evidence.evidenceGate.allowed,
      action: evidence.evidenceGate.action,
      reason: evidence.evidenceGate.reason,
      status: evidence.evidenceGate.status,
    },
    evidenceRefs: evidence.evidenceRefs.map((reference) => ({
      id: reference.id,
      source: reference.source,
      status: reference.status,
      observedAt: reference.observedAt,
    })),
  };
  if (isJsonObject(input)) return { ...input, dataQuality };
  return { value: input, dataQuality };
}

function toPersistedStatus(status: WorkflowRunSnapshot["status"]): WorkflowRun["status"] {
  if (status === "running") return "RUNNING";
  if (status === "waiting") return "WAITING";
  if (status === "paused") return "PAUSED";
  if (status === "completed") return "COMPLETED";
  return "FAILED";
}

function toJsonValue(value: unknown, field: string): JsonValue {
  if (value === undefined) throw runnerError(422, `${field} is not JSON serializable`);
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw runnerError(422, `${field} is not JSON serializable`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw runnerError(422, `${field} is not valid JSON`);
  }
  if (!isJsonValue(parsed)) throw runnerError(422, `${field} is not valid JSON`);
  return parsed as JsonObject;
}

function toNullableJsonValue(value: unknown, field: string): JsonValue | null {
  return value === null || value === undefined ? null : toJsonValue(value, field);
}

function toJsonObject(value: unknown, field: string): JsonObject {
  const parsed = toJsonValue(value, field);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw runnerError(422, `${field} must be a JSON object`);
  }
  return parsed;
}

function asJsonObject(value: unknown): JsonObject | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return isJsonValue(value) ? value as JsonObject : null;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}

function runnerError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}
