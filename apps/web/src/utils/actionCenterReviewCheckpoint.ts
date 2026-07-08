import {
  insightEventStatusLabels,
  insightReviewResultLabels,
  type InsightEvent
} from "@amazon-monitor/shared";

export type ReviewCheckpointStepStatus = "success" | "process" | "wait" | "error";

export interface ReviewCheckpointStep {
  key: "signal" | "owner" | "review" | "outcome";
  title: string;
  description: string;
  status: ReviewCheckpointStepStatus;
}

export interface ReviewCheckpointSummary {
  activeIndex: number;
  tone: "success" | "warning" | "danger" | "info";
  label: string;
  steps: ReviewCheckpointStep[];
}

const closedStatuses = new Set<InsightEvent["status"]>(["FOLLOWED", "REVIEWED", "IGNORED"]);

export function buildReviewCheckpointSummary(event: InsightEvent, currentDate: string): ReviewCheckpointSummary {
  const hasOwner = (event.assignee?.trim() ?? "").length > 0;
  const isClosed = closedStatuses.has(event.status);
  const isReviewed = event.reviewResult !== null || event.status === "REVIEWED";
  const reviewStatus = getReviewStatus(event, currentDate, isClosed);
  const outcomeStatus: ReviewCheckpointStepStatus = isReviewed || isClosed ? "success" : "wait";
  const activeIndex = getActiveIndex(hasOwner, reviewStatus, outcomeStatus);

  return {
    activeIndex,
    tone: getTone(reviewStatus, outcomeStatus),
    label: getSummaryLabel(event, reviewStatus, outcomeStatus),
    steps: [
      {
        key: "signal",
        title: "Signal",
        description: event.eventDate || event.createdAt.slice(0, 10),
        status: "success"
      },
      {
        key: "owner",
        title: "Owner",
        description: hasOwner ? event.assignee?.trim() ?? "Assigned" : "Unassigned",
        status: hasOwner ? "success" : "process"
      },
      {
        key: "review",
        title: "Review",
        description: getReviewDescription(event, currentDate, isClosed),
        status: reviewStatus
      },
      {
        key: "outcome",
        title: "Outcome",
        description: event.reviewResult ? insightReviewResultLabels[event.reviewResult] : insightEventStatusLabels[event.status],
        status: outcomeStatus
      }
    ]
  };
}

function getReviewStatus(event: InsightEvent, currentDate: string, isClosed: boolean): ReviewCheckpointStepStatus {
  if (isClosed || event.reviewResult !== null) return "success";
  if (!event.reviewDueDate) return "wait";
  if (currentDate && event.reviewDueDate < currentDate) return "error";
  if (currentDate && event.reviewDueDate === currentDate) return "process";
  return "success";
}

function getReviewDescription(event: InsightEvent, currentDate: string, isClosed: boolean): string {
  if (isClosed || event.reviewResult !== null) return "Review loop closed";
  if (!event.reviewDueDate) return "No review scheduled";
  if (currentDate && event.reviewDueDate < currentDate) return `Overdue ${event.reviewDueDate.slice(5)}`;
  if (currentDate && event.reviewDueDate === currentDate) return "Due today";
  return `Review on ${event.reviewDueDate.slice(5)}`;
}

function getActiveIndex(
  hasOwner: boolean,
  reviewStatus: ReviewCheckpointStepStatus,
  outcomeStatus: ReviewCheckpointStepStatus
): number {
  if (outcomeStatus === "success") return 3;
  if (reviewStatus === "error" || reviewStatus === "process") return 2;
  if (reviewStatus === "success") return 2;
  return hasOwner ? 2 : 1;
}

function getTone(
  reviewStatus: ReviewCheckpointStepStatus,
  outcomeStatus: ReviewCheckpointStepStatus
): ReviewCheckpointSummary["tone"] {
  if (reviewStatus === "error") return "danger";
  if (reviewStatus === "process") return "warning";
  if (outcomeStatus === "success") return "success";
  return "info";
}

function getSummaryLabel(
  event: InsightEvent,
  reviewStatus: ReviewCheckpointStepStatus,
  outcomeStatus: ReviewCheckpointStepStatus
): string {
  if (outcomeStatus === "success") return "Closed loop";
  if (reviewStatus === "error") return "Review overdue";
  if (reviewStatus === "process") return "Review due today";
  if (!event.reviewDueDate) return "Needs review schedule";
  return "Review scheduled";
}
