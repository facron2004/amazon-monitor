import type { Express, Request } from "express";
import { hasBusinessCapability, type SessionContext } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { asyncHandler } from "./http-utils.js";
import {
  createSopSchema,
  idParamSchema,
  sopListQuerySchema,
  updateSopSchema,
  validateBody,
  validateIdParam,
  validateQuery
} from "./validation.js";

function requireSessionContext(req: Request): SessionContext {
  const ctx = (req as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!ctx) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  return ctx;
}

function requireOperatorOrAdmin(ctx: SessionContext): void {
  if (!hasBusinessCapability(ctx.user.role, "manage_workflow")) {
    throw Object.assign(new Error("Forbidden: role cannot manage SOPs"), { statusCode: 403 });
  }
}

function requireOrganizationSop(store: Store, id: number, ctx: SessionContext) {
  const sop = store.getSop(id);
  if (!sop || sop.orgId !== ctx.organization.id) {
    throw Object.assign(new Error("SOP not found"), { statusCode: 404 });
  }
  return sop;
}

export function registerSopRoutes(app: Express, store: Store): void {
  app.get("/api/sops", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const filter = validateQuery(sopListQuerySchema, request.query);
    response.json(
      store.listSops({
        orgId: ctx.organization.id,
        status: filter.status,
        category: filter.category,
        q: filter.q,
        limit: filter.limit,
        offset: filter.offset
      })
    );
  }));

  app.get("/api/sops/:id", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    response.json(requireOrganizationSop(store, id, ctx));
  }));

  app.post("/api/sops", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const data = validateBody(createSopSchema, request.body);
    if (data.sourceTaskId !== undefined && data.sourceTaskId !== null) {
      const sourceTask = store.getTask(data.sourceTaskId);
      if (!sourceTask) {
        response.status(404).json({ message: `Task ${data.sourceTaskId} not found` });
        return;
      }
      if (sourceTask.orgId !== ctx.user.orgId) {
        response.status(403).json({ message: "Forbidden: task belongs to another organization" });
        return;
      }
    }
    const sop = store.createSop({
      orgId: ctx.user.orgId,
      title: data.title,
      category: data.category,
      bodyMd: data.bodyMd,
      sourceTaskId: data.sourceTaskId ?? null,
      tags: data.tags ?? [],
      createdBy: ctx.user.id
    });
    response.status(201).json(sop);
  }));

  app.patch("/api/sops/:id", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    requireOrganizationSop(store, id, ctx);
    const data = validateBody(updateSopSchema, request.body);
    const sop = store.updateSop(id, data);
    response.json(sop);
  }));

  app.post("/api/sops/:id/publish", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    requireOrganizationSop(store, id, ctx);
    response.json(store.publishSop(id));
  }));

  app.post("/api/sops/:id/archive", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    requireOrganizationSop(store, id, ctx);
    response.json(store.archiveSop(id));
  }));
}

// avoid unused idParamSchema import warning when route table changes
void idParamSchema;
