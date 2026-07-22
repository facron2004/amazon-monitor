import type {
  AdDailyMetric,
  AdsMetricListFilter,
  AdsWorkflowLevel,
  AdsWorkflowResponse,
  UpsertAdDailyMetricInput
} from "@amazon-monitor/shared";
import { request } from "./api-base";

export type AdsMetricPayload = Omit<UpsertAdDailyMetricInput, "orgId">;

export interface AdsQuery {
  date?: string;
  productId?: number;
  q?: string;
  level?: AdsWorkflowLevel;
  limit?: number;
  offset?: number;
}

export const adsApi = {
  fetchSummary: (query: AdsQuery = {}) =>
    request<AdsWorkflowResponse>(`/ads/summary?${buildQuery(query).toString()}`),
  fetchMetrics: (query: Omit<AdsQuery, "level"> = {}) =>
    request<AdDailyMetric[]>(`/ads/metrics?${buildQuery(query).toString()}`),
  upsertMetric: (payload: AdsMetricPayload) =>
    request<AdDailyMetric>("/ads/metrics", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

function buildQuery(query: AdsQuery | Omit<AdsMetricListFilter, "orgId">): URLSearchParams {
  const params = new URLSearchParams();
  setOptional(params, "date", query.date);
  setOptional(params, "productId", query.productId);
  setOptional(params, "q", query.q?.trim());
  setOptional(params, "level", query.level);
  setOptional(params, "limit", query.limit);
  setOptional(params, "offset", query.offset);
  return params;
}

function setOptional(params: URLSearchParams, key: string, value: string | number | undefined | null): void {
  if (value !== undefined && value !== null && value !== "") {
    params.set(key, String(value));
  }
}
