import type { Express, Request } from "express";
import { z } from "zod";
import type { JsonObject, JsonValue } from "../agent-os/types.js";
import type { IntelligenceResourceId } from "../agent-os/intelligence-types.js";
import type { SessionContext } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { asyncHandler, optionalNumber, optionalString } from "./http-utils.js";
import { validateBody, validateIdParam, validateQuery } from "./validation.js";

const resourceId = z.union([z.string().trim().min(1).max(200), z.number().int().positive()]);
const jsonObject = z.record(z.string(), z.unknown());
const listSchema = z.object({
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});
const associationSchema = z.object({
  targetType: z.string().trim().max(80).nullable().optional(),
  targetId: resourceId.nullable().optional(),
  goalId: z.number().int().positive().nullable().optional(),
  sourceType: z.string().trim().max(80).nullable().optional(),
  sourceId: z.string().trim().max(240).nullable().optional(),
  sourceWorkflowRunId: z.number().int().positive().nullable().optional(),
  sourceActionProposalId: z.number().int().positive().nullable().optional(),
}).strict();
const opportunityBase = associationSchema.extend({
  type: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(500),
  summary: z.string().trim().max(2000).nullable().optional(),
  signal: z.unknown().nullable().optional(),
  score: z.number().finite().nullable().optional(),
  expectedImpact: z.unknown().nullable().optional(),
  risk: z.unknown().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  status: z.enum(["IDENTIFIED", "VALIDATING", "READY", "ACCEPTED", "REJECTED", "EXPIRED", "ARCHIVED"]).optional(),
  details: z.unknown().nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(240).optional(),
}).strict();
const opportunityUpdate = opportunityBase.partial().extend({ expectedVersion: z.number().int().positive().optional() }).strict();

const decisionBase = associationSchema.extend({
  issue: z.string().trim().min(1).max(2000),
  rootCauses: z.unknown(),
  evidence: z.unknown(),
  options: z.unknown(),
  recommendedOption: z.unknown().nullable().optional(),
  expectedImpact: z.unknown().nullable().optional(),
  risk: z.unknown().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  constraints: z.unknown().nullable().optional(),
  requiredApproval: z.boolean().optional(),
  sourceOpportunityId: z.number().int().positive().nullable().optional(),
  status: z.enum(["PROPOSED", "REVIEWING", "APPROVED", "REJECTED", "EXECUTING", "COMPLETED", "CANCELLED"]).optional(),
  idempotencyKey: z.string().trim().min(1).max(240).optional(),
}).strict();
const decisionUpdate = decisionBase.partial().extend({ expectedVersion: z.number().int().positive().optional() }).strict();

