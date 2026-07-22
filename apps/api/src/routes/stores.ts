import type { Express, Request } from "express";
import {
  commerceStoreAuthStatuses,
  commerceStorePlatforms,
  commerceStoreStatuses,
  hasBusinessCapability,
  type CommerceStoreStatus,
  type SessionContext
} from "@amazon-monitor/shared";
import { z } from "zod";
import type { Store } from "../store.js";
import { asyncHandler } from "./http-utils.js";
import { validateBody, validateIdParam, validateQuery } from "./validation.js";

const platformSchema = z.enum(commerceStorePlatforms);
const statusSchema = z.enum(commerceStoreStatuses);
const authStatusSchema = z.enum(commerceStoreAuthStatuses);

const storeListQuerySchema = z.object({
  marketplace: z.string().max(100).optional(),
  status: statusSchema.optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

const storeCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  platform: platformSchema.optional(),
  marketplace: z.string().trim().min(1).max(100),
  sellerId: z.string().trim().min(1).max(200),
  authStatus: authStatusSchema.optional(),
  status: statusSchema.optional()
});

const storeUpdateSchema = storeCreateSchema.partial();

export function registerStoreRoutes(app: Express, store: Store): void {
  app.get("/api/stores", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(storeListQuerySchema, request.query);
    response.json(store.listCommerceStores({
      orgId: ctx.organization.id,
      marketplace: query.marketplace,
      status: query.status as CommerceStoreStatus | undefined,
      q: query.q,
      limit: query.limit,
      offset: query.offset
    }));
  }));

  app.post("/api/stores", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireStoreManagement(ctx);
    const data = validateBody(storeCreateSchema, request.body);
    try {
      response.status(201).json(store.createCommerceStore({
        orgId: ctx.organization.id,
        name: data.name,
        platform: data.platform,
        marketplace: data.marketplace,
        sellerId: data.sellerId,
        authStatus: data.authStatus,
        status: data.status
      }));
    } catch (error) {
      handleUniqueConflict(error);
    }
  }));

  app.patch("/api/stores/:id", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireStoreManagement(ctx);
    const id = validateIdParam(request.params.id);
    const existing = store.getCommerceStore(id);
    if (!existing || existing.orgId !== ctx.organization.id) {
      response.status(404).json({ message: "Store not found" });
      return;
    }
    const data = validateBody(storeUpdateSchema, request.body);
    if (
      data.marketplace !== undefined
      && data.marketplace.toLowerCase() !== existing.marketplace.toLowerCase()
      && store.listProducts({ orgId: ctx.organization.id, storeId: id, limit: 1 }).length > 0
    ) {
      throw Object.assign(new Error("Cannot change marketplace while products are assigned to this store"), { statusCode: 409 });
    }
    try {
      response.json(store.updateCommerceStore(id, data));
    } catch (error) {
      handleUniqueConflict(error);
    }
  }));
}

function requireSessionContext(request: Request): SessionContext {
  const ctx = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!ctx) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  return ctx;
}

function requireStoreManagement(ctx: SessionContext): void {
  if (!hasBusinessCapability(ctx.user.role, "manage_data_sources")) {
    throw Object.assign(new Error("Forbidden: role cannot manage stores"), { statusCode: 403 });
  }
}

function handleUniqueConflict(error: unknown): never {
  if ((error as Error).message.includes("UNIQUE")) {
    throw Object.assign(new Error("Store seller account already exists for this marketplace"), { statusCode: 409 });
  }
  throw error;
}
