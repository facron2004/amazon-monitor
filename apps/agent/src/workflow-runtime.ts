/**
 * A small, deterministic workflow engine for the agent supervisor.
 *
 * The runtime deliberately knows nothing about HTTP, an LLM, or a database.
 * Side effects are injected as node handlers, which keeps a run easy to test
 * and makes the snapshot safe to persist and resume elsewhere.
 */

export const workflowNodeTypes = [
  "TRIGGER",
  "DATA_FETCH",
  "DATA_VALIDATE",
  "AGENT_CALL",
  "TOOL_CALL",
  "CONDITION",
  "DECISION",
  "HUMAN_APPROVAL",
  "ACTION",
  "WAIT",
  "REVIEW",
  "MEMORY_WRITE",
  "NOTIFICATION",
] as const;

export type WorkflowNodeType = (typeof workflowNodeTypes)[number];

export const workflowRunStatuses = [
  "running",
  "waiting",
  "paused",
  "completed",
  "failed",
] as const;

export type WorkflowRunStatus = (typeof workflowRunStatuses)[number];
export type WorkflowNodeState =
  | "running"
  | "waiting"
  | "paused"
  | "completed"
  | "failed"
  | "skipped";
export type WorkflowApprovalDecision = "approved" | "rejected" | "modified" | "expired";

export interface WorkflowEvidenceRef {
  id: string;
  kind?: string;
  label?: string;
  observedAt?: string | null;
  [key: string]: unknown;
}

export interface WorkflowNodeResult {
  output?: unknown;
  data?: Record<string, unknown>;
  evidence?: readonly WorkflowEvidenceRef[];
  evidenceRefs?: readonly WorkflowEvidenceRef[];
  nextNodeId?: string | null;
  decision?: string | boolean;
  condition?: boolean;
  valid?: boolean;
  status?: "continue" | "waiting" | "paused";
  message?: string;
}

export interface WorkflowNodeContext {
  runId: string;
  workflowId: string;
  input: unknown;
  node: Readonly<WorkflowNode>;
  data: Readonly<Record<string, unknown>>;
  outputs: Readonly<Record<string, unknown>>;
  evidence: readonly WorkflowEvidenceRef[];
  snapshot: Readonly<WorkflowRunSnapshot>;
}

export type WorkflowHandlerValue = WorkflowNodeResult | unknown;
export type WorkflowNodeHandler =
  | ((context: WorkflowNodeContext) => WorkflowHandlerValue | Promise<WorkflowHandlerValue>)
  | ((input: unknown, context: WorkflowNodeContext) => WorkflowHandlerValue | Promise<WorkflowHandlerValue>);

export type WorkflowCondition =
  | ((context: WorkflowNodeContext) => boolean | Promise<boolean>)
  | ((input: unknown, context: WorkflowNodeContext) => boolean | Promise<boolean>);

export type WorkflowDecision =
  | ((context: WorkflowNodeContext) => string | boolean | Promise<string | boolean>)
  | ((input: unknown, context: WorkflowNodeContext) => string | boolean | Promise<string | boolean>);

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name?: string;
  next?: string | null;
  onTrue?: string | null;
  onFalse?: string | null;
  branches?: Readonly<Record<string, string>>;
  routes?: Readonly<Record<string, string>>;
  handler?: WorkflowNodeHandler;
  handlerKey?: string;
  condition?: WorkflowCondition;
  predicate?: WorkflowCondition;
  decide?: WorkflowDecision;
  input?: unknown;
  config?: Readonly<Record<string, unknown>>;
}

export interface WorkflowDefinition {
  id: string;
  nodes: readonly WorkflowNode[] | Readonly<Record<string, WorkflowNode>>;
  entryNodeId?: string;
}

export interface WorkflowPending {
  kind: "wait" | "approval";
  nodeId: string;
  reason: string | null;
  requestedAt: string;
}

