import { z } from "zod";
import { assertAmazonUrl, isAllowedAmazonMarketplace } from "@amazon-monitor/shared";

const marketplaceSchema = z.string().min(1).max(100).refine(
  isAllowedAmazonMarketplace,
  { message: "marketplace must be a supported Amazon marketplace (US, UK, DE, JP, or an allowed Amazon host)" }
);

export const keywordInputSchema = z.object({
  keyword: z.string().min(1).max(200),
  marketplace: marketplaceSchema,
  zipCode: z.string().max(20).nullable().optional(),
  language: z.string().max(20).optional(),
  categoryTag: z.string().max(100).nullable().optional(),
  crawlPages: z.number().int().min(1).max(10).optional(),
  status: z.enum(["enabled", "disabled"]).optional()
});

export const keywordPatchSchema = z.object({
  keyword: z.string().min(1).max(200).optional(),
  marketplace: marketplaceSchema.optional(),
  zipCode: z.string().max(20).nullable().optional(),
  language: z.string().max(20).optional(),
  categoryTag: z.string().max(100).nullable().optional(),
  crawlPages: z.number().int().min(1).max(10).optional(),
  status: z.enum(["enabled", "disabled"]).optional()
});

const amazonUrlSchema = z.string().min(1).max(2000).refine(
  (val) => {
    try { assertAmazonUrl(val); return true; } catch { return false; }
  },
  { message: "categoryUrl must be a valid Amazon URL (e.g. https://www.amazon.com/...)" }
);
const statusEnumSchema = z.enum(["enabled", "disabled"]);

export const categoryInputSchema = z.object({
  name: z.string().min(1).max(200),
  marketplace: marketplaceSchema,
  categoryUrl: amazonUrlSchema,
  categoryPath: z.string().max(500).nullable().optional(),
  crawlTopN: z.number().int().min(1).max(1000).optional(),
  status: statusEnumSchema.optional()
});

export const categoryPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  marketplace: marketplaceSchema.optional(),
  categoryUrl: amazonUrlSchema.optional(),
  categoryPath: z.string().max(500).nullable().optional(),
  crawlTopN: z.number().int().min(1).max(1000).optional(),
  status: statusEnumSchema.optional()
});

const timeStringSchema = z.string().regex(/^\d{2}:\d{2}$/, "sendTime must be HH:mm");

export const notificationScheduleSchema = z.object({
  name: z.string().min(1).max(200),
  channel: z.enum(["email", "feishu"]).optional(),
  target: z.string().min(1).max(500),
  sendTime: timeStringSchema,
  timezone: z.string().max(100).optional(),
  status: statusEnumSchema.optional()
});

export const notificationSchedulePatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  channel: z.enum(["email", "feishu"]).optional(),
  target: z.string().min(1).max(500).optional(),
  sendTime: timeStringSchema.optional(),
  timezone: z.string().max(100).optional(),
  status: statusEnumSchema.optional()
});

export const alertStatusSchema = z.object({
  status: z.enum(["pending", "viewed", "followed", "ignored"]).optional()
});

export const competitorKeySchema = z.object({
  isKeyCompetitor: z.boolean()
});

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export const limitDaysQuerySchema = z.object({
  limitDays: z.coerce.number().int().min(1).max(365).optional()
});

export const categorySignalQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  categoryId: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, "id must be a positive integer")
});

export const loginSchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500)
});

export const createUserSchema = z.object({
  orgId: z.number().int().min(1).optional(),
  username: z.string().min(1).max(100),
  password: z.string().min(8).max(200),
  role: z.enum(["admin", "operator", "developer"]),
  displayName: z.string().max(200).nullable().optional(),
  email: z.string().email().max(200).nullable().optional()
});

export const bootstrapRegistrationSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(8).max(200),
  displayName: z.string().max(200).nullable().optional(),
  email: z.string().email().max(200).nullable().optional()
});

export const createTaskSchema = z.object({
  sourceType: z.enum(["insight_event", "rule", "manual", "review_recurring"]).default("manual"),
  sourceId: z.string().max(200).nullable().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  taskType: z.string().min(1).max(80),
  priority: z.enum(["P0", "P1", "P2", "P3"]).default("P1"),
  assigneeId: z.number().int().nullable().optional(),
  dueDate: z.string().max(40).nullable().optional(),
  relatedAsin: z.string().max(20).nullable().optional(),
  relatedKeyword: z.string().max(200).nullable().optional(),
  relatedBrand: z.string().max(200).nullable().optional(),
  relatedCategoryId: z.number().int().nullable().optional(),
  aiRecommendation: z.string().max(5000).nullable().optional(),
  linkEventId: z.string().max(200).optional()
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  status: z.enum(["pending", "in_progress", "awaiting_review", "done", "reviewed", "cancelled"]).optional(),
  assigneeId: z.number().int().nullable().optional(),
  dueDate: z.string().max(40).nullable().optional(),
  actionTaken: z.string().max(5000).nullable().optional(),
  resultBeforeJson: z.string().max(20000).nullable().optional(),
  resultAfterJson: z.string().max(20000).nullable().optional(),
  reviewNote: z.string().max(5000).nullable().optional(),
  reviewResult: z.enum(["CONFIRMED", "REVERTED", "CONTINUING", "FAILED", "UNCLEAR"]).nullable().optional()
});

