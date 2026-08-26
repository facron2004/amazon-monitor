import type {
  BsrRankChange,
  BsrRankHistory,
  BsrSnapshotQuality,
  CategoryMonitor,
  CategoryMonitorInput,
  CategorySnapshotDiffResponse,
  CategorySignalLog,
  CollectJob,
  CompetitorActionInsight,
  CompetitorActivityEvent,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import { request, setOptional } from "./api-base";
import type {
  BsrHistoryQuery,
  BsrScopeQuery,
  BsrQualityQuery,
  CategoryActivityEventsQuery,
  CategoryCollectPayload,
  CategoryDetail,
  CategoryPriceHistoryQuery,
  DatePayload,
  DatedBsrScopeQuery
} from "./api-types";

function buildCategoryScopeParams(
  payload: Pick<CategoryPriceHistoryQuery, "date" | "categoryId" | "asin"> & Pick<CategoryActivityEventsQuery, "brand">,
  limit = 500
) {
  const params = new URLSearchParams();
  setOptional(params, "date", payload.date);
  setOptional(params, "categoryId", payload.categoryId);
  setOptional(params, "asin", payload.asin);
  setOptional(params, "brand", payload.brand);
  setOptional(params, "limit", limit);
  return params;
}

function buildBsrScopeParams(payload: BsrScopeQuery, limit = 500) {
  const params = new URLSearchParams();
  setOptional(params, "date", payload.date);
  setOptional(params, "sourceType", payload.sourceType);
  setOptional(params, "sourceId", payload.sourceId);
  setOptional(params, "category", payload.category);
  setOptional(params, "limit", limit);
  return params;
}

export const categoryApi = {
  categories: () => request<CategoryMonitor[]>("/categories"),
  createCategory: (payload: CategoryMonitorInput) =>
    request<CategoryMonitor>("/categories", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateCategory: (id: number, payload: Partial<CategoryMonitorInput>) =>
    request<CategoryMonitor>(`/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  categoryDetail: (id: number, date: DatePayload["date"]) => request<CategoryDetail>(`/categories/${id}/detail?date=${date}`),
  categoryDiff: (id: number, date: string, compareDate: string) => {
    const params = new URLSearchParams({ date, compareDate });
    return request<CategorySnapshotDiffResponse>(`/categories/${id}/diff?${params.toString()}`);
  },
  collectCategory: (id: number, payload: CategoryCollectPayload) =>
    request<CollectJob>(`/categories/${id}/collect`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  collectAllCategories: (payload: CategoryCollectPayload) =>
    request<CollectJob[]>("/categories/collect/run", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  categorySignals: (date: string, categoryId?: number | null) => {
    const params = new URLSearchParams();
    setOptional(params, "date", date);
    setOptional(params, "categoryId", categoryId);
    setOptional(params, "limit", 200);
    return request<CategorySignalLog[]>(`/category-signals?${params.toString()}`);
  },
  productPriceHistory: (payload: CategoryPriceHistoryQuery) =>
    request<ProductPriceHistory[]>(`/product-price-history?${buildCategoryScopeParams({ ...payload, brand: undefined }).toString()}`),
  activityEvents: (payload: CategoryActivityEventsQuery) =>
    request<CompetitorActivityEvent[]>(`/activity-events?${buildCategoryScopeParams(payload).toString()}`),
  bsrHistory: (payload: BsrHistoryQuery = {}) =>
    request<BsrRankHistory[]>(`/bsr/history?${buildBsrScopeParams(payload, payload.limit ?? 500).toString()}`),
  bsrQuality: (payload: BsrQualityQuery) => {
    const params = buildBsrScopeParams(payload, payload.limit ?? 500);
    if (payload.qualityStatus) params.set("qualityStatus", payload.qualityStatus);
    return request<BsrSnapshotQuality[]>(`/bsr/quality?${params.toString()}`);
  },
  bsrChanges: (payload: DatedBsrScopeQuery) =>
    request<BsrRankChange[]>(`/bsr/changes?${buildBsrScopeParams(payload).toString()}`),
  actionInsights: (payload: DatedBsrScopeQuery) =>
    request<CompetitorActionInsight[]>(`/action-insights?${buildBsrScopeParams(payload).toString()}`)
};