export interface WorkflowEvent {
  id: string;
  runId: string;
  sequence: number;
  type: string;
  nodeId: string | null;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface WorkflowRunSnapshot {
  schemaVersion: 1;
  id: string;
  runId: string;
  workflowId: string;
  triggerType: string;
  triggerSource: string;
  status: WorkflowRunStatus;
  input: unknown;
  context: Record<string, unknown>;
  data: Record<string, unknown>;
  plan: unknown;
  actions: unknown[];
  result: unknown;
  outputs: Record<string, unknown>;
  evidence: WorkflowEvidenceRef[];
  currentNode: string | null;
  currentNodeId: string | null;
  completedNodeIds: string[];
  skippedNodeIds: string[];
  nodeStates: Record<string, WorkflowNodeState>;
  nodeResults: Record<string, WorkflowNodeResult>;
  pending: WorkflowPending | null;
  error: string | null;
  events: WorkflowEvent[];
  steps: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface WorkflowRuntimeOptions {
  handlers?: Partial<Record<WorkflowNodeType, WorkflowNodeHandler>>;
  namedHandlers?: Readonly<Record<string, WorkflowNodeHandler>>;
  now?: () => string;
  runIdFactory?: () => string;
  maxSteps?: number;
}

export interface WorkflowStartOptions {
  runId?: string;
  triggerType?: string;
  triggerSource?: string;
  context?: Record<string, unknown>;
}

export interface WorkflowResumeInput {
  resume?: boolean;
  continue?: boolean;
  value?: unknown;
  approval?: WorkflowApprovalDecision;
  decision?: WorkflowApprovalDecision;
  approved?: boolean;
  modification?: Record<string, unknown>;
  retryFailed?: boolean;
}

interface NormalizedWorkflowDefinition {
  id: string;
  nodes: WorkflowNode[];
  nodeMap: Map<string, WorkflowNode>;
  entryNodeId: string;
}

interface NormalizedNodeResult {
  result: WorkflowNodeResult;
  raw: unknown;
}

export class WorkflowRuntime {
  private readonly handlers: Partial<Record<WorkflowNodeType, WorkflowNodeHandler>>;
  private readonly namedHandlers: Readonly<Record<string, WorkflowNodeHandler>>;
  private readonly now: () => string;
  private readonly runIdFactory: () => string;
  private readonly maxSteps: number;

  public constructor(options: WorkflowRuntimeOptions = {}) {
    let generatedRunCount = 0;
    this.handlers = options.handlers ?? {};
    this.namedHandlers = options.namedHandlers ?? {};
    this.now = options.now ?? (() => new Date().toISOString());
    this.runIdFactory = options.runIdFactory ?? (() => {
      generatedRunCount += 1;
      return `workflow-run-${generatedRunCount}`;
    });
    this.maxSteps = options.maxSteps ?? 1_000;
    if (!Number.isInteger(this.maxSteps) || this.maxSteps < 1) {
      throw new Error("maxSteps must be a positive integer");
    }
  }

  public async run(
    definition: WorkflowDefinition,
    input: unknown,
    options: WorkflowStartOptions = {},
  ): Promise<WorkflowRunSnapshot> {
    const normalized = normalizeDefinition(definition);
    const startedAt = this.now();
    const runId = options.runId ?? this.runIdFactory();
    const initialData = {
      ...(isRecord(input) ? input : {}),
      ...(options.context ?? {}),
    };
    const snapshot: WorkflowRunSnapshot = {
      schemaVersion: 1,
      id: runId,
      runId,
      workflowId: normalized.id,
      triggerType: options.triggerType ?? "manual",
      triggerSource: options.triggerSource ?? "workflow-runtime",
      status: "running",
      input: input === undefined ? null : input,
      context: initialData,
      data: initialData,
      plan: null,
      actions: [],
      result: null,
      outputs: {},
      evidence: [],
      currentNode: normalized.entryNodeId,
      currentNodeId: normalized.entryNodeId,
      completedNodeIds: [],
      skippedNodeIds: [],
      nodeStates: {},
      nodeResults: {},
      pending: null,
      error: null,
      events: [],
      steps: 0,
      startedAt,
      updatedAt: startedAt,
      completedAt: null,
    };
    appendEvent(snapshot, "run.started", null, {
      workflowId: normalized.id,
      triggerType: snapshot.triggerType,
      triggerSource: snapshot.triggerSource,
    }, this.now);
    return this.execute(normalized, snapshot);
  }

  public async resume(
    definition: WorkflowDefinition,
    snapshot: WorkflowRunSnapshot,
    input: WorkflowResumeInput = {},
  ): Promise<WorkflowRunSnapshot> {
    const normalized = normalizeDefinition(definition);
    assertWorkflowSnapshot(snapshot);
    if (snapshot.workflowId !== normalized.id) {
      throw new Error(`Snapshot belongs to workflow ${snapshot.workflowId}, not ${normalized.id}`);
    }
    validateSnapshotReferences(normalized, snapshot);
    syncCurrentNodeAliases(snapshot);

    if (snapshot.status === "completed") return snapshot;
    if (snapshot.status === "failed") {
      if (!input.retryFailed || snapshot.currentNodeId === null) return snapshot;
      snapshot.status = "running";
      snapshot.error = null;
      snapshot.completedAt = null;
      appendEvent(snapshot, "run.recovery.started", snapshot.currentNodeId, {
        retryNodeId: snapshot.currentNodeId,
      }, this.now);
    } else if (snapshot.pending !== null) {
      appendEvent(snapshot, "run.resumed", snapshot.pending.nodeId, {
        kind: snapshot.pending.kind,
      }, this.now);
      const resolved = this.resolvePending(normalized, snapshot, input);
      if (!resolved || snapshot.error !== null) return snapshot;
    } else if (snapshot.status !== "running") {
      return snapshot;
    }

    return this.execute(normalized, snapshot);
  }

  private async execute(
    definition: NormalizedWorkflowDefinition,
    snapshot: WorkflowRunSnapshot,
  ): Promise<WorkflowRunSnapshot> {
    snapshot.status = "running";
    while (snapshot.currentNodeId !== null) {
      if (snapshot.steps >= this.maxSteps) {
        return failRun(snapshot, null, `Workflow exceeded maxSteps (${this.maxSteps})`, this.now);
      }
      const node = definition.nodeMap.get(snapshot.currentNodeId);
      if (!node) {
        return failRun(snapshot, null, `Unknown current node ${snapshot.currentNodeId}`, this.now);
      }
      snapshot.steps += 1;
      snapshot.nodeStates[node.id] = "running";
      appendEvent(snapshot, "node.started", node.id, { type: node.type }, this.now);

      try {
        const normalized = await this.executeNode(definition, snapshot, node);
        if (normalized.result.status === "waiting" || normalized.result.status === "paused") {
          const kind = normalized.result.status === "paused" || node.type === "HUMAN_APPROVAL"
            ? "approval"
            : "wait";
          return pauseRun(snapshot, node, kind, normalized.result.message ?? null, this.now);
        }
        if (node.type === "WAIT" || node.type === "HUMAN_APPROVAL") {
          const kind = node.type === "HUMAN_APPROVAL" ? "approval" : "wait";
          return pauseRun(snapshot, node, kind, normalized.result.message ?? null, this.now);
        }
        const nextNodeId = this.resolveNextNode(definition, snapshot, node, normalized);
        completeNode(snapshot, node, normalized.result, nextNodeId, this.now);
        if (node.type === "ACTION" && normalized.result.output !== undefined) {
          snapshot.actions.push(normalized.result.output);
        }
      } catch (error) {
        return failRun(snapshot, node.id, errorMessage(error), this.now);
      }
    }

    snapshot.status = "completed";
    snapshot.result = lastOutput(snapshot);
    snapshot.completedAt = this.now();
    appendEvent(snapshot, "run.completed", null, {
      evidenceCount: snapshot.evidence.length,
      completedNodeCount: snapshot.completedNodeIds.length,
    }, this.now);
    return snapshot;
  }

  private async executeNode(
    definition: NormalizedWorkflowDefinition,
    snapshot: WorkflowRunSnapshot,
    node: WorkflowNode,
  ): Promise<NormalizedNodeResult> {
    const context = createNodeContext(snapshot, node);
    if (node.type === "CONDITION") {
      const raw = node.condition ?? node.predicate
        ? await invokeFunction(node.condition ?? node.predicate as WorkflowCondition, context)
        : await this.invokeHandler(node, context);
      const normalized = normalizeNodeResult(raw);
      const condition = normalized.result.condition
        ?? (typeof normalized.raw === "boolean" ? normalized.raw : undefined)
        ?? (typeof normalized.result.output === "boolean" ? normalized.result.output : undefined)
        ?? true;
      normalized.result.condition = condition;
      return normalized;
    }
    if (node.type === "DECISION") {
      const raw = node.decide
        ? await invokeFunction(node.decide, context)
        : await this.invokeHandler(node, context);
      const normalized = normalizeNodeResult(raw);
      if (normalized.result.decision === undefined
        && (typeof normalized.raw === "string" || typeof normalized.raw === "boolean")) {
        normalized.result.decision = normalized.raw;
      }
      return normalized;
    }

    if (node.type === "WAIT" && !this.resolveHandler(node)) {
      return { raw: undefined, result: {} };
    }
    if (node.type === "HUMAN_APPROVAL" && !this.resolveHandler(node)) {
      return { raw: undefined, result: {} };
    }

    const raw = node.type === "TRIGGER" && !this.resolveHandler(node)
      ? { output: snapshot.input }
      : await this.invokeHandler(node, context);
    const normalized = normalizeNodeResult(raw);
    if (node.type === "DATA_VALIDATE"
      && (normalized.raw === false || normalized.result.valid === false)) {
      throw new Error(normalized.result.message ?? "Data validation failed");
    }
    return normalized;
  }

  private async invokeHandler(
    node: WorkflowNode,
    context: WorkflowNodeContext,
  ): Promise<unknown> {
    const handler = this.resolveHandler(node);
    if (!handler) {
      throw new Error(`No handler registered for workflow node ${node.id} (${node.type})`);
    }
    const input = node.input === undefined ? context.input : node.input;
    const handlerContext = input === context.input
      ? context
      : { ...context, input };
    return Promise.resolve(invokeFunction(handler, handlerContext));
  }

  private resolveHandler(node: WorkflowNode): WorkflowNodeHandler | undefined {
    return node.handler
      ?? (node.handlerKey === undefined ? undefined : this.namedHandlers[node.handlerKey])
      ?? this.handlers[node.type];
  }

  private resolveNextNode(
    definition: NormalizedWorkflowDefinition,
    snapshot: WorkflowRunSnapshot,
    node: WorkflowNode,
    normalized: NormalizedNodeResult,
  ): string | null {
    const explicit = normalized.result.nextNodeId;
    if (explicit !== undefined) return validateNextNode(definition, explicit);

    if (node.type === "CONDITION") {
      const condition = normalized.result.condition ?? true;
      const selected = condition ? node.onTrue : node.onFalse;
      markUnselectedBranch(snapshot, node, condition ? "false" : "true", this.now);
      return selected === undefined || selected === null
        ? sequentialNext(definition, node.id)
        : validateNextNode(definition, selected);
    }
    if (node.type === "DECISION") {
      const decision = normalized.result.decision;
      if (decision !== undefined) {
        const key = String(decision);
        const routes = { ...(node.branches ?? {}), ...(node.routes ?? {}) };
        const selected = routes[key]
          ?? (typeof decision === "boolean" ? (decision ? node.onTrue : node.onFalse) : undefined);
        markUnselectedDecisionBranches(snapshot, node, selected, routes, this.now);
        if (selected !== undefined && selected !== null) return validateNextNode(definition, selected);
      }
    }
    return node.next === undefined || node.next === null
      ? sequentialNext(definition, node.id)
      : validateNextNode(definition, node.next);
  }

  private resolvePending(
    definition: NormalizedWorkflowDefinition,
    snapshot: WorkflowRunSnapshot,
    input: WorkflowResumeInput,
  ): boolean {
    const pending = snapshot.pending;
    if (!pending) return true;
    const node = definition.nodeMap.get(pending.nodeId);
    if (!node) return failRun(snapshot, null, `Unknown pending node ${pending.nodeId}`, this.now) === snapshot;

    if (pending.kind === "wait") {
      if (input.resume === false || input.continue === false) return false;
      snapshot.data[`wait:${node.id}`] = input.value ?? true;
      snapshot.context = snapshot.data;
      snapshot.pending = null;
      appendEvent(snapshot, "node.resumed", node.id, { kind: "wait", value: input.value ?? true }, this.now);
      completeNode(snapshot, node, snapshot.nodeResults[node.id] ?? {}, nextAfterResume(definition, node), this.now);
      return true;
    }

    const approval = input.approval ?? input.decision
      ?? (input.approved === undefined ? undefined : input.approved ? "approved" : "rejected");
    if (!approval) return false;
    snapshot.data[`approval:${node.id}`] = {
      decision: approval,
      modification: input.modification ?? null,
    };
    snapshot.context = snapshot.data;
    snapshot.pending = null;
    appendEvent(snapshot, "approval.decided", node.id, {
      decision: approval,
      modification: input.modification ?? null,
    }, this.now);
    if (approval === "rejected" || approval === "expired") {
      return failRun(snapshot, node.id, `Human approval ${approval}`, this.now) === snapshot;
    }
    appendEvent(snapshot, "node.resumed", node.id, { kind: "approval", decision: approval }, this.now);
    completeNode(snapshot, node, {
      output: { decision: approval, modification: input.modification ?? null },
    }, nextAfterResume(definition, node), this.now);
    return true;
  }
}

export async function runWorkflow(
  definition: WorkflowDefinition,
  input: unknown,
  options: WorkflowRuntimeOptions & WorkflowStartOptions = {},
): Promise<WorkflowRunSnapshot> {
  const { runId, triggerType, triggerSource, context, ...runtimeOptions } = options;
  return new WorkflowRuntime(runtimeOptions).run(definition, input, {
    runId,
    triggerType,
    triggerSource,
    context,
  });
}

export async function resumeWorkflow(
  definition: WorkflowDefinition,
  snapshot: WorkflowRunSnapshot,
  input: WorkflowResumeInput = {},
  options: WorkflowRuntimeOptions = {},
): Promise<WorkflowRunSnapshot> {
  return new WorkflowRuntime(options).resume(definition, snapshot, input);
}

export function serializeWorkflowSnapshot(snapshot: WorkflowRunSnapshot): string {
  assertWorkflowSnapshot(snapshot);
  const serialized = JSON.stringify(snapshot);
  if (serialized === undefined) throw new Error("Workflow snapshot is not serializable");
  return serialized;
}

export function deserializeWorkflowSnapshot(serialized: string): WorkflowRunSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("Invalid workflow snapshot JSON");
  }
  assertWorkflowSnapshot(parsed);
  return parsed;
}

