import { z } from "zod";

export const keywordInputSchema = z.object({
  keyword: z.string().min(1).max(200),
  marketplace: z.string().min(1).max(100),
  zipCode: z.string().max(20).nullable().optional(),
  language: z.string().max(20).optional(),
  categoryTag: z.string().max(100).nullable().optional(),
  crawlPages: z.number().int().min(1).max(10).optional(),
  status: z.enum(["enabled", "disabled"]).optional()
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

export function validateIdParam(id: string): number {
  const num = Number(id);
  if (!Number.isFinite(num) || num < 1) {
    throw Object.assign(new Error("Invalid id parameter"), { statusCode: 400 });
  }
  return num;
}
