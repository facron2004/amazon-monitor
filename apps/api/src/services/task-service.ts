import type { InsightEvent, Task, TaskStatus, TaskType } from "@amazon-monitor/shared";
import type { Store } from "../store.js";

const EVENT_TYPE_TO_TASK_TYPE: Record<string, TaskType> = {
  PRICE_DROP: "price",
  PRICE_NEW_LOW: "price",
  COUPON_ADDED: "coupon",
  COUPON_REMOVED: "coupon",
  DEAL_ADDED: "coupon",
  DEAL_REMOVED: "coupon",
  REVIEW_SPIKE: "review",
  RATING_DROP: "review",
  LISTING_CHANGED: "listing",
  LOW_REVIEW_HIGH_RANK: "review",
  NEW_TOP20_ENTRY: "competitor",
  NEW_TOP50_ENTRY: "competitor",
  NEW_TOP100_ENTRY: "competitor",
  RANK_SURGE: "competitor",
  RANK_DROP: "competitor",
  DROPPED_FROM_TOP100: "competitor",
  NEW_PRODUCT_BREAKOUT: "competitor",
  BRAND_MATRIX_SURGE: "competitor",
  BRAND_MATRIX_DROP: "competitor",
  CORE_COMPETITOR_RISK: "competitor",
  INVENTORY_STOCKOUT_RISK: "inventory",
  ADS_ACOS_SPIKE: "ad",
  REVIEW_NEGATIVE_CLUSTER: "review",
  LISTING_HEALTH_LOW: "listing",
  KEYWORD_PAGE_DROP: "keyword",
  OWNED_RATING_DROP: "review"
};

const EVENT_LEVEL_TO_PRIORITY: Record<string, "P0" | "P1" | "P2" | "P3"> = {
  P0: "P0",
  P1: "P1",
  P2: "P2",
  P3: "P3"
};

export interface CreateTaskFromEventInput {
  orgId: number;
  createdBy?: number | null;
  assigneeId?: number | null;
  dueDate?: string | null;
}

export function inferTaskTypeFromEventType(eventType: string): TaskType {
  return EVENT_TYPE_TO_TASK_TYPE[eventType] ?? "other";
}

export function priorityFromEventLevel(level: string): "P0" | "P1" | "P2" | "P3" {
  return EVENT_LEVEL_TO_PRIORITY[level] ?? "P1";
}

export function createTaskFromEvent(
  store: Store,
  event: InsightEvent,
  input: CreateTaskFromEventInput
): Task {
  const taskType = inferTaskTypeFromEventType(event.eventType);
  const priority = priorityFromEventLevel(event.eventLevel);
  const task = store.createTask({
    orgId: input.orgId,
    sourceType: "insight_event",
    sourceId: event.id,
    title: event.eventTitle,
    description: event.eventSummary,
    taskType,
    priority,
    assigneeId: input.assigneeId ?? null,
    dueDate: input.dueDate ?? null,
    relatedAsin: event.asin ?? null,
    relatedKeyword: null,
    relatedBrand: event.brand ?? null,
    relatedCategoryId: event.categoryId ?? null,
    aiRecommendation: event.suggestedAction ?? null,
    createdBy: input.createdBy ?? null
  });
  store.linkEventToTask(event.id, task.id);
  store.updateInsightEventStatus(event.id, "CONVERTED_TO_TASK", undefined, event.orgId);
  return task;
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  const allowed: Record<TaskStatus, TaskStatus[]> = {
    pending: ["in_progress", "cancelled"],
    in_progress: ["awaiting_review", "pending", "cancelled"],
    awaiting_review: ["done", "in_progress", "cancelled"],
    done: ["reviewed", "in_progress"],
    reviewed: ["in_progress"],
    cancelled: []
  };
  return allowed[from].includes(to);
}
