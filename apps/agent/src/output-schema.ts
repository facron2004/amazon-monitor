import { z } from "zod";

const evidenceRefSchema = z.object({
  kind: z.string().min(1),
  id: z.string().min(1),
  label: z.string().min(1),
  observedAt: z.string().nullable().optional(),
}).strict();

const freshnessSchema = z.object({
  status: z.enum(["fresh", "stale", "missing", "failed"]),
  checkedAt: z.string().min(1),
  maxAgeHours: z.number().positive(),
  oldestEvidenceAt: z.string().nullable(),
  staleSources: z.array(z.string()),
  dataGaps: z.array(z.string()),
  warnings: z.array(z.string()),
}).strict();

export const agentRunOutputSchema = z.object({
  summary: z.string().min(1),
  conclusions: z.array(z.object({
    text: z.string().min(1),
    scope: z.object({
      marketplace: z.string().optional(),
      asin: z.string().optional(),
      categoryId: z.number().int().positive().optional(),
      categoryName: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).strict(),
    evidenceRefs: z.array(evidenceRefSchema).min(1),
    snapshotRefs: z.array(evidenceRefSchema).min(1),
    confidence: z.number().min(0).max(1),
  }).strict()).min(1).max(5),
  freshness: freshnessSchema,
  riskNotes: z.array(z.string()),
  recommendedActions: z.array(z.object({
    type: z.enum([
      "recollect",
      "monitor_asin",
      "create_task",
      "send_feishu_report",
      "export_report",
    ]),
    title: z.string().min(1),
    rationale: z.string().min(1),
    riskLevel: z.enum(["L1", "L2", "L3"]),
    requiresApproval: z.literal(true),
    payload: z.record(z.string(), z.unknown()),
  }).strict()),
}).strict();
