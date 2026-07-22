import type { Express, Request } from "express";
import { hasBusinessCapability, type SessionContext } from "@amazon-monitor/shared";
import { z } from "zod";
import { runOperationalAlertRules } from "../services/rule-runtime-service.js";
import type { Store } from "../store.js";
import { asyncHandler } from "./http-utils.js";
import {
  alertRuleIdParamSchema,
  alertRuleQuerySchema,
  updateAlertRuleSchema,
  validateBody,
  validateQuery
} from "./validation.js";

const runRulesSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ruleIds: z.array(alertRuleIdParamSchema).max(10).optional()
});

function requireSessionContext(request: Request): SessionContext {
  const ctx = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!ctx) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  return ctx;
}

function requireRuleManagement(ctx: SessionContext): void {
  if (!hasBusinessCapability(ctx.user.role, "manage_rules")) {
    throw Object.assign(new Error("Forbidden: role cannot manage alert rules"), { statusCode: 403 });
  }
}

function validateRuleId(raw: string): string {
  const result = alertRuleIdParamSchema.safeParse(raw);
  if (!result.success) {
    throw Object.assign(new Error(result.error.issues.map((issue) => issue.message).join("; ")), { statusCode: 400 });
  }
  return result.data;
}

export function registerRuleRoutes(app: Express, store: Store): void {
  app.get("/api/rules", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(alertRuleQuerySchema, request.query);
    response.json(store.listAlertRules({
      orgId: ctx.organization.id,
      category: query.category,
      enabled: query.enabled,
      q: query.q
    }));
  }));

  app.post("/api/rules/run", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireRuleManagement(ctx);
    const data = validateBody(runRulesSchema, request.body);
    response.json(runOperationalAlertRules(store, {
      orgId: ctx.organization.id,
      date: data.date,
      ruleIds: data.ruleIds
    }));
  }));

  app.get("/api/rules/:ruleId", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const ruleId = validateRuleId(request.params.ruleId);
    const rule = store.getAlertRule(ctx.organization.id, ruleId);
    if (!rule) {
      response.status(404).json({ message: "Alert rule not found" });
      return;
    }
    response.json(rule);
  }));

  app.patch("/api/rules/:ruleId", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireRuleManagement(ctx);
    const ruleId = validateRuleId(request.params.ruleId);
    const data = validateBody(updateAlertRuleSchema, request.body);
    response.json(store.upsertAlertRuleConfig({
      orgId: ctx.organization.id,
      ruleId,
      enabled: data.enabled,
      severity: data.severity,
      conditions: data.conditions,
      cooldownHours: data.cooldownHours,
      notes: data.notes,
      updatedBy: ctx.user.id
    }));
  }));

  app.delete("/api/rules/:ruleId/config", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireRuleManagement(ctx);
    const ruleId = validateRuleId(request.params.ruleId);
    response.json(store.resetAlertRuleConfig(ctx.organization.id, ruleId));
  }));
}
