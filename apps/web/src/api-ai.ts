import type {
  AiAdsAnalysisResponse,
  AiActionFeedback,
  AiActionFeedbackValue,
  AiAgentType,
  AiCompetitorAnalysisResponse,
  AiDailyBriefResponse,
  AiListingAnalysisResponse,
  AiProductResearchResponse,
  AiReportType,
  AiReportWriterResponse,
  AiRunListResponse,
  AiRunStatus,
  AiReviewVocAnalysisResponse
} from "@amazon-monitor/shared";
import { request } from "./api-base";

export interface AiRunListParams {
  agentType?: AiAgentType;
  status?: AiRunStatus;
  limit?: number;
  offset?: number;
}

function buildRunListQuery(params: AiRunListParams): string {
  const search = new URLSearchParams();
  if (params.agentType) search.set("agentType", params.agentType);
  if (params.status) search.set("status", params.status);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const aiApi = {
  listRuns: (params: AiRunListParams = {}) =>
    request<AiRunListResponse>(`/ai/runs${buildRunListQuery(params)}`),
  setActionFeedback: (runId: number, actionIndex: number, value: AiActionFeedbackValue) =>
    request<AiActionFeedback>(`/ai/runs/${runId}/actions/${actionIndex}/feedback`, {
      method: "PUT",
      body: JSON.stringify({ value })
    }),
  generateDailyBrief: (date: string) =>
    request<AiDailyBriefResponse>("/ai/daily-brief", {
      method: "POST",
      body: JSON.stringify({ date })
    }),
  analyzeListing: (productId: number, date: string) =>
    request<AiListingAnalysisResponse>("/ai/analyze-listing", {
      method: "POST",
      body: JSON.stringify({ productId, date })
    }),
  analyzeCompetitor: (eventId: string, date: string) =>
    request<AiCompetitorAnalysisResponse>("/ai/analyze-competitor", {
      method: "POST",
      body: JSON.stringify({ eventId, date })
    }),
  analyzeAds: (date: string) =>
    request<AiAdsAnalysisResponse>("/ai/analyze-ads", {
      method: "POST",
      body: JSON.stringify({ date })
    }),
  analyzeReviewVoc: (productId: number, date: string) =>
    request<AiReviewVocAnalysisResponse>("/ai/analyze-review-voc", {
      method: "POST",
      body: JSON.stringify({ productId, date })
    }),
  researchProduct: (categoryId: number, date: string) =>
    request<AiProductResearchResponse>("/ai/research-product", {
      method: "POST",
      body: JSON.stringify({ categoryId, date })
    }),
  createReport: (date: string, reportType: AiReportType) =>
    request<AiReportWriterResponse>("/ai/create-report", {
      method: "POST",
      body: JSON.stringify({ date, reportType })
    })
};
