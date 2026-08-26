import type { Express, Request } from "express";
import { z } from "zod";
import { hasBusinessCapability, type SessionContext } from "@amazon-monitor/shared";
import { AgentOsWorkflowRunner } from "../agent-os/workflow-runner.js";
import type { Store } from "../store.js";
import { asyncHandler } from "./http-utils.js";
import { validateBody, validateIdParam } from "./validation.js";

const startSchema = z.object({
  workflowId: z.string().trim().min(1).max(120),
  triggerType: z.string().trim().min(1).max(80).default("manual"),
  triggerSource: z.string().trim().max(240).nullable().optional(),
  input: z.unknown().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().trim().min(1).max(240).optional(),
}).strict();

const resumeSchema = z.object({
  resume: z.boolean().optional(),
  continue: z.boolean().optional(),
  value: z.unknown().optional(),
  approval: z.enum(["approved", "rejected", "expired"]).optional(),
  decision: z.enum(["approved", "rejected", "expired"]).optional(),
  approved: z.boolean().optional(),
  modification: z.record(z.string(), z.unknown()).optional(),
  retryFailed: z.boolean().optional(),
}).strict();

function sessionContext(request: Request): SessionContext {
  const context = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!context) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  return context;
}

export function registerAgentOsWorkflowRoutes(app: Express, hostStore: Store): void {
  const runner = new AgentOsWorkflowRunner(hostStore);

  app.get("/api/agent-os/workflows/templates", asyncHandler(async (request, response) => {
    sessionContext(request);
    response.json(runner.listTemplates());
  }));

  app.post("/api/agent-os/workflows/execute", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    requireWorkflowWrite(context);
    const body = validateBody(startSchema, request.body ?? {});
    const result = await runner.start({
      organizationId: context.organization.id,
      workflowId: body.workflowId,
      triggerType: body.triggerType,
      triggerSource: body.triggerSource,
      input: toJsonValue(body.input ?? {}, "input"),
      context: body.context === undefined ? undefined : toJsonObject(body.context, "context"),
      idempotencyKey: body.idempotencyKey,
    });
    response.status(201).json(result);
  }));

  app.post("/api/agent-os/workflows/runs/:id/resume", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    requireWorkflowWrite(context);
    const body = validateBody(resumeSchema, request.body ?? {});
    const result = await runner.resume({
      organizationId: context.organization.id,
      runId: validateIdParam(request.params.id),
      input: body,
    });
    response.json(result);
  }));
}

function requireWorkflowWrite(context: SessionContext): void {
  if (!hasBusinessCapability(context.user.role, "manage_workflow")) {
    throw Object.assign(new Error("Forbidden: role cannot execute Agent OS workflows"), { statusCode: 403 });
  }
}

function toJsonValue(value: unknown, field: string): import("../agent-os/types.js").JsonValue {
  if (value === undefined) throw Object.assign(new Error(`${field} is required`), { statusCode: 400 });
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw Object.assign(new Error(`${field} must be JSON serializable`), { statusCode: 400 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw Object.assign(new Error(`${field} must be valid JSON`), { statusCode: 400 });
  }
  if (!isJsonValue(parsed)) throw Object.assign(new Error(`${field} must be valid JSON`), { statusCode: 400 });
  return parsed;
}

function toJsonObject(value: Record<string, unknown>, field: string): import("../agent-os/types.js").JsonObject {
  const parsed = toJsonValue(value, field);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw Object.assign(new Error(`${field} must be a JSON object`), { statusCode: 400 });
  }
  return parsed;
}

function isJsonValue(value: unknown): value is import("../agent-os/types.js").JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}
