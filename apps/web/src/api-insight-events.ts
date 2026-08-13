import type {
  AsinWatchLevel,
  AsinWatchState,
  ActionEvidenceMovementFilter,
  ActionScoreDriverFilter,
  ActionStageFilter,
  AttributionTag,
  BrandPlaybookProfile,
  BsrRankHistory,
  BsrSourceType,
  InsightEvent,
  InsightEventLevel,
  InsightEventNote,
  InsightEventStatus,
  InsightEventSortKey,
  InsightEventType,
  InsightEventTrendPoint,
  InsightReviewResult,
  ProductPriceHistory,
  ReviewCadenceBucketKey,
  StrategyTag,
  TopInsightFilterOptions,
  TopInsightFilters
} from "@amazon-monitor/shared";
import { request, withSignal } from "./api-base";
import { fetchAllInsightEventPages } from "./api-insight-event-pagination";

export interface InsightEventQuery {
  date?: string;
  reviewedOnDate?: boolean;
  status?: InsightEventStatus | "";
  level?: InsightEventLevel | "";
  eventType?: InsightEventType | "";
  reviewResult?: InsightReviewResult | "";
  categoryId?: number | null;
  brand?: string;
  asin?: string;
  assignee?: string;
  attributionTag?: AttributionTag | "";
  evidenceMovement?: ActionEvidenceMovementFilter | "";
  reviewCadence?: ReviewCadenceBucketKey | "";
  actionStage?: ActionStageFilter | "";
  scoreDriver?: ActionScoreDriverFilter | "";
  strategyTag?: StrategyTag | "";
  sortBy?: InsightEventSortKey;
  unassignedOnly?: boolean;
  coreOnly?: boolean;
  newBreakoutOnly?: boolean;
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
  date?: string;
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

export interface BsrRankHistoryQuery {
  date?: string;
  sourceType?: BsrSourceType;
  sourceId?: number | null;
  category?: string;
  asin?: string | null;
  limit?: number;
  offset?: number;
}

export interface InsightEventTrendQuery extends Omit<InsightEventQuery, "date" | "limit" | "offset"> {
  date?: string;
  endDate?: string;
  days?: number;
}

export interface AsinWatchStatePayload {
  watchLevel: AsinWatchLevel;
  watchReason?: string | null;
  note?: string | null;
  firstWatchDate?: string;
  lastEventDate?: string | null;
}

function fetchInsightEventsPage(params: InsightEventQuery, options: { signal?: AbortSignal } = {}) {
  return request<InsightEvent[]>(
    `/insight-events?${buildInsightEventQuery(params).toString()}`,
    withSignal(options.signal)
  );
}

function fetchReviewDueEventsPage(
  date: string,
  params: Omit<InsightEventQuery, "date">,
  options: { signal?: AbortSignal } = {}
) {
  return request<InsightEvent[]>(
    `/insight-events/review-due?${buildInsightEventQuery({ ...params, date }).toString()}`,
    withSignal(options.signal)
  );
}

export const insightEventApi = {
  fetchInsightEvents: fetchInsightEventsPage,
  fetchAllInsightEvents: (params: InsightEventQuery = {}, options: { signal?: AbortSignal } = {}) =>
    fetchAllInsightEventPages((page) => fetchInsightEventsPage(page, options), params),
  fetchInsightEvent: (id: string, options: { signal?: AbortSignal } = {}) =>
    request<InsightEvent>(`/insight-events/${encodeURIComponent(id)}`, withSignal(options.signal)),
  fetchInsightEventNotes: (id: string, options: { signal?: AbortSignal } = {}) =>
    request<InsightEventNote[]>(`/insight-events/${encodeURIComponent(id)}/notes`, withSignal(options.signal)),
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
  fetchReviewDueEvents: fetchReviewDueEventsPage,
  fetchAllReviewDueEvents: (
    date: string,
    params: Omit<InsightEventQuery, "date"> = {},
    options: { signal?: AbortSignal } = {}
  ) => fetchAllInsightEventPages((page) => fetchReviewDueEventsPage(date, page, options), params),
  fetchInsightEventTrend: (params: InsightEventTrendQuery, options: { signal?: AbortSignal } = {}) =>
    request<InsightEventTrendPoint[]>(`/insight-events/trend?${buildInsightEventTrendQuery(params).toString()}`, withSignal(options.signal)),
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
  fetchTopInsights: (
    date: string,
    filters: TopInsightFilters = {},
    limit = 5,
    options: { signal?: AbortSignal } = {}
  ) =>
    request<InsightEvent[]>(
      `/insight-events/top-summary?${buildTopInsightQuery(date, filters, limit).toString()}`,
      withSignal(options.signal)
    ),
  fetchTopInsightFilterOptions: (date: string, options: { signal?: AbortSignal } = {}) =>
    request<TopInsightFilterOptions>(
      `/insight-events/top-summary/filter-options?date=${encodeURIComponent(date)}`,
      withSignal(options.signal)
    ),
  fetchBrandPlaybook: (params: BrandPlaybookQuery, options: { signal?: AbortSignal } = {}) =>
    request<BrandPlaybookProfile>(`/brand-playbooks?${buildBrandPlaybookQuery(params).toString()}`, withSignal(options.signal)),
  fetchProductPriceHistory: (params: ProductPriceHistoryQuery, options: { signal?: AbortSignal } = {}) =>
    request<ProductPriceHistory[]>(`/product-price-history?${buildProductPriceHistoryQuery(params).toString()}`, withSignal(options.signal)),
  fetchBsrRankHistory: (params: BsrRankHistoryQuery, options: { signal?: AbortSignal } = {}) =>
    request<BsrRankHistory[]>(`/bsr/history?${buildBsrRankHistoryQuery(params).toString()}`, withSignal(options.signal)),
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

function buildBsrRankHistoryQuery(params: BsrRankHistoryQuery): URLSearchParams {
  const query = new URLSearchParams();
  setOptional(query, "date", params.date);
  setOptional(query, "sourceType", params.sourceType);
  setOptional(query, "sourceId", params.sourceId);
  setOptional(query, "category", params.category?.trim());
  setOptional(query, "asin", params.asin?.trim());
  setOptional(query, "limit", params.limit);
  setOptional(query, "offset", params.offset);
  return query;
}

function buildInsightEventQuery(params: InsightEventQuery): URLSearchParams {
  const query = new URLSearchParams();
  setOptional(query, "date", params.date);
  setOptional(query, "reviewedOnDate", params.reviewedOnDate ? "true" : undefined);
  setOptional(query, "status", params.status);
  setOptional(query, "level", params.level);
  setOptional(query, "eventType", params.eventType);
  setOptional(query, "reviewResult", params.reviewResult);
  setOptional(query, "categoryId", params.categoryId);
  setOptional(query, "brand", params.brand?.trim());
  setOptional(query, "asin", params.asin?.trim());
  setOptional(query, "assignee", params.assignee?.trim());
  setOptional(query, "attributionTag", params.attributionTag);
  setOptional(query, "evidenceMovement", params.evidenceMovement);
  setOptional(query, "reviewCadence", params.reviewCadence);
  setOptional(query, "actionStage", params.actionStage);
  setOptional(query, "scoreDriver", params.scoreDriver);
  setOptional(query, "strategyTag", params.strategyTag);
  setOptional(query, "sortBy", params.sortBy);
  setOptional(query, "unassignedOnly", params.unassignedOnly ? "true" : undefined);
  setOptional(query, "coreOnly", params.coreOnly ? "true" : undefined);
  setOptional(query, "newBreakoutOnly", params.newBreakoutOnly ? "true" : undefined);
  setOptional(query, "limit", params.limit);
  setOptional(query, "offset", params.offset);
  return query;
}

function buildTopInsightQuery(date: string, filters: TopInsightFilters, limit: number): URLSearchParams {
  const query = new URLSearchParams();
  setOptional(query, "date", date);
  setOptional(query, "limit", limit);
  setOptional(query, "marketplace", filters.marketplace?.trim());
  setOptional(query, "categoryName", filters.categoryName?.trim());
  setOptional(query, "brand", filters.brand?.trim());
  setOptional(query, "assignee", filters.assignee?.trim());
  return query;
}

function buildInsightEventTrendQuery(params: InsightEventTrendQuery): URLSearchParams {
  const query = new URLSearchParams();
  setOptional(query, "date", params.date);
  setOptional(query, "endDate", params.endDate);
  setOptional(query, "days", params.days);
  setOptional(query, "reviewedOnDate", params.reviewedOnDate ? "true" : undefined);
  setOptional(query, "status", params.status);
  setOptional(query, "level", params.level);
  setOptional(query, "eventType", params.eventType);
  setOptional(query, "reviewResult", params.reviewResult);
  setOptional(query, "categoryId", params.categoryId);
  setOptional(query, "brand", params.brand?.trim());
  setOptional(query, "asin", params.asin?.trim());
  setOptional(query, "assignee", params.assignee?.trim());
  setOptional(query, "attributionTag", params.attributionTag);
  setOptional(query, "evidenceMovement", params.evidenceMovement);
  setOptional(query, "reviewCadence", params.reviewCadence);
  setOptional(query, "actionStage", params.actionStage);
  setOptional(query, "scoreDriver", params.scoreDriver);
  setOptional(query, "strategyTag", params.strategyTag);
  setOptional(query, "sortBy", params.sortBy);
  setOptional(query, "unassignedOnly", params.unassignedOnly ? "true" : undefined);
  setOptional(query, "coreOnly", params.coreOnly ? "true" : undefined);
  setOptional(query, "newBreakoutOnly", params.newBreakoutOnly ? "true" : undefined);
  return query;
}

function setOptional(query: URLSearchParams, key: string, value: string | number | null | undefined): void {
  if (value !== undefined && value !== null && value !== "") {
    query.set(key, String(value));
  }
}
