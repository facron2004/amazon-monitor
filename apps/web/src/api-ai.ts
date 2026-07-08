import type {
  AiAdsAnalysisResponse,
  AiDailyBriefResponse,
  AiListingAnalysisResponse,
  AiReviewVocAnalysisResponse
} from "@amazon-monitor/shared";
import { request } from "./api-base";

export const aiApi = {
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
  analyzeAds: (date: string) =>
    request<AiAdsAnalysisResponse>("/ai/analyze-ads", {
      method: "POST",
      body: JSON.stringify({ date })
    }),
  analyzeReviewVoc: (productId: number, date: string) =>
    request<AiReviewVocAnalysisResponse>("/ai/analyze-review-voc", {
      method: "POST",
      body: JSON.stringify({ productId, date })
    })
};
