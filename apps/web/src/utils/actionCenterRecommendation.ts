import {
  insightEventStatusLabels,
  type InsightEvent
} from "@amazon-monitor/shared";

export type ActionRecommendationTone = "error" | "warning" | "success" | "info";
export type ReviewDueState = "overdue" | "today" | "scheduled" | "none";

export interface ActionRecommendationSummary {
  suggestedAction: string;
  statusLabel: string;
  ownerLabel: string;
  reviewDueLabel: string;
  reviewDueState: ReviewDueState;
  alertType: ActionRecommendationTone;
}

export function buildActionRecommendationSummary(
  event: InsightEvent,
  currentDate: string
): ActionRecommendationSummary {
  const reviewDueState = getReviewDueState(event.reviewDueDate, currentDate);
  return {
    suggestedAction: event.suggestedAction.trim() || "Review the evidence before taking action.",
    statusLabel: insightEventStatusLabels[event.status],
    ownerLabel: event.assignee?.trim() || "Unassigned",
    reviewDueLabel: getReviewDueLabel(event.reviewDueDate, reviewDueState),
    reviewDueState,
    alertType: getRecommendationTone(event, reviewDueState)
  };
}

function getReviewDueState(reviewDueDate: string | null, currentDate: string): ReviewDueState {
  if (!reviewDueDate || !currentDate) return "none";
  if (reviewDueDate < currentDate) return "overdue";
  if (reviewDueDate === currentDate) return "today";
  return "scheduled";
}

function getReviewDueLabel(reviewDueDate: string | null, state: ReviewDueState): string {
  if (!reviewDueDate) return "No review scheduled";
  const displayDate = reviewDueDate.slice(5) || reviewDueDate;
  if (state === "overdue") return `Overdue since ${displayDate}`;
  if (state === "today") return "Due today";
  return `Review on ${displayDate}`;
}

function getRecommendationTone(event: InsightEvent, reviewDueState: ReviewDueState): ActionRecommendationTone {
  if (reviewDueState === "overdue") return "error";
  if (reviewDueState === "today" || event.eventLevel === "P0") return "warning";
  if (event.status === "FOLLOWED" || event.status === "REVIEWED") return "success";
  return "info";
}
