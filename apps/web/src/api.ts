import type {
  AlertLog,
  BsrRankChange,
  BsrRankHistory,
  BsrSnapshotQuality,
  BsrSourceType,
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  CategoryMonitor,
  CategoryMonitorInput,
  CategorySignalLog,
  CollectTaskLog,
  CompetitorActionInsight,
  CompetitorActivityEvent,
  CompetitorFolder,
  CompetitorPoolItem,
  DailyChange,
  DashboardSummary,
  KeywordMonitor,
  NotificationSchedule,
  NotificationScheduleInput,
  NotificationSendLog,
  ProductActivityCalendar,
  ProductLink,
  ProductPriceHistory,
  SerpSnapshot
} from "@amazon-monitor/shared";

const baseUrl = import.meta.env.VITE_API_BASE ?? "/api";

export interface KeywordDetail {
  keyword: KeywordMonitor | null;
  snapshots: SerpSnapshot[];
  changes: DailyChange[];
  alerts: AlertLog[];
}

export interface DailyReportResponse {
  date: string;
  keyword: string | null;
  markdown: string;
}

export interface CategoryDetail {
  category: CategoryMonitor | null;
  snapshots: BestsellerRankSnapshot[];
  brandMatrix: BrandMatrixSnapshot[];
  signals: CategorySignalLog[];
  report: string;
}