function normalizeDefinition(definition: WorkflowDefinition): NormalizedWorkflowDefinition {
  if (!definition.id.trim()) throw new Error("Workflow id is required");
  const nodes = Array.isArray(definition.nodes)
    ? [...definition.nodes]
    : Object.values(definition.nodes);
  if (nodes.length === 0) throw new Error("Workflow must contain at least one node");

  const nodeMap = new Map<string, WorkflowNode>();
  for (const node of nodes) {
    if (!node.id.trim()) throw new Error("Workflow node id is required");
    if (nodeMap.has(node.id)) throw new Error(`Duplicate workflow node ${node.id}`);
    nodeMap.set(node.id, node);
  }
  const entryNodeId = definition.entryNodeId ?? nodes[0]?.id;
  if (!entryNodeId || !nodeMap.has(entryNodeId)) {
    throw new Error(`Unknown workflow entry node ${entryNodeId ?? ""}`);
  }
  for (const node of nodes) {
    for (const target of staticTargets(node)) {
      if (!nodeMap.has(target)) throw new Error(`Node ${node.id} points to unknown node ${target}`);
    }
  }
  return { id: definition.id, nodes, nodeMap, entryNodeId };
}

function validateSnapshotReferences(
  definition: NormalizedWorkflowDefinition,
  snapshot: WorkflowRunSnapshot,
): void {
  const referencedNodeIds = [
    snapshot.currentNodeId,
    snapshot.currentNode,
    snapshot.pending?.nodeId ?? null,
    ...snapshot.completedNodeIds,
    ...snapshot.skippedNodeIds,
    ...Object.keys(snapshot.nodeStates),
    ...Object.keys(snapshot.nodeResults),
  ];
  const invalid = referencedNodeIds.find((nodeId) => nodeId !== null && !definition.nodeMap.has(nodeId));
  if (invalid) throw new Error(`Snapshot references unknown workflow node ${invalid}`);
  if (snapshot.currentNodeId !== snapshot.currentNode) {
    throw new Error("Snapshot current node aliases do not match");
  }
}

