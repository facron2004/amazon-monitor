import type { Express, Request } from "express";
import { buildSupervisorPlan, type SupervisorInput } from "@amazon-monitor/agent";
import { z } from "zod";
import { hasBusinessCapability, type SessionContext } from "@amazon-monitor/shared";
import type {
  ActionRiskLevel,
  AgentOsResourceId,
  JsonObject,
  JsonValue,
} from "../agent-os/types.js";
import type { Store } from "../store.js";
import { asyncHandler, optionalNumber, optionalString } from "./http-utils.js";
import { validateBody, validateIdParam, validateQuery } from "./validation.js";

const resourceId = z.union([z.string().trim().min(1).max(200), z.number().int().positive()]);
const jsonObject = z.record(z.string(), z.unknown());
const listSchema = z.object({
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});
const supervisorPlanSchema = z.object({
  request: z.string().trim().min(1).max(10_000),
  checkedAt: z.string().datetime({ offset: true }),
  dataChecks: z.array(z.object({
    source: z.string().trim().min(1).max(120),
    ageHours: z.number().nonnegative().nullable().optional(),
    maxAgeHours: z.number().positive().nullable().optional(),
    completeness: z.number().min(0).max(1).nullable().optional(),
    collectionStatus: z.enum(["success", "partial", "running", "failed", "missing"]).optional(),
    mapped: z.boolean().nullable().optional(),
    outlier: z.boolean().nullable().optional(),
    apiError: z.string().max(500).nullable().optional(),
  })).max(50),
  goal: z.object({
    id: z.string().trim().min(1).max(120),
    metric: z.string().trim().min(1).max(80),
    targetValue: z.unknown(),
    currentValue: z.unknown().nullable(),
    constraints: z.array(z.object({
      metric: z.string().trim().min(1).max(80),
      operator: z.enum(["gte", "lte", "eq", "between"]),
      value: z.number(),
      upperValue: z.number().optional(),
      unit: z.enum(["currency", "percent", "days", "rank", "count", "score"]),
    })).max(50),
  }).nullable().optional(),
}).strict();

const goalCreateSchema = z.object({
  storeId: resourceId.nullable().optional(),
  skuId: resourceId.nullable().optional(),
  type: z.string().trim().min(1).max(80),
  metric: z.string().trim().min(1).max(80),
  targetValue: z.unknown(),
  currentValue: z.unknown().nullable().optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  priority: z.number().int().min(0).max(3).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "ACHIEVED", "FAILED", "CANCELLED"]).optional(),
  constraints: jsonObject.optional(),
  idempotencyKey: z.string().trim().min(1).max(240).optional(),
}).strict();
const goalUpdateSchema = goalCreateSchema.partial().extend({
  expectedVersion: z.number().int().positive().optional(),
}).strict();

const memoryCreateSchema = z.object({
  memoryType: z.string().trim().min(1).max(80),
  subjectType: z.string().trim().max(80).nullable().optional(),
  subjectId: resourceId.nullable().optional(),
  title: z.string().trim().max(500).nullable().optional(),
  content: jsonObject,
  tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  sourceWorkflowRunId: z.number().int().positive().nullable().optional(),
  sourceActionProposalId: z.number().int().positive().nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(240).optional(),
}).strict();
const memoryUpdateSchema = memoryCreateSchema.partial().extend({
  expectedVersion: z.number().int().positive().optional(),
}).strict();
const actionStatusSchema = z.enum([
  "PROPOSED", "APPROVED", "EXECUTING", "SUCCEEDED", "VERIFYING", "EFFECTIVE",
  "FAILED", "CANCELLED", "ROLLBACK", "INEFFECTIVE",
]);

