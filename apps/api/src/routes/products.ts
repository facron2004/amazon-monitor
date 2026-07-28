import type { Express, Request } from "express";
import type { OwnedProductStatus, SessionContext } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { buildProductOperationsDetail } from "../services/product-operations-service.js";
import { asyncHandler, optionalString } from "./http-utils.js";
import {
  createOwnedProductSchema,
  productListQuerySchema,
  productMetricQuerySchema,
  productMetricSchema,
  updateOwnedProductSchema,
  validateBody,
  validateIdParam,
  validateQuery
} from "./validation.js";

function requireSessionContext(request: Request): SessionContext {
  const ctx = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!ctx) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  return ctx;
}

function requireOperatorOrAdmin(ctx: SessionContext): void {
  if (ctx.user.role !== "admin" && ctx.user.role !== "operator") {
    throw Object.assign(new Error("Forbidden: only operator or admin can manage products"), { statusCode: 403 });
  }
}

export function registerProductRoutes(app: Express, store: Store): void {
  app.get("/api/products", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const query = validateQuery(productListQuerySchema, request.query);
    response.json(store.listProducts({
      orgId: ctx.organization.id,
      storeId: query.storeId,
      status: query.status as OwnedProductStatus | undefined,
      marketplace: query.marketplace,
      brand: query.brand,
      q: query.q,
      date: query.date,
      limit: query.limit,
      offset: query.offset
    }));
  }));

  app.post("/api/products", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const data = validateBody(createOwnedProductSchema, request.body);
    ensureStoreAssignment(store, data.storeId, ctx.organization.id, data.marketplace, true);
    try {
      const product = store.createProduct({
        orgId: ctx.organization.id,
        storeId: data.storeId ?? null,
        marketplace: data.marketplace,
        sku: data.sku,
        asin: data.asin,
        brand: data.brand ?? null,
        title: data.title,
        imageUrl: data.imageUrl ?? null,
        category: data.category ?? null,
        ownerId: data.ownerId ?? null,
        status: data.status,
        dataSource: data.dataSource,
        lastSyncedAt: data.lastSyncedAt ?? null,
        syncStatus: data.syncStatus,
        syncError: data.syncError ?? null
      });
      response.status(201).json(product);
    } catch (error) {
      if ((error as Error).message.includes("UNIQUE")) {
        response.status(409).json({ message: "Product SKU already exists for this marketplace" });
        return;
      }
      throw error;
    }
  }));

  app.get("/api/products/:id/metrics", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    const product = store.getProduct(id);
    if (!product || product.orgId !== ctx.organization.id) {
      response.status(404).json({ message: "Product not found" });
      return;
    }
    const query = validateQuery(productMetricQuerySchema, request.query);
    response.json(store.listProductDailyMetrics(id, query));
  }));

  app.post("/api/products/:id/metrics", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    const product = store.getProduct(id);
    if (!product || product.orgId !== ctx.organization.id) {
      response.status(404).json({ message: "Product not found" });
      return;
    }
    const data = validateBody(productMetricSchema, request.body);
    const metric = store.upsertProductDailyMetric({
      productId: id,
      date: data.date,
      sessions: data.sessions ?? null,
      pageViews: data.pageViews ?? null,
      orders: data.orders ?? null,
      unitsSold: data.unitsSold ?? null,
      salesAmount: data.salesAmount ?? null,
      buyBoxPercentage: data.buyBoxPercentage ?? null,
      conversionRate: data.conversionRate ?? null,
      rating: data.rating ?? null,
      reviewCount: data.reviewCount ?? null,
      bsrRank: data.bsrRank ?? null,
      inventoryAvailable: data.inventoryAvailable ?? null,
      inventoryDays: data.inventoryDays ?? null,
      adSpend: data.adSpend ?? null,
      adSales: data.adSales ?? null,
      acos: data.acos ?? null,
      tacos: data.tacos ?? null,
      grossMargin: data.grossMargin ?? null,
      keywordRank: data.keywordRank ?? null,
      dataSource: data.dataSource,
      lastSyncedAt: data.lastSyncedAt ?? null,
      syncStatus: data.syncStatus,
      syncError: data.syncError ?? null
    });
    response.status(201).json(metric);
  }));

  app.get("/api/products/:id/risk-score", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    const product = store.getProduct(id);
    if (!product || product.orgId !== ctx.organization.id) {
      response.status(404).json({ message: "Product not found" });
      return;
    }
    response.json(store.getProductRiskScore(id, optionalString(request.query.date)));
  }));

  app.get("/api/products/:id/opportunity-score", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    const product = store.getProduct(id);
    if (!product || product.orgId !== ctx.organization.id) {
      response.status(404).json({ message: "Product not found" });
      return;
    }
    response.json(store.getProductOpportunityScore(id, optionalString(request.query.date)));
  }));

  app.get("/api/products/:id/operations", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    const query = validateQuery(productListQuerySchema.pick({ date: true }), request.query);
    const detail = buildProductOperationsDetail(store, {
      productId: id,
      orgId: ctx.organization.id,
      role: ctx.user.role,
      date: query.date,
    });
    if (!detail) {
      response.status(404).json({ message: "Product not found" });
      return;
    }
    response.json(detail);
  }));

  app.get("/api/products/:id", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    const detail = store.getProductDetail(id, optionalString(request.query.date));
    if (!detail || detail.orgId !== ctx.organization.id) {
      response.status(404).json({ message: "Product not found" });
      return;
    }
    response.json(detail);
  }));

  app.patch("/api/products/:id", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    const product = store.getProduct(id);
    if (!product || product.orgId !== ctx.organization.id) {
      response.status(404).json({ message: "Product not found" });
      return;
    }
    const data = validateBody(updateOwnedProductSchema, request.body);
    const marketplace = data.marketplace ?? product.marketplace;
    const storeId = data.storeId !== undefined ? data.storeId : product.storeId;
    ensureStoreAssignment(store, storeId, ctx.organization.id, marketplace, data.storeId !== undefined && data.storeId !== product.storeId);
    response.json(store.updateProduct(id, data));
  }));
}

function ensureStoreAssignment(
  store: Store,
  storeId: number | null | undefined,
  orgId: number,
  marketplace: string,
  requireActive: boolean
): void {
  if (storeId == null) return;
  const commerceStore = store.getCommerceStore(storeId);
  if (!commerceStore || commerceStore.orgId !== orgId) {
    throw Object.assign(new Error("Store not found"), { statusCode: 404 });
  }
  if (commerceStore.marketplace.toLowerCase() !== marketplace.toLowerCase()) {
    throw Object.assign(new Error("Product marketplace must match the assigned store"), { statusCode: 400 });
  }
  if (requireActive && commerceStore.status !== "active") {
    throw Object.assign(new Error("Cannot assign products to a paused store"), { statusCode: 409 });
  }
}