const experimentBase = associationSchema.extend({
  title: z.string().trim().min(1).max(500),
  hypothesis: z.unknown(),
  action: z.unknown().nullable().optional(),
  observation: z.unknown().nullable().optional(),
  result: z.unknown().nullable().optional(),
  learning: z.unknown().nullable().optional(),
  before: z.unknown().nullable().optional(),
  after: z.unknown().nullable().optional(),
  delta: z.unknown().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  attribution: z.string().trim().max(80).nullable().optional(),
  observationWindowDays: z.number().int().positive().nullable().optional(),
  sourceOpportunityId: z.number().int().positive().nullable().optional(),
  sourceDecisionId: z.number().int().positive().nullable().optional(),
  status: z.enum(["DRAFT", "RUNNING", "OBSERVING", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
  idempotencyKey: z.string().trim().min(1).max(240).optional(),
}).strict();
const experimentUpdate = experimentBase.partial().extend({ expectedVersion: z.number().int().positive().optional() }).strict();

function sessionContext(request: Request): SessionContext {
  const context = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!context) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  return context;
}

export function registerAgentOsIntelligenceRoutes(app: Express, hostStore: Store): void {
  const store = hostStore.agentOsIntelligence;
  app.get("/api/agent-os/opportunities", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const query = validateQuery(listSchema.extend({
      type: z.string().optional(),
      status: z.enum(["IDENTIFIED", "VALIDATING", "READY", "ACCEPTED", "REJECTED", "EXPIRED", "ARCHIVED"]).optional(),
      targetType: z.string().optional(),
      targetId: resourceId.optional(),
      goalId: z.number().int().positive().optional(),
      sourceType: z.string().optional(),
      sourceId: z.string().optional(),
      sourceWorkflowRunId: z.number().int().positive().optional(),
      sourceActionProposalId: z.number().int().positive().optional(),
    }), {
      limit: optionalNumber(request.query.limit), offset: optionalNumber(request.query.offset),
      type: optionalString(request.query.type), status: optionalString(request.query.status),
      targetType: optionalString(request.query.targetType), targetId: parseResourceIdQuery(request.query.targetId),
      goalId: optionalNumber(request.query.goalId), sourceType: optionalString(request.query.sourceType),
      sourceId: optionalString(request.query.sourceId), sourceWorkflowRunId: optionalNumber(request.query.sourceWorkflowRunId),
      sourceActionProposalId: optionalNumber(request.query.sourceActionProposalId),
    });
    response.json(store.listOpportunities({ organizationId: context.organization.id, ...query }));
  }));
  app.post("/api/agent-os/opportunities", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(opportunityBase, request.body ?? {});
    response.status(201).json(store.createOpportunity({
      organizationId: context.organization.id,
      ...body,
      targetId: resourceIdValue(body.targetId),
      signal: optionalJson(body.signal), expectedImpact: optionalJson(body.expectedImpact),
      risk: optionalJson(body.risk), details: optionalJson(body.details),
    }));
  }));
  app.get("/api/agent-os/opportunities/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const result = store.getOpportunity(validateIdParam(request.params.id), context.organization.id);
    if (!result) { response.status(404).json({ message: "Opportunity not found" }); return; }
    response.json(result);
  }));
  app.patch("/api/agent-os/opportunities/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(opportunityUpdate, request.body ?? {});
    const result = store.updateOpportunity(validateIdParam(request.params.id), context.organization.id, {
      ...body, targetId: resourceIdValue(body.targetId), signal: optionalJson(body.signal),
      expectedImpact: optionalJson(body.expectedImpact), risk: optionalJson(body.risk), details: optionalJson(body.details),
    });
    if (!result) { response.status(409).json({ message: "Opportunity not found or version conflict" }); return; }
    response.json(result);
  }));
  app.delete("/api/agent-os/opportunities/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const deleted = store.deleteOpportunity(validateIdParam(request.params.id), context.organization.id);
    if (!deleted) { response.status(404).json({ message: "Opportunity not found" }); return; }
    response.status(204).send();
  }));

  app.get("/api/agent-os/decisions", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const query = validateQuery(listSchema.extend({
      status: z.enum(["PROPOSED", "REVIEWING", "APPROVED", "REJECTED", "EXECUTING", "COMPLETED", "CANCELLED"]).optional(),
      sourceOpportunityId: z.number().int().positive().optional(),
    }), {
      limit: optionalNumber(request.query.limit), offset: optionalNumber(request.query.offset), status: optionalString(request.query.status),
      sourceOpportunityId: optionalNumber(request.query.sourceOpportunityId),
    });
    response.json(store.listDecisions({ organizationId: context.organization.id, ...query }));
  }));
  app.post("/api/agent-os/decisions", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(decisionBase, request.body ?? {});
    response.status(201).json(store.createDecision({
      organizationId: context.organization.id, ...body,
      targetId: resourceIdValue(body.targetId), rootCauses: toJsonValue(body.rootCauses, "rootCauses"),
      evidence: toJsonValue(body.evidence, "evidence"), options: toJsonValue(body.options, "options"),
      recommendedOption: optionalJson(body.recommendedOption), expectedImpact: optionalJson(body.expectedImpact),
      risk: optionalJson(body.risk), constraints: optionalJson(body.constraints),
    }));
  }));
  app.get("/api/agent-os/decisions/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const result = store.getDecision(validateIdParam(request.params.id), context.organization.id);
    if (!result) { response.status(404).json({ message: "Decision not found" }); return; }
    response.json(result);
  }));
  app.patch("/api/agent-os/decisions/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(decisionUpdate, request.body ?? {});
    const result = store.updateDecision(validateIdParam(request.params.id), context.organization.id, {
      ...body, targetId: resourceIdValue(body.targetId), rootCauses: optionalJson(body.rootCauses),
      evidence: optionalJson(body.evidence), options: optionalJson(body.options), recommendedOption: optionalJson(body.recommendedOption),
      expectedImpact: optionalJson(body.expectedImpact), risk: optionalJson(body.risk), constraints: optionalJson(body.constraints),
    });
    if (!result) { response.status(409).json({ message: "Decision not found or version conflict" }); return; }
    response.json(result);
  }));
  app.delete("/api/agent-os/decisions/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const deleted = store.deleteDecision(validateIdParam(request.params.id), context.organization.id);
    if (!deleted) { response.status(404).json({ message: "Decision not found" }); return; }
    response.status(204).send();
  }));

  app.get("/api/agent-os/experiments", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const query = validateQuery(listSchema.extend({
      status: z.enum(["DRAFT", "RUNNING", "OBSERVING", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
      sourceOpportunityId: z.number().int().positive().optional(), sourceDecisionId: z.number().int().positive().optional(),
    }), {
      limit: optionalNumber(request.query.limit), offset: optionalNumber(request.query.offset), status: optionalString(request.query.status),
      sourceOpportunityId: optionalNumber(request.query.sourceOpportunityId), sourceDecisionId: optionalNumber(request.query.sourceDecisionId),
    });
    response.json(store.listExperiments({ organizationId: context.organization.id, ...query }));
  }));
  app.post("/api/agent-os/experiments", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(experimentBase, request.body ?? {});
    response.status(201).json(store.createExperiment({
      organizationId: context.organization.id, ...body, targetId: resourceIdValue(body.targetId),
      hypothesis: toJsonValue(body.hypothesis, "hypothesis"), action: optionalJson(body.action), observation: optionalJson(body.observation),
      result: optionalJson(body.result), learning: optionalJson(body.learning), before: optionalJson(body.before), after: optionalJson(body.after),
      delta: optionalJson(body.delta),
    }));
  }));
  app.get("/api/agent-os/experiments/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const result = store.getExperiment(validateIdParam(request.params.id), context.organization.id);
    if (!result) { response.status(404).json({ message: "Experiment not found" }); return; }
    response.json(result);
  }));
  app.patch("/api/agent-os/experiments/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const body = validateBody(experimentUpdate, request.body ?? {});
    const result = store.updateExperiment(validateIdParam(request.params.id), context.organization.id, {
      ...body, targetId: resourceIdValue(body.targetId), hypothesis: body.hypothesis === undefined ? undefined : toJsonValue(body.hypothesis, "hypothesis"),
      action: optionalJson(body.action), observation: optionalJson(body.observation), result: optionalJson(body.result), learning: optionalJson(body.learning),
      before: optionalJson(body.before), after: optionalJson(body.after), delta: optionalJson(body.delta),
    });
    if (!result) { response.status(409).json({ message: "Experiment not found or version conflict" }); return; }
    response.json(result);
  }));
  app.delete("/api/agent-os/experiments/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const deleted = store.deleteExperiment(validateIdParam(request.params.id), context.organization.id);
    if (!deleted) { response.status(404).json({ message: "Experiment not found" }); return; }
    response.status(204).send();
  }));
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

function optionalJson(value: unknown): JsonValue | null | undefined {
  return value === undefined ? undefined : toJsonValue(value, "json");
}

function resourceIdValue(value: IntelligenceResourceId | null | undefined): IntelligenceResourceId | null | undefined {
  return value === undefined ? undefined : value;
}

function parseResourceIdQuery(value: unknown): IntelligenceResourceId | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value);
  return /^\d+$/.test(normalized) ? Number(normalized) : normalized;
}
