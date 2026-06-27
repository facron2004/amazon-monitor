import type {
  AsinWatchLevel,
  AsinWatchState,
  BrandPlaybookProfile,
  InsightEvent,
  InsightEventLevel,
  InsightEventStatus,
  InsightEventType,
  InsightReviewResult,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import { request, withSignal, type RequestOptions } from "./api-base";

export interface InsightEventQuery {
  date?: string;
  status?: InsightEventStatus | "";
  level?: InsightEventLevel | "";
  eventType?: InsightEventType | "";
  categoryId?: number | null;
  brand?: string;
  asin?: string;
  limit?: number;
  offset?: number;
}

export interface InsightEventStatusPayload {
  status: InsightEventStatus;
  reviewDueDate?: string | null;
}

export interface InsightEventAssigneePayload {
  assignee: string | null;
}

export interface WatchInsightEventPayload {
  watchLevel?: AsinWatchLevel;
  watchReason?: string | null;
  note?: string | null;
}

export interface ReviewInsightEventPayload {
  result: InsightReviewResult;
  note?: string | null;
}

export interface WatchInsightEventResponse {
  event: InsightEvent | null;
  watchState: AsinWatchState;
}

export interface BrandPlaybookQuery {
  categoryId: number;
  brand: string;
  date: string;
  windowDays?: number;
}

export interface ProductPriceHistoryQuery {
  date?: string;
  categoryId?: number | null;
  asin?: string | null;
  marketplace?: string;
  limit?: number;
  offset?: number;
}

export interface AsinWatchStatePayload {
  watchLevel: AsinWatchLevel;
  watchReason?: string | null;
  note?: string | null;
  firstWatchDate?: string;
  lastEventDate?: string | null;
}

export const insightEventApi = {
  fetchInsightEvents: (params: InsightEventQuery = {}, options: { signal?: AbortSignal } = {}) =>
    request<InsightEvent[]>(`/insight-events?${buildInsightEventQuery(params).toString()}`, withSignal(options.signal)),
  fetchInsightEvent: (id: string, options: { signal?: AbortSignal } = {}) =>
    request<InsightEvent>(`/insight-events/${encodeURIComponent(id)}`, withSignal(options.signal)),
  updateInsightEventStatus: (id: string, payload: InsightEventStatusPayload) =>
    request<InsightEvent>(`/insight-events/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  updateInsightEventNote: (id: string, note: string) =>
    request<InsightEvent>(`/insight-events/${encodeURIComponent(id)}/note`, {
      method: "PATCH",
      body: JSON.stringify({ note })
    }),
  updateInsightEventAssignee: (id: string, payload: InsightEventAssigneePayload) =>
    request<InsightEvent>(`/insight-events/${encodeURIComponent(id)}/assignee`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  watchInsightEvent: (id: string, payload: WatchInsightEventPayload = {}) =>
    request<WatchInsightEventResponse>(`/insight-events/${encodeURIComponent(id)}/watch`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  reviewInsightEvent: (id: string, payload: ReviewInsightEventPayload) =>
    request<InsightEvent>(`/insight-events/${encodeURIComponent(id)}/review`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  fetchReviewDueEvents: (date: string, options: { signal?: AbortSignal } = {}) =>
    request<InsightEvent[]>(`/insight-events/review-due?date=${encodeURIComponent(date)}`, withSignal(options.signal)),
  evaluateReviewDueEvents: (date: string) =>
    request<InsightEvent[]>(`/insight-events/review-due/evaluate?date=${encodeURIComponent(date)}`, {
      method: "POST",
      body: JSON.stringify({ date })
    }),
  generateInsightEvents: (date: string, categoryId?: number | null) =>
    request<InsightEvent[]>(`/insight-events/generate?${buildInsightEventQuery({ date, categoryId }).toString()}`, {
      method: "POST",
      body: JSON.stringify({ date, categoryId })
    }),
  fetchTopInsights: (date: string, limit = 5, options: { signal?: AbortSignal } = {}) =>
    request<InsightEvent[]>(
      `/insight-events/top-summary?date=${encodeURIComponent(date)}&limit=${limit}`,
      withSignal(options.signal)
    ),
  fetchBrandPlaybook: (params: BrandPlaybookQuery, options: { signal?: AbortSignal } = {}) =>
    request<BrandPlaybookProfile>(`/brand-playbooks?${buildBrandPlaybookQuery(params).toString()}`, withSignal(options.signal)),
  fetchProductPriceHistory: (params: ProductPriceHistoryQuery, options: { signal?: AbortSignal } = {}) =>
    request<ProductPriceHistory[]>(`/product-price-history?${buildProductPriceHistoryQuery(params).toString()}`, withSignal(options.signal)),
  fetchAsinWatchStates: (options: { signal?: AbortSignal } = {}) =>
    request<AsinWatchState[]>("/asin-watch-states", withSignal(options.signal)),
  updateAsinWatchState: (asin: string, payload: AsinWatchStatePayload) =>
    request<AsinWatchState>(`/asin-watch-states/${encodeURIComponent(asin)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    })
};

function buildBrandPlaybookQuery(params: BrandPlaybookQuery): URLSearchParams {
  const query = new URLSearchParams();
  setOptional(query, "categoryId", params.categoryId);
  setOptional(query, "brand", params.brand.trim());
  setOptional(query, "date", params.date);
  setOptional(query, "windowDays", params.windowDays);
  return query;
}

function buildProductPriceHistoryQuery(params: ProductPriceHistoryQuery): URLSearchParams {
  const query = new URLSearchParams();
  setOptional(query, "date", params.date);
  setOptional(query, "categoryId", params.categoryId);
  setOptional(query, "asin", params.asin?.trim());
  setOptional(query, "marketplace", params.marketplace?.trim());
  setOptional(query, "limit", params.limit);
  setOptional(query, "offset", params.offset);
  return query;
}

function buildInsightEventQuery(params: InsightEventQuery): URLSearchParams {
  const query = new URLSearchParams();
  setOptional(query, "date", params.date);
  setOptional(query, "status", params.status);
  setOptional(query, "level", params.level);
  setOptional(query, "eventType", params.eventType);
  setOptional(query, "categoryId", params.categoryId);
  setOptional(query, "brand", params.brand?.trim());
  setOptional(query, "asin", params.asin?.trim());
  setOptional(query, "limit", params.limit);
  setOptional(query, "offset", params.offset);
  return query;
}

function setOptional(query: URLSearchParams, key: string, value: string | number | null | undefined): void {
  if (value !== undefined && value !== null && value !== "") {
    query.set(key, String(value));
  }
}

// Suppress unused-import warning for the explicit RequestOptions type
// (callers only pass { signal } via withSignal). Keep the import in case we
// later want to expose the full options shape (timeoutMs, headers, ...).
type _InsightEventRequestOptions = RequestOptions;
