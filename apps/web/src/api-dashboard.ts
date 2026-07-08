import type { CollectTaskLog, DashboardSummary } from "@amazon-monitor/shared";
import { request, withSignal } from "./api-base";
import type {
  CategoryReportResponse,
  DailyReportResponse,
  InsightReportPeriod,
  PeriodInsightReportResponse
} from "./api-types";

export interface PeriodInsightReportQuery {
  date: string;
  period?: InsightReportPeriod;
  includeAiSummary?: boolean;
}

export const dashboardApi = {
  summary: (date: string) => request<DashboardSummary>(`/dashboard/summary?date=${date}`),
  report: (date: string, keyword?: string) =>
    request<DailyReportResponse>(`/reports/daily?date=${date}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ""}`),
  categoryReport: (date: string, categoryId?: number | null) =>
    request<CategoryReportResponse>(`/reports/category?date=${date}${categoryId ? `&categoryId=${categoryId}` : ""}`),
  periodInsightReport: (query: PeriodInsightReportQuery, signal?: AbortSignal) =>
    request<PeriodInsightReportResponse>(
      `/reports/insights/period?${buildPeriodInsightReportQuery(query).toString()}`,
      withSignal(signal)
    ),
  taskLogs: () => request<CollectTaskLog[]>("/task-logs?limit=30")
};

export function buildPeriodInsightReportQuery(query: PeriodInsightReportQuery): URLSearchParams {
  const params = new URLSearchParams({
    endDate: query.date,
    period: query.period ?? "weekly"
  });
  if (query.includeAiSummary) {
    params.set("includeAiSummary", "true");
  }
  return params;
}

export function buildDailyReportExcelUrl(date: string, baseUrl = import.meta.env.VITE_API_BASE?.trim() || "/api"): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return `${normalizedBaseUrl}/reports/daily.xlsx?date=${encodeURIComponent(date)}`;
}

export async function downloadDailyReportExcel(date: string): Promise<void> {
  const token = localStorage.getItem("amazon_monitor_auth_token");
  const response = await fetch(buildDailyReportExcelUrl(date), {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem("amazon_monitor_auth_token");
      window.dispatchEvent(new CustomEvent("amazon-monitor-unauthorized"));
    }
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message ?? response.statusText);
  }

  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `amazon-monitor-${date}.xlsx`;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(blobUrl);
  }
}
