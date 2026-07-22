import type { Express, Request } from "express";
import {
  buildPromotionPlanView,
  hasBusinessCapability,
  isoDate,
  promotionPlanStatuses,
  promotionPlanTypes,
  type PromotionPlan,
  type PromotionPlanStatus,
  type SessionContext
} from "@amazon-monitor/shared";
import { z } from "zod";
import type { Store } from "../store.js";
import { asyncHandler } from "./http-utils.js";
import { validateBody, validateIdParam, validateQuery } from "./validation.js";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableMoney = z.number().finite().min(0).nullable().optional();

const promotionListSchema = z.object({
  asOf: dateSchema.optional(),
  storeId: z.coerce.number().int().positive().optional(),
  productId: z.coerce.number().int().positive().optional(),
  status: z.enum(promotionPlanStatuses).optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const promotionFields = {
  storeId: z.number().int().positive().nullable().optional(),
  productId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  type: z.enum(promotionPlanTypes),
  marketplace: z.string().trim().min(1).max(100),
  startDate: dateSchema,
  endDate: dateSchema,
  status: z.enum(promotionPlanStatuses).optional(),
  targetPrice: nullableMoney,
  budget: nullableMoney,
  inventoryTarget: z.number().int().min(0).nullable().optional(),
  notes: z.string().trim().max(3000).nullable().optional()
};

const promotionCreateSchema = z.object(promotionFields)
  .refine((data) => data.endDate >= data.startDate, { message: "endDate must be on or after startDate" });

const promotionUpdateSchema = z.object(promotionFields).partial();

const promotionTaskSchema = z.object({ kind: z.enum(["preparation", "review"]) });

export function registerPromotionRoutes(app: Express, store: Store): void {
  app.get("/api/promotions", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(promotionListSchema, request.query);
    const asOf = query.asOf ?? isoDate();
    const plans = store.listPromotionPlans({
      orgId: ctx.organization.id,
      storeId: query.storeId,
      productId: query.productId,
      status: query.status as PromotionPlanStatus | undefined,
      fromDate: query.fromDate,
      toDate: query.toDate,
      q: query.q,
      limit: query.limit,
      offset: query.offset
    });
    response.json(plans.map((plan) => buildPromotionPlanView(plan, asOf)));
  }));

  app.post("/api/promotions", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireWorkflowManagement(ctx);
    const data = validateBody(promotionCreateSchema, request.body);
    validateRelations(store, ctx, data);
    const plan = store.createPromotionPlan({ ...data, orgId: ctx.organization.id, createdBy: ctx.user.id });
    response.status(201).json(buildPromotionPlanView(plan, isoDate()));
  }));

  app.patch("/api/promotions/:id", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireWorkflowManagement(ctx);
    const existing = requirePromotion(store, validateIdParam(request.params.id), ctx);
    const data = validateBody(promotionUpdateSchema, request.body);
    const effective = { ...existing, ...data };
    if (effective.endDate < effective.startDate) {
      throw Object.assign(new Error("endDate must be on or after startDate"), { statusCode: 400 });
    }
    validateRelations(store, ctx, effective);
    const updated = store.updatePromotionPlan(existing.id, data);
    response.json(buildPromotionPlanView(updated as PromotionPlan, isoDate()));
  }));

  app.post("/api/promotions/:id/tasks", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireWorkflowManagement(ctx);
    const plan = requirePromotion(store, validateIdParam(request.params.id), ctx);
    const { kind } = validateBody(promotionTaskSchema, request.body);
    const existingTaskId = kind === "preparation" ? plan.preparationTaskId : plan.reviewTaskId;
    const existingTask = existingTaskId ? store.getTask(existingTaskId) : null;
    if (existingTask?.orgId === ctx.organization.id) {
      response.json({ created: false, plan: buildPromotionPlanView(plan, isoDate()), task: existingTask });
      return;
    }

    const label = kind === "preparation" ? "活动准备" : "活动复盘";
    const task = store.createTask({
      orgId: ctx.organization.id,
      sourceType: "manual",
      sourceId: `promotion:${plan.id}:${kind}`,
      title: `${label}：${plan.name}`,
      description: promotionTaskDescription(plan, kind),
      taskType: kind === "review" ? "campaign_recap" : "other",
      priority: "P1",
      assigneeId: null,
      dueDate: kind === "review" ? addDays(plan.endDate, 1) : plan.startDate,
      relatedAsin: plan.asin,
      relatedKeyword: null,
      relatedBrand: plan.brand,
      relatedCategoryId: null,
      aiRecommendation: kind === "review"
        ? "复盘活动前后价格、销量、广告、库存和排名变化，并记录可复用结论。"
        : "确认价格、库存、广告预算、Listing 素材和审批状态后再执行活动。",
      createdBy: ctx.user.id
    });
    const linked = store.linkPromotionTask(plan.id, kind, task.id);
    response.status(201).json({ created: true, plan: buildPromotionPlanView(linked, isoDate()), task });
  }));
}

function validateRelations(
  store: Store,
  ctx: SessionContext,
  input: { storeId?: number | null; productId?: number | null; marketplace: string }
): void {
  const commerceStore = input.storeId ? store.getCommerceStore(input.storeId) : null;
  if (input.storeId && (!commerceStore || commerceStore.orgId !== ctx.organization.id)) {
    throw Object.assign(new Error("Store not found"), { statusCode: 404 });
  }
  const product = input.productId ? store.getProduct(input.productId) : null;
  if (input.productId && (!product || product.orgId !== ctx.organization.id)) {
    throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  }
  const marketplace = input.marketplace.toLowerCase();
  if (commerceStore && commerceStore.marketplace.toLowerCase() !== marketplace) {
    throw Object.assign(new Error("Store marketplace does not match promotion marketplace"), { statusCode: 400 });
  }
  if (product && product.marketplace.toLowerCase() !== marketplace) {
    throw Object.assign(new Error("Product marketplace does not match promotion marketplace"), { statusCode: 400 });
  }
  if (product?.storeId && input.storeId && product.storeId !== input.storeId) {
    throw Object.assign(new Error("Product belongs to another store"), { statusCode: 409 });
  }
}

function requireSessionContext(request: Request): SessionContext {
  const ctx = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!ctx) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  return ctx;
}

function requireWorkflowManagement(ctx: SessionContext): void {
  if (!hasBusinessCapability(ctx.user.role, "manage_workflow")) {
    throw Object.assign(new Error("Forbidden: role cannot manage promotion plans"), { statusCode: 403 });
  }
}

function requirePromotion(store: Store, id: number, ctx: SessionContext): PromotionPlan {
  const plan = store.getPromotionPlan(id);
  if (!plan || plan.orgId !== ctx.organization.id) {
    throw Object.assign(new Error("Promotion plan not found"), { statusCode: 404 });
  }
  return plan;
}

function promotionTaskDescription(plan: PromotionPlan, kind: "preparation" | "review"): string {
  const subject = [plan.storeName, plan.sku, plan.asin].filter(Boolean).join(" · ") || plan.marketplace;
  const objective = kind === "preparation" ? "活动上线前完成准备检查。" : "活动结束后完成效果复盘。";
  return `${objective}\n活动周期：${plan.startDate} 至 ${plan.endDate}\n对象：${subject}${plan.notes ? `\n备注：${plan.notes}` : ""}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
