import {
  defaultReviewScheduleOffsets,
  isoDateOffset,
  reviewScheduleOffsetsOrDefault,
  type AttributionTag,
  type InsightEventType,
  type InsightScoreLevel
} from "@amazon-monitor/shared";

export type ReviewPresetKey = "oneDay" | "threeDay" | "sevenDay" | "fourteenDay";

export interface ReviewPresetOption {
  key: ReviewPresetKey;
  label: string;
  date: string;
}

export interface ReviewPresetEvent {
  eventType: InsightEventType;
  scoreLevel: InsightScoreLevel;
  attributionTags: AttributionTag[];
}

const reviewPresetDays: Array<{ key: ReviewPresetKey; label: string; days: number }> = [
  { key: "oneDay", label: "1-day review", days: 1 },
  { key: "threeDay", label: "3-day review", days: 3 },
  { key: "sevenDay", label: "7-day review", days: 7 },
  { key: "fourteenDay", label: "14-day review", days: 14 }
];
export function buildReviewPresetOptions(baseDate: string, event?: ReviewPresetEvent): ReviewPresetOption[] {
  if (!isIsoDate(baseDate)) return [];

  const offsets = event ? reviewPresetOffsetsForEvent(event) : [...defaultReviewScheduleOffsets];
  return reviewPresetDays.filter((preset) => offsets.includes(preset.days)).map((preset) => ({
    key: preset.key,
    label: preset.label,
    date: isoDateOffset(baseDate, preset.days)
  }));
}

export function reviewPresetOffsetsForEvent(event: ReviewPresetEvent): number[] {
  return reviewScheduleOffsetsOrDefault(event);
}

function isIsoDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}