function staticTargets(node: WorkflowNode): string[] {
  return [
    node.next,
    node.onTrue,
    node.onFalse,
    ...Object.values(node.branches ?? {}),
    ...Object.values(node.routes ?? {}),
  ].filter((target): target is string => target !== undefined && target !== null);
}

function createNodeContext(
  snapshot: WorkflowRunSnapshot,
  node: WorkflowNode,
): WorkflowNodeContext {
  syncCurrentNodeAliases(snapshot);
  return {
    runId: snapshot.runId,
    workflowId: snapshot.workflowId,
    input: node.input === undefined ? snapshot.input : node.input,
    node,
    data: snapshot.data,
    outputs: snapshot.outputs,
    evidence: snapshot.evidence,
    snapshot,
  };
}

function invokeFunction(
  handler: WorkflowNodeHandler | WorkflowCondition | WorkflowDecision,
  context: WorkflowNodeContext,
): unknown {
  const args: unknown[] = handler.length >= 2 ? [context.input, context] : [context];
  return Reflect.apply(handler, undefined, args);
}

function normalizeNodeResult(raw: unknown): NormalizedNodeResult {
  if (!isRecord(raw) || !isNodeResultRecord(raw)) {
    return { raw, result: { output: raw } };
  }
  const result: WorkflowNodeResult = {};
  if ("output" in raw) result.output = raw.output;
  if (isRecord(raw.data)) result.data = raw.data;
  if (Array.isArray(raw.evidence)) result.evidence = evidenceRefs(raw.evidence);
  if (Array.isArray(raw.evidenceRefs)) result.evidenceRefs = evidenceRefs(raw.evidenceRefs);
  if (typeof raw.nextNodeId === "string" || raw.nextNodeId === null) result.nextNodeId = raw.nextNodeId;
  if (typeof raw.decision === "string" || typeof raw.decision === "boolean") result.decision = raw.decision;
  if (typeof raw.condition === "boolean") result.condition = raw.condition;
  if (typeof raw.valid === "boolean") result.valid = raw.valid;
  if (raw.status === "continue" || raw.status === "waiting" || raw.status === "paused") result.status = raw.status;
  if (typeof raw.message === "string") result.message = raw.message;
  return { raw, result };
}

