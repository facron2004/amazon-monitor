import type { AttributionTag, InsightEventType, InsightScoreLevel } from "./insight-events.js";

export const defaultReviewScheduleOffsets = [3, 7, 14] as const;

export interface ReviewScheduleRuleInput {
  eventType: InsightEventType;
  scoreLevel: InsightScoreLevel;
  attributionTags: AttributionTag[];
}

export interface ReviewScheduleDateInput extends ReviewScheduleRuleInput {
  eventDate: string;
}

export function reviewScheduleOffsetsForEvent(input: ReviewScheduleRuleInput): number[] {
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

  return [...offsets].sort((left, right) => left - right);
}

export function reviewScheduleOffsetsOrDefault(input: ReviewScheduleRuleInput): number[] {
  const offsets = reviewScheduleOffsetsForEvent(input);
  return offsets.length > 0 ? offsets : [...defaultReviewScheduleOffsets];
}

export function reviewScheduleDates(input: ReviewScheduleDateInput): string[] {
  return reviewScheduleOffsetsForEvent(input).map((offset) => isoDateOffset(input.eventDate, offset));
}

export function isoDateOffset(date: string, offsetDays: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + offsetDays);
  return parsed.toISOString().slice(0, 10);
}

function addOffsets(target: Set<number>, ...offsets: number[]): void {
  for (const offset of offsets) {
    target.add(offset);
  }
}