export const createSopSchema = z.object({
  title: z.string().min(1).max(500),
  category: z.enum([
    "competitor_response",
    "price_action",
    "ad_optimization",
    "listing_optimization",
    "review_response",
    "inventory_replenishment",
    "supplier_negotiation",
    "general"
  ]),
  bodyMd: z.string().min(1).max(20000),
  sourceTaskId: z.number().int().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional()
});

export const updateSopSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  bodyMd: z.string().min(1).max(20000).optional(),
  category: z.enum([
    "competitor_response",
    "price_action",
    "ad_optimization",
    "listing_optimization",
    "review_response",
    "inventory_replenishment",
    "supplier_negotiation",
    "general"
  ]).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional()
});

export const taskNoteSchema = z.object({
  body: z.string().min(1).max(5000)
});

export const taskListQuerySchema = z.object({
  status: z.enum(["pending", "in_progress", "awaiting_review", "done", "reviewed", "cancelled"]).optional(),
  statusIn: z.string().optional(),
  assigneeId: z.coerce.number().int().optional(),
  relatedAsin: z.string().optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export const sopListQuerySchema = z.object({
  status: z.enum(["draft", "published", "archived"]).optional(),
  category: z.enum([
    "competitor_response",
    "price_action",
    "ad_optimization",
    "listing_optimization",
    "review_response",
    "inventory_replenishment",
    "supplier_negotiation",
    "general"
  ]).optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export const reviewTaskSchema = z.object({
  reviewResult: z.enum(["CONFIRMED", "REVERTED", "CONTINUING", "FAILED", "UNCLEAR"]),
  reviewNote: z.string().max(5000).optional()
});

const productStatusSchema = z.enum(["active", "paused", "archived"]);
const productSyncStatusSchema = z.enum(["pending", "success", "partial", "failed", "manual"]);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const productListQuerySchema = z.object({
  status: productStatusSchema.optional(),
  marketplace: z.string().max(100).optional(),
  brand: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  date: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export const createOwnedProductSchema = z.object({
  marketplace: z.string().min(1).max(100),
  sku: z.string().min(1).max(120),
  asin: z.string().min(1).max(20),
  brand: z.string().max(200).nullable().optional(),
  title: z.string().min(1).max(500),
  imageUrl: z.string().max(2000).nullable().optional(),
  category: z.string().max(300).nullable().optional(),
  ownerId: z.number().int().nullable().optional(),
  status: productStatusSchema.optional(),
  dataSource: z.string().max(80).optional(),
  lastSyncedAt: z.string().max(80).nullable().optional(),
  syncStatus: productSyncStatusSchema.optional(),
  syncError: z.string().max(1000).nullable().optional()
});

export const updateOwnedProductSchema = createOwnedProductSchema.partial();

export const productMetricSchema = z.object({
  date: isoDateSchema,
  sessions: z.number().nullable().optional(),
  pageViews: z.number().nullable().optional(),
  orders: z.number().nullable().optional(),
  unitsSold: z.number().nullable().optional(),
  salesAmount: z.number().nullable().optional(),
  buyBoxPercentage: z.number().nullable().optional(),
  conversionRate: z.number().nullable().optional(),
  rating: z.number().nullable().optional(),
  reviewCount: z.number().nullable().optional(),
  bsrRank: z.number().nullable().optional(),
  inventoryAvailable: z.number().nullable().optional(),
  inventoryDays: z.number().nullable().optional(),
  adSpend: z.number().nullable().optional(),
  adSales: z.number().nullable().optional(),
  acos: z.number().nullable().optional(),
  tacos: z.number().nullable().optional(),
  grossMargin: z.number().nullable().optional(),
  keywordRank: z.number().nullable().optional(),
  dataSource: z.string().max(80).optional(),
  lastSyncedAt: z.string().max(80).nullable().optional(),
  syncStatus: productSyncStatusSchema.optional(),
  syncError: z.string().max(1000).nullable().optional()
});

export const productMetricQuerySchema = z.object({
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw Object.assign(new Error(message), { statusCode: 400 });
  }
  return result.data;
}

export function validateQuery<T>(schema: z.ZodSchema<T>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    const message = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw Object.assign(new Error(message), { statusCode: 400 });
  }
  return result.data;
}

export function validateIdParam(id: string): number {
  const num = Number(id);
  if (!Number.isFinite(num) || num < 1) {
    throw Object.assign(new Error("Invalid id parameter"), { statusCode: 400 });
  }
  return num;
}
