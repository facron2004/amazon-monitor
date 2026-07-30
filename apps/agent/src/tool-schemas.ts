import type { AgentToolName } from "@amazon-monitor/shared";
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const asin = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/);
const marketplace = z.string().trim().min(3).max(100).optional();
const range = {
  from: isoDate.optional(),
  to: isoDate.optional(),
  marketplace,
};
const categoryScope = z.object({
  categoryId: z.number().int().positive(),
  ...range,
}).strict();
const keywordScope = z.object({
  keywordId: z.number().int().positive(),
  asin: asin.optional(),
  ...range,
}).strict();
const asinScope = z.object({ asin, categoryId: z.number().int().positive().optional(), ...range }).strict();

export const agentToolInputSchemas = {
  get_category_snapshot: categoryScope,
  get_keyword_ranking: keywordScope,
  get_asin_history: asinScope,
  compare_asins: z.object({
    asins: z.array(asin).min(2).max(10),
    categoryId: z.number().int().positive().optional(),
    ...range,
  }).strict(),
  compare_brand_matrix: z.object({
    categoryId: z.number().int().positive(),
    brands: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    ...range,
  }).strict(),
  get_price_history: asinScope,
  get_promotion_timeline: asinScope,
  get_review_growth: asinScope,
  get_listing_change: asinScope,
  check_data_freshness: z.object({
    datasets: z.array(z.enum(["category", "keyword", "price", "promotion", "review", "listing"]))
      .min(1).max(6),
    categoryId: z.number().int().positive().optional(),
    keywordId: z.number().int().positive().optional(),
    asin: asin.optional(),
    marketplace,
    maxAgeHours: z.number().int().min(1).max(168).default(24),
  }).strict(),
  find_rank_anomalies: categoryScope,
  find_new_product_breakouts: categoryScope,
  find_price_low: asinScope,
  find_review_anomalies: categoryScope,
  find_brand_share_changes: categoryScope,
} satisfies Record<AgentToolName, z.ZodType>;

export function parseAgentToolInput(
  toolName: AgentToolName,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = agentToolInputSchemas[toolName].parse(input) as Record<string, unknown>;
  const from = typeof parsed.from === "string" ? Date.parse(`${parsed.from}T00:00:00Z`) : null;
  const to = typeof parsed.to === "string" ? Date.parse(`${parsed.to}T00:00:00Z`) : null;
  if (from !== null && to !== null && (to < from || to - from > 90 * 86_400_000)) {
    throw new Error("Agent tool date range must be ordered and no longer than 90 days");
  }
  return parsed;
}