function isNodeResultRecord(value: Record<string, unknown>): boolean {
  return [
    "output",
    "data",
    "evidence",
    "evidenceRefs",
    "nextNodeId",
    "decision",
    "condition",
    "valid",
    "status",
    "message",
  ].some((key) => key in value);
}

function evidenceRefs(values: unknown[]): WorkflowEvidenceRef[] {
  return values.filter((value): value is WorkflowEvidenceRef => (
    isRecord(value) && typeof value.id === "string"
  ));
}

function applyNodeResult(snapshot: WorkflowRunSnapshot, node: WorkflowNode, result: WorkflowNodeResult): void {
  if (result.data) {
    Object.assign(snapshot.data, result.data);
    snapshot.context = snapshot.data;
  }
  if (result.output !== undefined) snapshot.outputs[node.id] = result.output;
  const incoming = result.evidenceRefs ?? result.evidence ?? [];
  if (incoming.length > 0) {
    mergeEvidence(snapshot.evidence, incoming);
  }
  snapshot.nodeResults[node.id] = result;
}

function mergeEvidence(
  current: WorkflowEvidenceRef[],
  incoming: readonly WorkflowEvidenceRef[],
): void {
  const indexes = new Map<string, number>();
  current.forEach((ref, index) => indexes.set(evidenceKey(ref), index));
  for (const ref of incoming) {
    const key = evidenceKey(ref);
    const existingIndex = indexes.get(key);
    if (existingIndex === undefined) {
      indexes.set(key, current.length);
      current.push({ ...ref });
    } else {
      current[existingIndex] = { ...current[existingIndex], ...ref };
    }
  }
}

