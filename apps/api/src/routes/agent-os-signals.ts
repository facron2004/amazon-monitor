import type { Express, Request } from "express";
import { z } from "zod";
import { hasBusinessCapability, type SessionContext } from "@amazon-monitor/shared";
import {
  agentSignalStatuses,
  getRankingSignal,
  listRankingSignals,
  updateRankingSignalStatus,
  type AgentSignalStatus,
} from "../agent-os/signal-engine.js";
import { AgentOsWorkflowRunner } from "../agent-os/workflow-runner.js";
import type { JsonValue } from "../agent-os/types.js";
import type { Store } from "../store.js";
import { asyncHandler, optionalNumber } from "./http-utils.js";
import { validateBody, validateQuery } from "./validation.js";

const signalListSchema = z.object({
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
}).strict();

const statusSchema = z.object({
  status: z.enum(agentSignalStatuses),
}).strict();

const investigateSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(240).optional(),
}).strict();

function sessionContext(request: Request): SessionContext {
  const context = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!context) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  return context;
}

export function registerAgentOsSignalRoutes(app: Express, hostStore: Store): void {
  const runner = new AgentOsWorkflowRunner(hostStore);

  app.get("/api/agent-os/signals", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const query = validateQuery(signalListSchema, {
      limit: optionalNumber(request.query.limit),
      offset: optionalNumber(request.query.offset),
    });
    response.json(listRankingSignals(hostStore, context.organization.id, query));
  }));

  app.post("/api/agent-os/signals/:id/investigate", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    requireWorkflowWrite(context);
    const body = validateBody(investigateSchema, request.body ?? {});
    const signalId = signalIdFromRequest(request);
    const signal = getRankingSignal(hostStore, context.organization.id, signalId);
    if (!signal) {
      response.status(404).json({ message: "Agent signal not found" });
      return;
    }

    const result = await runner.start({
      organizationId: context.organization.id,
      workflowId: "ranking-jump-analysis",
      triggerType: "RANKING_JUMP_SIGNAL",
      triggerSource: `signal:${signal.id}`,
      input: toJsonValue({ signal, rankingResponse: "investigate" }, "signal input"),
      context: { signalId: signal.id, signalType: signal.type },
      idempotencyKey: body.idempotencyKey ?? `signal:${context.organization.id}:${signal.id}:investigate`,
    });
    const updatedSignal = result.run.status === "FAILED"
      ? signal
      : updateRankingSignalStatus(hostStore, context.organization.id, signal.id, "INVESTIGATING") ?? signal;
    response.status(201).json({ signal: updatedSignal, workflow: result });
  }));

  app.get("/api/agent-os/signals/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    const signal = getRankingSignal(hostStore, context.organization.id, signalIdFromRequest(request));
    if (!signal) {
      response.status(404).json({ message: "Agent signal not found" });
      return;
    }
    response.json(signal);
  }));

  app.patch("/api/agent-os/signals/:id", asyncHandler(async (request, response) => {
    const context = sessionContext(request);
    requireWorkflowWrite(context);
    const body = validateBody(statusSchema, request.body ?? {});
    const signal = updateRankingSignalStatus(
      hostStore,
      context.organization.id,
      signalIdFromRequest(request),
      body.status as AgentSignalStatus,
    );
    if (!signal) {
      response.status(404).json({ message: "Agent signal not found" });
      return;
    }
    response.json(signal);
  }));
}

function requireWorkflowWrite(context: SessionContext): void {
  if (!hasBusinessCapability(context.user.role, "manage_workflow")) {
    throw Object.assign(new Error("Forbidden: role cannot manage Agent OS signals"), { statusCode: 403 });
  }
}

function signalIdFromRequest(request: Request): string {
  const id = request.params.id?.trim();
  if (!id || id.length > 300) throw Object.assign(new Error("Invalid signal id"), { statusCode: 400 });
  return id;
}

function toJsonValue(value: unknown, field: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item, field));
  if (typeof value === "object" && value !== null) {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) result[key] = toJsonValue(item, `${field}.${key}`);
    return result;
  }
  throw Object.assign(new Error(`${field} must be JSON serializable`), { statusCode: 400 });
}
