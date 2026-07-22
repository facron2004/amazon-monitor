import type { Express, Request } from "express";
import { hasBusinessCapability, type InventoryPlanLevel, type SessionContext } from "@amazon-monitor/shared";
import { z } from "zod";
import {
  buildInventoryPlanTask,
  hasActionableInventoryEvidence,
  inventoryPlanTaskSourceId
} from "../services/inventory-task-service.js";
import type { Store } from "../store.js";
import { asyncHandler } from "./http-utils.js";
import { validateBody, validateIdParam, validateQuery } from "./validation.js";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const productSyncStatusSchema = z.enum(["pending", "success", "partial", "failed", "manual"]);

const inventoryQuerySchema = z.object({
  date: isoDateSchema.optional(),
  productId: z.coerce.number().int().min(1).optional(),
  q: z.string().max(200).optional(),
  level: z.enum(["healthy", "watch", "critical", "overstock"]).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const inventorySettingSchema = z.object({
  leadTimeDays: z.number().min(0).max(365).nullable().optional(),
  productionLeadTimeDays: z.number().min(0).max(365).nullable().optional(),
  inboundLeadTimeDays: z.number().min(0).max(365).nullable().optional(),
  safetyStockDays: z.number().min(0).max(365).nullable().optional(),
  targetStockDays: z.number().min(1).max(730).nullable().optional(),
  minOrderQuantity: z.number().int().min(0).nullable().optional(),
  packSize: z.number().int().min(1).nullable().optional(),
  supplierName: z.string().max(200).nullable().optional(),
  reorderPointUnits: z.number().int().min(0).nullable().optional(),
  inTransitUnits: z.number().int().min(0).nullable().optional(),
  localWarehouseUnits: z.number().int().min(0).nullable().optional(),
  expectedArrivalDate: isoDateSchema.nullable().optional(),
  dataSource: z.string().max(80).optional(),
  lastSyncedAt: z.string().max(80).nullable().optional(),
  syncStatus: productSyncStatusSchema.optional(),
  syncError: z.string().max(1000).nullable().optional()
});

const inventoryTaskSchema = z.object({
  date: isoDateSchema.optional()
});

function requireSessionContext(request: Request): SessionContext {
  const ctx = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!ctx) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  return ctx;
}

function requireOperatorOrAdmin(ctx: SessionContext): void {
  if (ctx.user.role !== "admin" && ctx.user.role !== "operator") {
    throw Object.assign(new Error("Forbidden: only operator or admin can manage inventory settings"), { statusCode: 403 });
  }
}

function requireWorkflowManagement(ctx: SessionContext): void {
  if (!hasBusinessCapability(ctx.user.role, "manage_workflow")) {
    throw Object.assign(new Error("Forbidden: role cannot create inventory tasks"), { statusCode: 403 });
  }
}

export function registerInventoryRoutes(app: Express, store: Store): void {
  app.get("/api/inventory/plans", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(inventoryQuerySchema, request.query);
    ensureProductInOrg(store, query.productId, ctx.organization.id);
    response.json(store.listInventoryPlans({
      orgId: ctx.organization.id,
      productId: query.productId,
      date: query.date,
      q: query.q,
      level: query.level as InventoryPlanLevel | undefined,
      limit: query.limit,
      offset: query.offset
    }));
  }));

  app.get("/api/products/:id/inventory-plan", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    const query = validateQuery(inventoryQuerySchema.pick({ date: true }), request.query);
    const plan = store.getInventoryPlan(id, { orgId: ctx.organization.id, date: query.date });
    if (!plan) {
      response.status(404).json({ message: "Inventory plan not found" });
      return;
    }
    response.json(plan);
  }));

  app.post("/api/products/:id/inventory-plan/task", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireWorkflowManagement(ctx);
    const id = validateIdParam(request.params.id);
    const data = validateBody(inventoryTaskSchema, request.body);
    const plan = store.getInventoryPlan(id, { orgId: ctx.organization.id, date: data.date });
    if (!plan) {
      response.status(404).json({ message: "Inventory plan not found" });
      return;
    }
    if (!hasActionableInventoryEvidence(plan)) {
      response.status(409).json({ message: "Inventory plan has no actionable replenishment or overstock signal" });
      return;
    }

    const sourceId = inventoryPlanTaskSourceId(plan);
    const existingTask = store.listTasks({
      orgId: ctx.organization.id,
      sourceType: "rule",
      sourceId,
      limit: 1
    })[0];
    if (existingTask && existingTask.status !== "cancelled") {
      response.json({ created: false, task: existingTask });
      return;
    }

    const task = store.createTask(buildInventoryPlanTask(plan, {
      orgId: ctx.organization.id,
      createdBy: ctx.user.id
    }));
    response.status(201).json({ created: true, task });
  }));

  app.post("/api/products/:id/inventory-setting", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    ensureProductInOrg(store, id, ctx.organization.id);
    const data = validateBody(inventorySettingSchema, request.body);
    const setting = store.upsertInventorySetting({
      productId: id,
      leadTimeDays: data.leadTimeDays ?? null,
      productionLeadTimeDays: data.productionLeadTimeDays ?? null,
      inboundLeadTimeDays: data.inboundLeadTimeDays ?? null,
      safetyStockDays: data.safetyStockDays ?? null,
      targetStockDays: data.targetStockDays ?? null,
      minOrderQuantity: data.minOrderQuantity ?? null,
      packSize: data.packSize ?? null,
      supplierName: emptyToNull(data.supplierName),
      reorderPointUnits: data.reorderPointUnits ?? null,
      inTransitUnits: data.inTransitUnits ?? null,
      localWarehouseUnits: data.localWarehouseUnits ?? null,
      expectedArrivalDate: data.expectedArrivalDate ?? null,
      dataSource: data.dataSource,
      lastSyncedAt: data.lastSyncedAt ?? null,
      syncStatus: data.syncStatus,
      syncError: data.syncError ?? null
    });
    response.status(201).json({
      setting,
      plan: store.getInventoryPlan(id, { orgId: ctx.organization.id })
    });
  }));
}

function ensureProductInOrg(store: Store, productId: number | undefined, orgId: number): void {
  if (productId === undefined) return;
  const product = store.getProduct(productId);
  if (!product || product.orgId !== orgId) {
    throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
