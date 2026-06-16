import type { CollectTaskLog, DashboardSummary } from "@amazon-monitor/shared";
import { request } from "./api-base";
import type { CategoryReportResponse, DailyReportResponse } from "./api-types";

export const dashboardApi = {
  summary: (date: string) => request<DashboardSummary>(`/dashboard/summary?date=${date}`),
  report: (date: string, keyword?: string) =>
    request<DailyReportResponse>(`/reports/daily?date=${date}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ""}`),
  categoryReport: (date: string, categoryId?: number | null) =>
    request<CategoryReportResponse>(`/reports/category?date=${date}${categoryId ? `&categoryId=${categoryId}` : ""}`),
  taskLogs: () => request<CollectTaskLog[]>("/task-logs?limit=30")
};