function evidenceKey(ref: WorkflowEvidenceRef): string {
  return `${ref.kind ?? "evidence"}:${ref.id}`;
}

function completeNode(
  snapshot: WorkflowRunSnapshot,
  node: WorkflowNode,
  result: WorkflowNodeResult,
  nextNodeId: string | null,
  now: () => string,
): void {
  applyNodeResult(snapshot, node, result);
  snapshot.nodeStates[node.id] = "completed";
  if (!snapshot.completedNodeIds.includes(node.id)) snapshot.completedNodeIds.push(node.id);
  snapshot.pending = null;
  setCurrentNode(snapshot, nextNodeId);
  appendEvent(snapshot, "node.completed", node.id, {
    outputPresent: result.output !== undefined,
    evidenceCount: (result.evidenceRefs ?? result.evidence ?? []).length,
  }, now);
}

function pauseRun(
  snapshot: WorkflowRunSnapshot,
  node: WorkflowNode,
  kind: "wait" | "approval",
  reason: string | null,
  now: () => string,
): WorkflowRunSnapshot {
  snapshot.status = kind === "approval" ? "paused" : "waiting";
  snapshot.nodeStates[node.id] = kind === "approval" ? "paused" : "waiting";
  snapshot.pending = {
    kind,
    nodeId: node.id,
    reason,
    requestedAt: now(),
  };
  appendEvent(snapshot, kind === "approval" ? "approval.required" : "run.waiting", node.id, {
    kind,
    reason,
  }, now);
  return snapshot;
}

