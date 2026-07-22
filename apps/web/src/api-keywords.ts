import type { CollectJob, KeywordMonitor, KeywordMonitorInput, KeywordRankMatrixResponse } from "@amazon-monitor/shared";
import { request } from "./api-base";
import type { DatePayload, KeywordCollectPayload, KeywordDetail } from "./api-types";

export const keywordApi = {
  keywords: () => request<KeywordMonitor[]>("/keywords"),
  createKeyword: (payload: KeywordMonitorInput) =>
    request<KeywordMonitor>("/keywords", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateKeyword: (id: number, payload: Partial<KeywordMonitorInput>) =>
    request<KeywordMonitor>(`/keywords/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteKeyword: (id: number) =>
    request<void>(`/keywords/${id}`, {
      method: "DELETE"
    }),
  keywordDetail: (id: number, date: DatePayload["date"]) => request<KeywordDetail>(`/keywords/${id}/detail?date=${date}`),
  rankMatrix: (date: DatePayload["date"]) => request<KeywordRankMatrixResponse>(`/keywords/rank-matrix?date=${encodeURIComponent(date)}`),
  collect: (payload: KeywordCollectPayload) =>
    request<CollectJob | CollectJob[]>("/collect/run", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};
