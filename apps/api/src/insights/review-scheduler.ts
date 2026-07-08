import {
  reviewScheduleDates as sharedReviewScheduleDates,
  type ReviewScheduleDateInput
} from "@amazon-monitor/shared";

export type ReviewScheduleInput = ReviewScheduleDateInput;

export function scheduleReviewDate(input: ReviewScheduleInput): string | null {
  return reviewScheduleDates(input)[0] ?? null;
}

export function scheduleNextReviewDate(input: ReviewScheduleInput, completedDate: string): string | null {
  return reviewScheduleDates(input).find((date) => date > completedDate) ?? null;
}

export function reviewScheduleDates(input: ReviewScheduleInput): string[] {
  return sharedReviewScheduleDates(input);
}
