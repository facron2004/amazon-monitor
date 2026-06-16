import { defineStore } from "pinia";
import type { CollectTaskLog, DashboardSummary } from "@amazon-monitor/shared";
import { dashboardApi } from "../api-dashboard";
import type { CategoryReportResponse, DailyReportResponse } from "../api-types";

export const useDashboardStore = defineStore("dashboard", {
  state: () => ({
    summary: null as DashboardSummary | null,
    logs: [] as CollectTaskLog[],
    report: null as DailyReportResponse | null,
    categoryReport: null as CategoryReportResponse | null,
  }),
  actions: {
    async loadSummary(date: string) {
      this.summary = await dashboardApi.summary(date);
    },
    async loadLogs() {
      this.logs = await dashboardApi.taskLogs();
    },
    async loadReport(date: string) {
      const [keywordReport, allCategoryReport] = await Promise.all([
        dashboardApi.report(date),
        dashboardApi.categoryReport(date)
      ]);
      this.report = keywordReport;
      this.categoryReport = allCategoryReport;
    }
  }
});
