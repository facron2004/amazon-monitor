import { z } from "zod";
import { assertAmazonUrl } from "@amazon-monitor/shared";

export const keywordInputSchema = z.object({
  keyword: z.string().min(1).max(200),
  marketplace: z.string().min(1).max(100),
  zipCode: z.string().max(20).nullable().optional(),
  language: z.string().max(20).optional(),
  categoryTag: z.string().max(100).nullable().optional(),
  crawlPages: z.number().int().min(1).max(10).optional(),
  status: z.enum(["enabled", "disabled"]).optional()
});

export const keywordPatchSchema = z.object({
  keyword: z.string().min(1).max(200).optional(),
  marketplace: z.string().min(1).max(100).optional(),
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
  marketplace: z.string().min(1).max(100),
  categoryUrl: amazonUrlSchema,
  categoryPath: z.string().max(500).nullable().optional(),
  crawlTopN: z.number().int().min(1).max(1000).optional(),
  status: statusEnumSchema.optional()
});

export const categoryPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  marketplace: z.string().min(1).max(100).optional(),
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
