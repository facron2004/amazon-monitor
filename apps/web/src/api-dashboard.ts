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

function buildPeriodInsightReportQuery(query: PeriodInsightReportQuery): URLSearchParams {
  const params = new URLSearchParams({
    endDate: query.date,
    period: query.period ?? "weekly"
  });
  if (query.includeAiSummary) {
    params.set("includeAiSummary", "true");
  }
  return params;
}
