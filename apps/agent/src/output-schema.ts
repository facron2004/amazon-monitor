import {
  TASK_PRIORITIES,
  TASK_TYPES,
  asinWatchLevels,
} from "@amazon-monitor/shared";
import { z } from "zod";

const evidenceRefSchema = z.object({
  kind: z.string().min(1),
  id: z.string().min(1),
  label: z.string().min(1),
  observedAt: z.string().nullable(),
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
      marketplace: z.string().nullable(),
      asin: z.string().nullable(),
      categoryId: z.number().int().positive().nullable(),
      categoryName: z.string().nullable(),
      from: z.string().nullable(),
      to: z.string().nullable(),
    }).strict(),
    evidenceRefs: z.array(evidenceRefSchema).min(1),
    snapshotRefs: z.array(evidenceRefSchema).min(1),
    confidence: z.number().min(0).max(1),
  }).strict()).min(1).max(5),
  freshness: freshnessSchema,
  riskNotes: z.array(z.string()),
  recommendedActions: z.array(z.discriminatedUnion("type", [
    actionSchema("recollect", z.object({
      taskType: z.enum(["keyword", "category"]),
      targetId: z.number().int().positive(),
      date: z.string(),
    }).strict()),
    actionSchema("monitor_asin", z.object({
      asin: z.string(),
      watchLevel: z.enum(asinWatchLevels),
      watchReason: z.string().nullable(),
      firstWatchDate: z.string(),
      lastEventDate: z.string().nullable(),
      note: z.string().nullable(),
    }).strict()),
    actionSchema("create_task", z.object({
      title: z.string(),
      description: z.string().nullable(),
      taskType: z.enum(TASK_TYPES),
      priority: z.enum(TASK_PRIORITIES),
      relatedAsin: z.string().nullable(),
      relatedCategoryId: z.number().int().positive().nullable(),
    }).strict()),
    actionSchema("send_feishu_report", z.object({
      scheduleId: z.number().int().positive(),
      date: z.string(),
    }).strict()),
    actionSchema("export_report", z.object({
      format: z.enum(["md", "json"]),
    }).strict()),
  ])),
}).strict();

function actionSchema<T extends string, P extends z.ZodType>(
  type: T,
  payload: P,
) {
  return z.object({
    type: z.literal(type),
    title: z.string().min(1),
    rationale: z.string().min(1),
    riskLevel: z.enum(["L1", "L2", "L3"]),
    requiresApproval: z.literal(true),
    payload,
  }).strict();
}
