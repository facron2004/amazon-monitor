import type { AttributionTag, InsightEventType, InsightScoreLevel } from "@amazon-monitor/shared";
import { isoDateOffset } from "../store/date-utils.js";

export interface ReviewScheduleInput {
  eventDate: string;
  eventType: InsightEventType;
  scoreLevel: InsightScoreLevel;
  attributionTags: AttributionTag[];
}

export function scheduleReviewDate(input: ReviewScheduleInput): string | null {
  return reviewScheduleDates(input)[0] ?? null;
}

export function scheduleNextReviewDate(input: ReviewScheduleInput, completedDate: string): string | null {
  return reviewScheduleDates(input).find((date) => date > completedDate) ?? null;
}

export function reviewScheduleDates(input: ReviewScheduleInput): string[] {
  const offsets = new Set<number>();

  if (input.eventType === "NEW_PRODUCT_BREAKOUT") {
    addOffsets(offsets, 3, 7, 14);
  }
  if (input.eventType === "BRAND_MATRIX_SURGE" || input.eventType === "BRAND_MATRIX_DROP") {
    offsets.add(7);
  }
  if (input.eventType === "COUPON_REMOVED" || input.eventType === "DEAL_REMOVED" || input.attributionTags.includes("PROMO_END_DROP")) {
    offsets.add(1);
  }
  if (input.attributionTags.includes("COUPON_DRIVEN") || input.attributionTags.includes("DEAL_DRIVEN") || input.attributionTags.includes("PRICE_DRIVEN")) {
    offsets.add(3);
  }
  if (input.scoreLevel === "S") {
    addOffsets(offsets, 3, 7);
  } else if (input.scoreLevel === "A") {
    offsets.add(3);
  }

  return [...offsets]
    .sort((left, right) => left - right)
    .map((offset) => isoDateOffset(input.eventDate, offset));
}

function addOffsets(target: Set<number>, ...offsets: number[]): void {
  for (const offset of offsets) {
    target.add(offset);
  }
}