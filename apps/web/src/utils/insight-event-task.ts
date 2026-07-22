import type { InsightEventType, TaskType } from "@amazon-monitor/shared";

export function inferInsightTaskType(eventType: InsightEventType): TaskType {
  if (eventType.includes("PRICE")) return "price";
  if (eventType.includes("COUPON") || eventType.includes("DEAL")) return "coupon";
  if (eventType.includes("REVIEW") || eventType.includes("LOW_REVIEW")) return "review";
  if (eventType.includes("LISTING")) return "listing";
  if (
    eventType.includes("BREAKOUT")
    || eventType.includes("NEW_PRODUCT")
    || eventType.includes("RANK")
    || eventType.includes("BSR")
    || eventType.includes("BRAND")
    || eventType.includes("CORE")
    || eventType.includes("TOP")
  ) return "competitor";
  return "other";
}
