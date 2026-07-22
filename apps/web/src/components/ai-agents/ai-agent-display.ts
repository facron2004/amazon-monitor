import type { AiActionPriority, AiAgentType, AiRun, AiRunStatus } from "@amazon-monitor/shared";

export const agentLabels: Record<AiAgentType, string> = {
  daily_operator: "Daily Operator",
  competitor_analyst: "Competitor Analyst",
  listing_optimizer: "Listing Optimizer",
  ads_analyst: "Ads Analyst",
  product_research: "Product Research",
  review_voc: "Review VOC",
  report_writer: "Report Writer"
};

export const statusTypes: Record<AiRunStatus, "success" | "danger"> = {
  success: "success",
  failed: "danger"
};

export const priorityTypes: Record<AiActionPriority, "danger" | "warning" | "info"> = {
  P0: "danger",
  P1: "warning",
  P2: "info"
};

export function formatAgentRunTime(value: string): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function runTitle(run: AiRun): string {
  return run.output?.summary ?? run.errorMessage ?? run.model;
}