function failRun(
  snapshot: WorkflowRunSnapshot,
  nodeId: string | null,
  message: string,
  now: () => string,
): WorkflowRunSnapshot {
  snapshot.status = "failed";
  snapshot.error = message;
  snapshot.completedAt = null;
  snapshot.pending = null;
  if (nodeId) {
    snapshot.nodeStates[nodeId] = "failed";
    appendEvent(snapshot, "node.failed", nodeId, { error: message }, now);
  }
  appendEvent(snapshot, "run.failed", nodeId, { error: message }, now);
  return snapshot;
}

function markUnselectedBranch(
  snapshot: WorkflowRunSnapshot,
  node: WorkflowNode,
  unselectedKey: "true" | "false",
  now: () => string,
): void {
  const target = unselectedKey === "true" ? node.onTrue : node.onFalse;
  if (!target || snapshot.skippedNodeIds.includes(target)) return;
  snapshot.skippedNodeIds.push(target);
  snapshot.nodeStates[target] = "skipped";
  appendEvent(snapshot, "node.skipped", target, {
    skippedBy: node.id,
    reason: `condition_${unselectedKey}`,
  }, now);
}

function markUnselectedDecisionBranches(
  snapshot: WorkflowRunSnapshot,
  node: WorkflowNode,
  selected: string | undefined,
  routes: Readonly<Record<string, string>>,
  now: () => string,
): void {
  const targets = new Set(Object.values(routes));
  if (node.onTrue) targets.add(node.onTrue);
  if (node.onFalse) targets.add(node.onFalse);
  for (const target of targets) {
    if (target === selected || snapshot.skippedNodeIds.includes(target)) continue;
    snapshot.skippedNodeIds.push(target);
    snapshot.nodeStates[target] = "skipped";
    appendEvent(snapshot, "node.skipped", target, { skippedBy: node.id, reason: "decision_branch" }, now);
  }
}

function nextAfterResume(
  definition: NormalizedWorkflowDefinition,
  node: WorkflowNode,
): string | null {
  return node.next === undefined || node.next === null
    ? sequentialNext(definition, node.id)
    : validateNextNode(definition, node.next);
}

function sequentialNext(
  definition: NormalizedWorkflowDefinition,
  nodeId: string,
): string | null {
  const index = definition.nodes.findIndex((node) => node.id === nodeId);
  return index >= 0 ? definition.nodes[index + 1]?.id ?? null : null;
}

function validateNextNode(
  definition: NormalizedWorkflowDefinition,
  nodeId: string | null,
): string | null {
  if (nodeId === null) return null;
  if (!definition.nodeMap.has(nodeId)) throw new Error(`Unknown next node ${nodeId}`);
  return nodeId;
}

function setCurrentNode(snapshot: WorkflowRunSnapshot, nodeId: string | null): void {
  snapshot.currentNodeId = nodeId;
  snapshot.currentNode = nodeId;
}

