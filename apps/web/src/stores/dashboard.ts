import { defineStore } from "pinia";
import type { CollectJob, CollectTaskLog, DashboardSummary, QueueStats, WorkerStatus } from "@amazon-monitor/shared";
import { collectApi } from "../api-collect";
import { dashboardApi } from "../api-dashboard";
import type { CategoryReportResponse, DailyReportResponse, PeriodInsightReportResponse } from "../api-types";

export const useDashboardStore = defineStore("dashboard", {
  state: () => ({
    summary: null as DashboardSummary | null,
    logs: [] as CollectTaskLog[],
    collectJobs: [] as CollectJob[],
    queueStats: null as QueueStats | null,
    workerStatus: null as WorkerStatus | null,
    report: null as DailyReportResponse | null,
    categoryReport: null as CategoryReportResponse | null,
    periodInsightReport: null as PeriodInsightReportResponse | null,
  }),
  actions: {
    async loadSummary(date: string) {
      this.summary = await dashboardApi.summary(date);
    },
    async loadLogs() {
      this.logs = await dashboardApi.taskLogs();
    },
    async loadCollectJobs() {
      this.collectJobs = await collectApi.listJobs(50, 0);
    },
    async loadQueueStats() {
      this.queueStats = await collectApi.fetchQueueStats();
    },
    async loadWorkerStatus() {
      this.workerStatus = await collectApi.fetchWorkerStatus();
    },
    async loadReport(date: string, signal?: AbortSignal) {
      const [keywordReport, allCategoryReport, insightReport] = await Promise.all([
        dashboardApi.report(date),
        dashboardApi.categoryReport(date),
        dashboardApi.periodInsightReport({ date, period: "weekly" }, signal)
      ]);
      this.report = keywordReport;
      this.categoryReport = allCategoryReport;
      this.periodInsightReport = insightReport;
    },
    async loadPeriodInsightReport(date: string, includeAiSummary = false) {
      this.periodInsightReport = await dashboardApi.periodInsightReport({ date, period: "weekly", includeAiSummary });
    }
  }
});