const workflowCreateSchema = z.object({
  workflowId: z.string().trim().min(1).max(120),
  triggerType: z.string().trim().min(1).max(80),
  triggerSource: z.string().trim().max(240).nullable().optional(),
  status: z.enum(["PENDING", "RUNNING", "WAITING", "PAUSED", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
  startedAt: z.string().datetime({ offset: true }).nullable().optional(),
  currentNode: z.string().trim().max(120).nullable().optional(),
  context: jsonObject.optional(),
  evidence: z.unknown().nullable().optional(),
  plan: z.unknown().nullable().optional(),
  actions: z.unknown().nullable().optional(),
  result: z.unknown().nullable().optional(),
  snapshot: z.unknown().nullable().optional(),
  errorMessage: z.string().trim().max(1000).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(240).optional(),
}).strict();
const workflowUpdateSchema = workflowCreateSchema.partial().extend({
  completedAt: z.string().datetime({ offset: true }).nullable().optional(),
  expectedVersion: z.number().int().positive().optional(),
}).strict();

const actionCreateSchema = z.object({
  workflowRunId: z.number().int().positive().nullable().optional(),
  goalId: z.number().int().positive().nullable().optional(),
  type: z.string().trim().min(1).max(120),
  targetType: z.string().trim().min(1).max(80),
  targetId: resourceId.nullable().optional(),
  currentValue: z.unknown().nullable().optional(),
  proposedValue: z.unknown(),
  reason: z.string().trim().min(1).max(2000),
  evidence: z.unknown(),
  expectedImpact: z.unknown().nullable().optional(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  confidence: z.number().min(0).max(1).optional(),
  requiresApproval: z.boolean().optional(),
  idempotencyKey: z.string().trim().min(1).max(240).optional(),
}).strict();
const actionUpdateSchema = actionCreateSchema.partial().extend({
  status: actionStatusSchema.optional(),
  expectedVersion: z.number().int().positive().optional(),
}).strict();

function sessionContext(request: Request): SessionContext {
  const context = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!context) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  return context;
}

function toJsonValue(value: unknown, field: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item, field));
  if (typeof value === "object" && value !== null) {
    const object: JsonObject = {};
    for (const [key, item] of Object.entries(value)) object[key] = toJsonValue(item, `${field}.${key}`);
    return object;
  }
  throw Object.assign(new Error(`${field} must be JSON serializable`), { statusCode: 400 });
}

function optionalJsonValue(value: unknown, field: string): JsonValue | null | undefined {
  return value === undefined ? undefined : value === null ? null : toJsonValue(value, field);
}

function toResourceId(value: AgentOsResourceId | null | undefined): AgentOsResourceId | null | undefined {
  return value === undefined ? undefined : value;
}