function syncCurrentNodeAliases(snapshot: WorkflowRunSnapshot): void {
  if (snapshot.currentNodeId === null && snapshot.currentNode !== null) {
    snapshot.currentNodeId = snapshot.currentNode;
  } else {
    snapshot.currentNode = snapshot.currentNodeId;
  }
}

function appendEvent(
  snapshot: WorkflowRunSnapshot,
  type: string,
  nodeId: string | null,
  payload: Record<string, unknown>,
  now: () => string,
): void {
  const timestamp = now();
  const sequence = snapshot.events.length + 1;
  snapshot.events.push({
    id: `${snapshot.runId}:${sequence}`,
    runId: snapshot.runId,
    sequence,
    type,
    nodeId,
    timestamp,
    payload,
  });
  snapshot.updatedAt = timestamp;
}

function lastOutput(snapshot: WorkflowRunSnapshot): unknown {
  for (let index = snapshot.completedNodeIds.length - 1; index >= 0; index -= 1) {
    const nodeId = snapshot.completedNodeIds[index];
    if (nodeId !== undefined && nodeId in snapshot.outputs) return snapshot.outputs[nodeId];
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Workflow node failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertWorkflowSnapshot(value: unknown): asserts value is WorkflowRunSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Invalid workflow snapshot shape");
  }
  const runId = value.runId;
  const steps = value.steps;
  const evidence = value.evidence;
  const nodeStates = value.nodeStates;
  const nodeResults = value.nodeResults;
  const events = value.events;
  if (typeof value.id !== "string"
    || typeof runId !== "string"
    || value.id !== runId
    || typeof value.workflowId !== "string"
    || typeof value.triggerType !== "string"
    || typeof value.triggerSource !== "string"
    || !isWorkflowRunStatus(value.status)
    || !("input" in value)
    || !isRecord(value.context)
    || !isRecord(value.data)
    || !isRecord(value.outputs)
    || !Array.isArray(value.actions)
    || !Array.isArray(evidence)
    || !isNullableString(value.currentNode)
    || !isNullableString(value.currentNodeId)
    || !isStringArray(value.completedNodeIds)
    || !isStringArray(value.skippedNodeIds)
    || !isRecord(nodeStates)
    || !isRecord(nodeResults)
    || !isNullableString(value.completedAt)
    || !isNullableString(value.error)
    || typeof steps !== "number"
    || !Number.isInteger(steps)
    || steps < 0
    || typeof value.startedAt !== "string"
    || typeof value.updatedAt !== "string"
    || !Array.isArray(events)) {
    throw new Error("Invalid workflow snapshot shape");
  }

  if (!evidence.every(isEvidenceRef)
    || !Object.values(nodeStates).every(isWorkflowNodeState)
    || !Object.values(nodeResults).every(isRecord)
    || !isPending(value.pending)
    || !events.every((event, index) => isWorkflowEvent(event, runId, index + 1))) {
    throw new Error("Invalid workflow snapshot contents");
  }
}

function isWorkflowRunStatus(value: unknown): value is WorkflowRunStatus {
  return value === "running"
    || value === "waiting"
    || value === "paused"
    || value === "completed"
    || value === "failed";
}

function isWorkflowNodeState(value: unknown): value is WorkflowNodeState {
  return value === "running"
    || value === "waiting"
    || value === "paused"
    || value === "completed"
    || value === "failed"
    || value === "skipped";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isEvidenceRef(value: unknown): value is WorkflowEvidenceRef {
  return isRecord(value) && typeof value.id === "string";
}

function isPending(value: unknown): value is WorkflowPending | null {
  if (value === null) return true;
  return isRecord(value)
    && (value.kind === "wait" || value.kind === "approval")
    && typeof value.nodeId === "string"
    && isNullableString(value.reason)
    && typeof value.requestedAt === "string";
}

function isWorkflowEvent(value: unknown, runId: string, sequence: number): value is WorkflowEvent {
  return isRecord(value)
    && typeof value.id === "string"
    && value.runId === runId
    && value.sequence === sequence
    && typeof value.type === "string"
    && isNullableString(value.nodeId)
    && typeof value.timestamp === "string"
    && isRecord(value.payload);
}
