import type { InsightEvent } from "./insight-events.js";
import type { AdsWorkflowSummary } from "./types-ads.js";
import type { ProductListingHealthItem } from "./types-listing-health.js";
import type { ReviewVocSummary } from "./types-review-voc.js";

export const aiAgentTypes = [
  "daily_operator",
  "competitor_analyst",
  "listing_optimizer",
  "ads_analyst",
  "review_voc",
  "report_writer"
] as const;

export type AiAgentType = (typeof aiAgentTypes)[number];

export const aiRunStatuses = ["success", "failed"] as const;
export type AiRunStatus = (typeof aiRunStatuses)[number];

export const aiActionPriorities = ["P0", "P1", "P2"] as const;
export type AiActionPriority = (typeof aiActionPriorities)[number];

export interface AiRecommendedAction {
  action: string;
  priority: AiActionPriority;
  reason: string;
  risk: string;
  needs_human_approval: true;
}

export interface AiAgentOutput {
  summary: string;
  evidence: string[];
  impact: string;
  recommended_actions: AiRecommendedAction[];
  confidence: number;
}

export interface AiRun {
  id: number;
  agentType: AiAgentType;
  inputContextJson: string;
  outputJson: string | null;
  output: AiAgentOutput | null;
  model: string;
  status: AiRunStatus;
  tokenUsage: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface CreateAiRunInput {
  agentType: AiAgentType;
  inputContextJson: string;
  output: AiAgentOutput | null;
  model: string;
  status: AiRunStatus;
  tokenUsage?: number | null;
  errorMessage?: string | null;
}

export interface AiRunListFilter {
  agentType?: AiAgentType;
  status?: AiRunStatus;
  limit?: number;
  offset?: number;
}

export interface AiDailyBriefResponse {
  date: string;
  output: AiAgentOutput;
  run: AiRun;
  topEvents: InsightEvent[];
}

export interface AiListingAnalysisResponse {
  date: string;
  productId: number;
  output: AiAgentOutput;
  run: AiRun;
  listingHealth: ProductListingHealthItem;
}

export interface AiAdsAnalysisResponse {
  date: string;
  output: AiAgentOutput;
  run: AiRun;
  summary: AdsWorkflowSummary;
}

export interface AiReviewVocAnalysisResponse {
  date: string;
  productId: number;
  output: AiAgentOutput;
  run: AiRun;
  summary: ReviewVocSummary;
}
