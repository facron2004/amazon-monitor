import type { Sop, Task } from "@amazon-monitor/shared";
import type { Store } from "../store.js";

const TASK_TYPE_TO_SOP_CATEGORY: Record<string, Sop["category"]> = {
  price: "price_action",
  coupon: "price_action",
  competitor: "competitor_response",
  review: "review_response",
  listing: "listing_optimization",
  inventory: "inventory_replenishment",
  supplier: "supplier_negotiation",
  ad: "ad_optimization",
  other: "general"
};

export function promoteTaskToSop(store: Store, task: Task, createdBy: number | null): Sop {
  if (task.reviewResult !== "CONFIRMED") {
    throw new Error("Task must have reviewResult=CONFIRMED to be promoted to SOP");
  }
  const category = TASK_TYPE_TO_SOP_CATEGORY[task.taskType] ?? "general";
  const bodyMd = buildSopBody(task);
  const sop = store.createSop({
    orgId: task.orgId,
    title: `SOP：${task.title}`,
    category,
    bodyMd,
    sourceTaskId: task.id,
    tags: [task.taskType, task.priority, task.relatedAsin ?? task.relatedBrand ?? ""].filter((t) => t.length > 0),
    createdBy
  });
  store.updateTask(task.id, { promotedToSopId: sop.id } as Partial<{
    title: string;
    description: string;
    priority: Task["priority"];
    status: Task["status"];
    assigneeId: number | null;
    dueDate: string | null;
    actionTaken: string | null;
    resultBeforeJson: string | null;
    resultAfterJson: string | null;
    reviewNote: string | null;
    reviewResult: Task["reviewResult"] | null;
  }>);
  return sop;
}

function buildSopBody(task: Task): string {
  const parts: string[] = [];
  parts.push(`# 概述`);
  parts.push(task.description);
  parts.push("");
  if (task.aiRecommendation) {
    parts.push(`# AI 建议`);
    parts.push(task.aiRecommendation);
    parts.push("");
  }
  if (task.actionTaken) {
    parts.push(`# 执行动作`);
    parts.push(task.actionTaken);
    parts.push("");
  }
  if (task.reviewNote) {
    parts.push(`# 复盘记录`);
    parts.push(task.reviewNote);
    parts.push("");
  }
  parts.push(`# 元信息`);
  parts.push(`- 任务 ID: ${task.id}`);
  parts.push(`- 任务类型: ${task.taskType}`);
  parts.push(`- 优先级: ${task.priority}`);
  if (task.relatedAsin) parts.push(`- 关联 ASIN: ${task.relatedAsin}`);
  if (task.relatedBrand) parts.push(`- 关联品牌: ${task.relatedBrand}`);
  if (task.relatedKeyword) parts.push(`- 关联关键词: ${task.relatedKeyword}`);
  parts.push(`- 复盘结论: ${task.reviewResult}`);
  return parts.join("\n");
}