export function registerAgentOsRoutes(app: Express, hostStore: Store): void {
  const store = hostStore.agentOs;
  app.post("/api/agent-os/supervisor/plan", asyncHandler(async (request, response) => {
    sessionContext(request);
    const body = validateBody(supervisorPlanSchema, request.body ?? {});
    const input: SupervisorInput = {
      request: body.request,
      checkedAt: body.checkedAt,
      dataChecks: body.dataChecks,
      goal: body.goal
        ? {
            ...body.goal,
            targetValue: toJsonValue(body.goal.targetValue, "goal.targetValue"),
            currentValue: toJsonValue(body.goal.currentValue, "goal.currentValue"),
          } as unknown as SupervisorInput["goal"]
        : null,
    };
    response.json(buildSupervisorPlan(input));
  }));

  app.get("/api/agent-os/goals", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const query = validateQuery(listSchema.extend({
      type: z.string().optional(),
      status: z.enum(["ACTIVE", "PAUSED", "ACHIEVED", "FAILED", "CANCELLED"]).optional(),
      storeId: resourceId.optional(),
      skuId: resourceId.optional(),
    }), {
      limit: optionalNumber(request.query.limit),
      offset: optionalNumber(request.query.offset),
      type: optionalString(request.query.type),
      status: optionalString(request.query.status),
      storeId: parseResourceIdQuery(request.query.storeId),
      skuId: parseResourceIdQuery(request.query.skuId),
    });
    response.json(store.listGoals({ organizationId: context.organization.id, ...query }));
  }));

  app.post("/api/agent-os/goals", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(goalCreateSchema, request.body ?? {});
    response.status(201).json(store.createGoal({
      organizationId: context.organization.id,
      ...body,
      storeId: toResourceId(body.storeId),
      skuId: toResourceId(body.skuId),
      targetValue: toJsonValue(body.targetValue, "targetValue"),
      currentValue: optionalJsonValue(body.currentValue, "currentValue"),
      constraints: body.constraints ? toJsonObject(body.constraints, "constraints") : undefined,
    }));
  }));

  app.get("/api/agent-os/goals/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const goal = store.getGoal(validateIdParam(request.params.id), context.organization.id);
    if (!goal) { response.status(404).json({ message: "Goal not found" }); return; }
    response.json(goal);
  }));

  app.patch("/api/agent-os/goals/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(goalUpdateSchema, request.body ?? {});
    const goal = store.updateGoal(validateIdParam(request.params.id), context.organization.id, {
      ...body,
      storeId: toResourceId(body.storeId),
      skuId: toResourceId(body.skuId),
      targetValue: body.targetValue === undefined ? undefined : toJsonValue(body.targetValue, "targetValue"),
      currentValue: optionalJsonValue(body.currentValue, "currentValue"),
      constraints: body.constraints ? toJsonObject(body.constraints, "constraints") : undefined,
    });
    if (!goal) { response.status(409).json({ message: "Goal not found or version conflict" }); return; }
    response.json(goal);
  }));

  app.get("/api/agent-os/memory", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const query = validateQuery(listSchema.extend({
      memoryType: z.string().optional(),
      subjectType: z.string().optional(),
      subjectId: resourceId.optional(),
      sourceWorkflowRunId: z.number().int().positive().optional(),
    }), {
      limit: optionalNumber(request.query.limit),
      offset: optionalNumber(request.query.offset),
      memoryType: optionalString(request.query.memoryType),
      subjectType: optionalString(request.query.subjectType),
      subjectId: parseResourceIdQuery(request.query.subjectId),
      sourceWorkflowRunId: optionalNumber(request.query.sourceWorkflowRunId),
    });
    response.json(store.listMemoryEntries({ organizationId: context.organization.id, ...query }));
  }));

  app.post("/api/agent-os/memory", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(memoryCreateSchema, request.body ?? {});
    response.status(201).json(store.createMemoryEntry({
      organizationId: context.organization.id,
      ...body,
      subjectId: toResourceId(body.subjectId),
      content: toJsonObject(body.content, "content"),
    }));
  }));

  app.get("/api/agent-os/memory/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const entry = store.getMemoryEntry(validateIdParam(request.params.id), context.organization.id);
    if (!entry) { response.status(404).json({ message: "Memory entry not found" }); return; }
    response.json(entry);
  }));

  app.patch("/api/agent-os/memory/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(memoryUpdateSchema, request.body ?? {});
    const entry = store.updateMemoryEntry(validateIdParam(request.params.id), context.organization.id, {
      ...body,
      subjectId: toResourceId(body.subjectId),
      content: body.content === undefined ? undefined : toJsonObject(body.content, "content"),
    });
    if (!entry) { response.status(409).json({ message: "Memory entry not found or version conflict" }); return; }
    response.json(entry);
  }));

  app.get("/api/agent-os/workflows/runs", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const query = validateQuery(listSchema.extend({
      workflowId: z.string().optional(),
      triggerType: z.string().optional(),
      status: z.enum(["PENDING", "RUNNING", "WAITING", "PAUSED", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
    }), {
      limit: optionalNumber(request.query.limit),
      offset: optionalNumber(request.query.offset),
      workflowId: optionalString(request.query.workflowId),
      triggerType: optionalString(request.query.triggerType),
      status: optionalString(request.query.status),
    });
    response.json(store.listWorkflowRuns({ organizationId: context.organization.id, ...query }));
  }));

  app.post("/api/agent-os/workflows/runs", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(workflowCreateSchema, request.body ?? {});
    response.status(201).json(store.createWorkflowRun({
      organizationId: context.organization.id,
      ...body,
      context: body.context ? toJsonObject(body.context, "context") : undefined,
      evidence: optionalJsonValue(body.evidence, "evidence"),
      plan: optionalJsonValue(body.plan, "plan"),
      actions: optionalJsonValue(body.actions, "actions"),
      result: optionalJsonValue(body.result, "result"),
      snapshot: optionalJsonValue(body.snapshot, "snapshot"),
    }));
  }));

  app.get("/api/agent-os/workflows/runs/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const run = store.getWorkflowRun(validateIdParam(request.params.id), context.organization.id);
    if (!run) { response.status(404).json({ message: "Workflow run not found" }); return; }
    response.json(run);
  }));

  app.patch("/api/agent-os/workflows/runs/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(workflowUpdateSchema, request.body ?? {});
    const run = store.updateWorkflowRun(validateIdParam(request.params.id), context.organization.id, {
      ...body,
      context: body.context === undefined ? undefined : toJsonObject(body.context, "context"),
      evidence: optionalJsonValue(body.evidence, "evidence"),
      plan: optionalJsonValue(body.plan, "plan"),
      actions: optionalJsonValue(body.actions, "actions"),
      result: optionalJsonValue(body.result, "result"),
      snapshot: optionalJsonValue(body.snapshot, "snapshot"),
    });
    if (!run) { response.status(409).json({ message: "Workflow run not found or version conflict" }); return; }
    response.json(run);
  }));

  app.get("/api/agent-os/actions", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const query = validateQuery(listSchema.extend({
      workflowRunId: z.number().int().positive().optional(),
      goalId: z.number().int().positive().optional(),
      type: z.string().optional(),
      status: actionStatusSchema.optional(),
      riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    }), {
      limit: optionalNumber(request.query.limit),
      offset: optionalNumber(request.query.offset),
      workflowRunId: optionalNumber(request.query.workflowRunId),
      goalId: optionalNumber(request.query.goalId),
      type: optionalString(request.query.type),
      status: optionalString(request.query.status),
      riskLevel: optionalString(request.query.riskLevel),
    });
    response.json(store.listActionProposals({ organizationId: context.organization.id, ...query }));
  }));

  app.post("/api/agent-os/actions", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(actionCreateSchema, request.body ?? {});
    response.status(201).json(store.createActionProposal({
      organizationId: context.organization.id,
      ...body,
      targetId: toResourceId(body.targetId),
      currentValue: optionalJsonValue(body.currentValue, "currentValue"),
      proposedValue: toJsonValue(body.proposedValue, "proposedValue"),
      evidence: toJsonValue(body.evidence, "evidence"),
      expectedImpact: optionalJsonValue(body.expectedImpact, "expectedImpact"),
      riskLevel: body.riskLevel as ActionRiskLevel,
    }));
  }));

  app.get("/api/agent-os/actions/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const action = store.getActionProposal(validateIdParam(request.params.id), context.organization.id);
    if (!action) { response.status(404).json({ message: "Action proposal not found" }); return; }
    response.json(action);
  }));

  app.patch("/api/agent-os/actions/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(actionUpdateSchema, request.body ?? {});
    if (body.status === "APPROVED") requireWorkflowWrite(context);
    const action = store.updateActionProposal(validateIdParam(request.params.id), context.organization.id, {
      ...body,
      targetId: toResourceId(body.targetId),
      currentValue: optionalJsonValue(body.currentValue, "currentValue"),
      proposedValue: body.proposedValue === undefined ? undefined : toJsonValue(body.proposedValue, "proposedValue"),
      evidence: body.evidence === undefined ? undefined : toJsonValue(body.evidence, "evidence"),
      expectedImpact: optionalJsonValue(body.expectedImpact, "expectedImpact"),
      riskLevel: body.riskLevel as ActionRiskLevel | undefined,
    });
    if (!action) { response.status(409).json({ message: "Action proposal not found or version conflict" }); return; }
    response.json(action);
  }));
}

function requireWorkflowWrite(context: SessionContext): void {
  if (!hasBusinessCapability(context.user.role, "manage_workflow")) {
    throw Object.assign(new Error("Forbidden: role cannot approve Agent OS actions"), { statusCode: 403 });
  }
}

function toJsonObject(value: Record<string, unknown>, field: string): JsonObject {
  const converted = toJsonValue(value, field);
  if (typeof converted !== "object" || converted === null || Array.isArray(converted)) {
    throw Object.assign(new Error(`${field} must be a JSON object`), { statusCode: 400 });
  }
  return converted;
}

function parseResourceIdQuery(value: unknown): AgentOsResourceId | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value);
  return /^\d+$/.test(normalized) ? Number(normalized) : normalized;
}
