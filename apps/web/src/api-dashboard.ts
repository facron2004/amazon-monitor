import type { DashboardOverviewResponse } from "@amazon-monitor/shared";
import { request } from "./api-base";

export const dashboardApi = {
  summary: (date: string) => request<DashboardOverviewResponse>(`/dashboard/summary?date=${date}`)
};