export interface CategoryReportResponse {
  date: string;
  categoryId: number | null;
  markdown: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message ?? response.statusText);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  summary: (date: string) => request<DashboardSummary>(`/dashboard/summary?date=${date}`),
  keywords: () => request<KeywordMonitor[]>("/keywords"),
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
  categoryDetail: (id: number, date: string) => request<CategoryDetail>(`/categories/${id}/detail?date=${date}`),
  collectCategory: (id: number, payload: { date: string }) =>
    request<CollectTaskLog>(`/categories/${id}/collect`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  collectAllCategories: (payload: { date: string }) =>
    request<CollectTaskLog[]>("/categories/collect/run", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  categorySignals: (date: string, categoryId?: number | null) =>
    request<CategorySignalLog[]>(`/category-signals?date=${date}${categoryId ? `&categoryId=${categoryId}` : ""}&limit=200`),
  productPriceHistory: (payload: { date: string; categoryId?: number | null; asin?: string | null }) =>
    request<ProductPriceHistory[]>(
      `/product-price-history?date=${payload.date}${payload.categoryId ? `&categoryId=${payload.categoryId}` : ""}${payload.asin ? `&asin=${payload.asin}` : ""}&limit=500`
    ),
  activityEvents: (payload: { date: string; categoryId?: number | null; asin?: string | null; brand?: string | null }) =>
    request<CompetitorActivityEvent[]>(
      `/activity-events?date=${payload.date}${payload.categoryId ? `&categoryId=${payload.categoryId}` : ""}${payload.asin ? `&asin=${payload.asin}` : ""}${payload.brand ? `&brand=${encodeURIComponent(payload.brand)}` : ""}&limit=500`
    ),
  bsrHistory: (payload: { date?: string; sourceType?: BsrSourceType; sourceId?: number | null; category?: string | null; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (payload.date) params.set("date", payload.date);
    if (payload.sourceType) params.set("sourceType", payload.sourceType);
    if (payload.sourceId) params.set("sourceId", String(payload.sourceId));
    if (payload.category) params.set("category", payload.category);
    params.set("limit", String(payload.limit ?? 500));
    return request<BsrRankHistory[]>(`/bsr/history?${params.toString()}`);
  },
  bsrQuality: (payload: { date: string; sourceType?: BsrSourceType; sourceId?: number | null; category?: string | null }) =>
    request<BsrSnapshotQuality[]>(
      `/bsr/quality?date=${payload.date}${payload.sourceType ? `&sourceType=${payload.sourceType}` : ""}${payload.sourceId ? `&sourceId=${payload.sourceId}` : ""}${payload.category ? `&category=${encodeURIComponent(payload.category)}` : ""}&limit=500`
    ),
  bsrChanges: (payload: { date: string; sourceType?: BsrSourceType; sourceId?: number | null; category?: string | null }) =>
    request<BsrRankChange[]>(
      `/bsr/changes?date=${payload.date}${payload.sourceType ? `&sourceType=${payload.sourceType}` : ""}${payload.sourceId ? `&sourceId=${payload.sourceId}` : ""}${payload.category ? `&category=${encodeURIComponent(payload.category)}` : ""}&limit=500`
    ),
  actionInsights: (payload: { date: string; sourceType?: BsrSourceType; sourceId?: number | null; category?: string | null }) =>
    request<CompetitorActionInsight[]>(
      `/action-insights?date=${payload.date}${payload.sourceType ? `&sourceType=${payload.sourceType}` : ""}${payload.sourceId ? `&sourceId=${payload.sourceId}` : ""}${payload.category ? `&category=${encodeURIComponent(payload.category)}` : ""}&limit=500`
    ),
  categoryReport: (date: string, categoryId?: number | null) =>
    request<CategoryReportResponse>(`/reports/category?date=${date}${categoryId ? `&categoryId=${categoryId}` : ""}`),
  createKeyword: (payload: Partial<KeywordMonitor>) =>
    request<KeywordMonitor>("/keywords", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateKeyword: (id: number, payload: Partial<KeywordMonitor>) =>
    request<KeywordMonitor>(`/keywords/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  keywordDetail: (id: number, date: string) => request<KeywordDetail>(`/keywords/${id}/detail?date=${date}`),
  collect: (payload: { keywordId?: number; date: string }) =>
    request<CollectTaskLog | CollectTaskLog[]>("/collect/run", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  competitors: (payload: { keywordId?: number | null; sourceType?: string | null; tier?: string | null } = {}) => {
    const params = new URLSearchParams();
    if (payload.keywordId) params.set("keywordId", String(payload.keywordId));
    if (payload.sourceType && payload.sourceType !== "all") params.set("sourceType", payload.sourceType);
    if (payload.tier && payload.tier !== "all") params.set("tier", payload.tier);
    const query = params.toString();
    return request<CompetitorPoolItem[]>(`/competitors${query ? `?${query}` : ""}`);
  },
  competitorFolders: () => request<CompetitorFolder[]>("/competitor-folders"),
  productActivityCalendar: (asin: string, payload: { date?: string; marketplace?: string | null; limitDays?: number } = {}) => {
    const params = new URLSearchParams();
    if (payload.date) params.set("date", payload.date);
    if (payload.marketplace) params.set("marketplace", payload.marketplace);
    if (payload.limitDays) params.set("limitDays", String(payload.limitDays));
    const query = params.toString();
    return request<ProductActivityCalendar>(`/products/${encodeURIComponent(asin)}/activity-calendar${query ? `?${query}` : ""}`);
  },
  productLink: (asin: string, keywordId?: number | null) =>
    request<ProductLink>(`/competitors/${asin}/link${keywordId ? `?keywordId=${keywordId}` : ""}`),
  setKeyCompetitor: (asin: string, isKeyCompetitor: boolean) =>
    request<CompetitorPoolItem>(`/competitors/${asin}/key`, {
      method: "PATCH",
      body: JSON.stringify({ isKeyCompetitor })
    }),
  alerts: (date: string) => request<AlertLog[]>(`/alerts?date=${date}&limit=200`),
  updateAlertStatus: (id: number, status: AlertLog["status"]) =>
    request<AlertLog>(`/alerts/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    }),
  changes: (date: string) => request<DailyChange[]>(`/changes?date=${date}`),
  report: (date: string, keyword?: string) =>
    request<DailyReportResponse>(`/reports/daily?date=${date}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ""}`),
  taskLogs: () => request<CollectTaskLog[]>("/task-logs?limit=30"),
  notificationSchedules: () => request<NotificationSchedule[]>("/notifications/schedules"),
  createNotificationSchedule: (payload: NotificationScheduleInput) =>
    request<NotificationSchedule>("/notifications/schedules", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateNotificationSchedule: (id: number, payload: Partial<NotificationScheduleInput>) =>
    request<NotificationSchedule>(`/notifications/schedules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteNotificationSchedule: (id: number) =>
    request<void>(`/notifications/schedules/${id}`, {
      method: "DELETE"
    }),
  sendNotificationSchedule: (id: number, date: string) =>
    request<NotificationSendLog>(`/notifications/schedules/${id}/send`, {
      method: "POST",
      body: JSON.stringify({ date })
    }),
  notificationLogs: () => request<NotificationSendLog[]>("/notifications/logs?limit=30")
};
