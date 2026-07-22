import type { Express, Request } from "express";
import {
  buildProductProfitActionOptions,
  hasBusinessCapability,
  profitActionKinds,
  type ProfitActionKind,
  type ProductProfitPlan,
  type ProfitPlanLevel,
  type SessionContext
} from "@amazon-monitor/shared";
import { z } from "zod";
import {
  buildProfitActionTask,
  profitActionTaskSourceId
} from "../services/profit-action-task-service.js";
import type { Store } from "../store.js";
import { asyncHandler } from "./http-utils.js";
import { validateBody, validateIdParam, validateQuery } from "./validation.js";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const productSyncStatusSchema = z.enum(["pending", "success", "partial", "failed", "manual"]);

const profitQuerySchema = z.object({
  date: isoDateSchema.optional(),
  productId: z.coerce.number().int().min(1).optional(),
  q: z.string().max(200).optional(),
  level: z.enum(["healthy", "watch", "risk", "data_gap"]).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const profitSettingSchema = z.object({
  purchaseCost: z.number().min(0).nullable().optional(),
  inboundFreight: z.number().min(0).nullable().optional(),
  fbaFee: z.number().min(0).nullable().optional(),
  referralFeeRate: z.number().min(0).max(1).nullable().optional(),
  storageFee: z.number().min(0).nullable().optional(),
  returnLossRate: z.number().min(0).max(1).nullable().optional(),
  targetMarginRate: z.number().min(0).max(1).nullable().optional(),
  minimumMarginRate: z.number().min(0).max(1).nullable().optional(),
  dealFee: z.number().min(0).nullable().optional(),
  dataSource: z.string().max(80).optional(),
  lastSyncedAt: z.string().max(80).nullable().optional(),
  syncStatus: productSyncStatusSchema.optional(),
  syncError: z.string().max(1000).nullable().optional()
});

const profitActionTaskSchema = z.object({
  date: isoDateSchema.optional(),
  actionKind: z.enum(profitActionKinds)
});

function requireSessionContext(request: Request): SessionContext {
  const ctx = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!ctx) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  return ctx;
}

function requireProfitAccess(ctx: SessionContext): "full" | "summary" {
  if (!hasBusinessCapability(ctx.user.role, "view_profit")) {
    throw Object.assign(new Error("Forbidden: role cannot view profit plans"), { statusCode: 403 });
  }
  return hasBusinessCapability(ctx.user.role, "view_profit_details") ? "full" : "summary";
}

function requireProfitManagement(ctx: SessionContext): void {
  if (!hasBusinessCapability(ctx.user.role, "manage_profit")) {
    throw Object.assign(new Error("Forbidden: role cannot manage profit settings"), { statusCode: 403 });
  }
}

function requireWorkflowManagement(ctx: SessionContext): void {
  if (!hasBusinessCapability(ctx.user.role, "manage_workflow")) {
    throw Object.assign(new Error("Forbidden: role cannot create price action tasks"), { statusCode: 403 });
  }
}

export function registerProfitRoutes(app: Express, store: Store): void {
  app.get("/api/profit/plans", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const access = requireProfitAccess(ctx);
    const query = validateQuery(profitQuerySchema, request.query);
    ensureProductInOrg(store, query.productId, ctx.organization.id);
    const plans = store.listProfitPlans({
      orgId: ctx.organization.id,
      productId: query.productId,
      date: query.date,
      q: query.q,
      level: query.level as ProfitPlanLevel | undefined,
      limit: query.limit,
      offset: query.offset
    });
    response.json(access === "full" ? plans : plans.map(toProfitSummary));
  }));

  app.get("/api/products/:id/profit-plan", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const access = requireProfitAccess(ctx);
    const id = validateIdParam(request.params.id);
    const query = validateQuery(profitQuerySchema.pick({ date: true }), request.query);
    const plan = store.getProfitPlan(id, { orgId: ctx.organization.id, date: query.date });
    if (!plan) {
      response.status(404).json({ message: "Profit plan not found" });
      return;
    }
    response.json(access === "full" ? plan : toProfitSummary(plan));
  }));

  app.post("/api/products/:id/profit-plan/task", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireProfitAccess(ctx);
    requireWorkflowManagement(ctx);
    const id = validateIdParam(request.params.id);
    const data = validateBody(profitActionTaskSchema, request.body);
    const plan = store.getProfitPlan(id, { orgId: ctx.organization.id, date: data.date });
    if (!plan) {
      response.status(404).json({ message: "Profit plan not found" });
      return;
    }
    const option = buildProductProfitActionOptions(plan)
      .find((item) => item.kind === (data.actionKind as ProfitActionKind));
    if (!option) {
      response.status(400).json({ message: "Profit action option not found" });
      return;
    }
    if (!option.safe) {
      response.status(409).json({
        message: `Profit action is outside configured guardrails: ${option.blockedReasons.join(", ")}`
      });
      return;
    }

    const sourceId = profitActionTaskSourceId(plan, option);
    const existingTask = store.listTasks({
      orgId: ctx.organization.id,
      sourceType: "rule",
      sourceId,
      limit: 1
    })[0];
    if (existingTask && existingTask.status !== "cancelled") {
      response.json({ created: false, option, task: existingTask });
      return;
    }

    const inventoryPlan = store.getInventoryPlan(id, {
      orgId: ctx.organization.id,
      date: data.date
    });
    const task = store.createTask(buildProfitActionTask(plan, option, inventoryPlan, {
      orgId: ctx.organization.id,
      createdBy: ctx.user.id
    }));
    response.status(201).json({ created: true, option, task });
  }));

  app.post("/api/products/:id/profit-setting", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireProfitManagement(ctx);
    const id = validateIdParam(request.params.id);
    ensureProductInOrg(store, id, ctx.organization.id);
    const data = validateBody(profitSettingSchema, request.body);
    const setting = store.upsertProfitSetting({
      productId: id,
      purchaseCost: data.purchaseCost ?? null,
      inboundFreight: data.inboundFreight ?? null,
      fbaFee: data.fbaFee ?? null,
      referralFeeRate: data.referralFeeRate ?? null,
      storageFee: data.storageFee ?? null,
      returnLossRate: data.returnLossRate ?? null,
      targetMarginRate: data.targetMarginRate ?? null,
      minimumMarginRate: data.minimumMarginRate ?? null,
      dealFee: data.dealFee ?? null,
      dataSource: data.dataSource,
      lastSyncedAt: data.lastSyncedAt ?? null,
      syncStatus: data.syncStatus,
      syncError: data.syncError ?? null
    });
    response.status(201).json({
      setting,
      plan: store.getProfitPlan(id, { orgId: ctx.organization.id })
    });
  }));
}

function toProfitSummary(plan: ProductProfitPlan): ProductProfitPlan {
  return {
    ...plan,
    latestMetric: null,
    setting: null,
    salesAmount: null,
    unitsSold: null,
    adSpend: null,
    adCostPerUnit: null,
    tacos: null,
    grossMargin: null,
    scenarios: plan.scenarios.map((scenario) => ({
      ...scenario,
      grossRevenue: null,
      productCost: null,
      platformFees: null,
      adCost: null,
      promoCost: null,
      netProfit: null,
      profitPerUnit: null
    }))
  };
}

function ensureProductInOrg(store: Store, productId: number | undefined, orgId: number): void {
  if (productId === undefined) return;
  const product = store.getProduct(productId);
  if (!product || product.orgId !== orgId) {
    throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  }
}
