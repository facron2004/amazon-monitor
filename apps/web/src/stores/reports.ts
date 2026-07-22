import { defineStore } from "pinia";
import type {
  DailyReportArchive,
  DailyReportReadiness,
  PeriodReportArchive,
  WorkflowReportPeriod
} from "@amazon-monitor/shared";
import { reportsApi } from "../api-reports";
import type {
  CategoryReportResponse,
  DailyReportResponse,
  InsightReportPeriod,
  PeriodInsightReportResponse
} from "../api-types";

export const useReportsStore = defineStore("reports", {
  state: () => ({
    dailyReport: null as DailyReportResponse | null,
    categoryReport: null as CategoryReportResponse | null,
    periodInsightReport: null as PeriodInsightReportResponse | null,
    archive: null as DailyReportArchive | null,
    readiness: null as DailyReportReadiness | null,
    history: [] as DailyReportArchive[],
    historyTotal: 0,
    periodArchive: null as PeriodReportArchive | null,
    periodHistory: [] as PeriodReportArchive[],
    periodHistoryTotal: 0,
    generating: false,
    periodGenerating: false,
    selectingArchive: false,
    selectingPeriodArchive: false,
    readinessLoading: false
  }),
  actions: {
    async loadArchive(date: string, signal?: AbortSignal) {
      this.archive = await reportsApi.archive(date, signal);
    },

    async loadWorkspace(date: string, period: InsightReportPeriod = "weekly", signal?: AbortSignal) {
      this.readinessLoading = true;
      try {
        const [
          dailyReport,
          categoryReport,
          periodInsightReport,
          archive,
          readiness,
          history,
          periodArchive,
          periodHistory
        ] = await Promise.all([
          reportsApi.daily(date, undefined, signal),
          reportsApi.category(date, undefined, signal),
          reportsApi.periodInsight({ date, period }, signal),
          reportsApi.archive(date, signal),
          reportsApi.readiness(date, signal),
          reportsApi.history(30, 0, signal),
          reportsApi.periodArchive(date, period, signal),
          reportsApi.periodHistory(period, 30, 0, signal)
        ]);
        this.dailyReport = dailyReport;
        this.categoryReport = categoryReport;
        this.periodInsightReport = periodInsightReport;
        this.archive = archive;
        this.readiness = readiness;
        this.history = history.items;
        this.historyTotal = history.total;
        this.periodArchive = periodArchive;
        this.periodHistory = periodHistory.items;
        this.periodHistoryTotal = periodHistory.total;
      } finally {
        this.readinessLoading = false;
      }
    },

    async loadPeriodInsightReport(date: string, period: InsightReportPeriod, includeAiSummary = false) {
      this.periodInsightReport = await reportsApi.periodInsight({ date, period, includeAiSummary });
    },

    async loadPeriodWorkspace(date: string, period: WorkflowReportPeriod) {
      const [periodInsightReport, archive, history] = await Promise.all([
        reportsApi.periodInsight({ date, period }),
        reportsApi.periodArchive(date, period),
        reportsApi.periodHistory(period)
      ]);
      this.periodInsightReport = periodInsightReport;
      this.periodArchive = archive;
      this.periodHistory = history.items;
      this.periodHistoryTotal = history.total;
    },

    async generateDaily(date: string) {
      this.generating = true;
      this.readinessLoading = true;
      try {
        const generated = await reportsApi.generateDaily(date);
        const [readiness, history] = await Promise.all([
          reportsApi.readiness(date),
          reportsApi.history(30, 0)
        ]);
        this.archive = generated;
        this.readiness = readiness;
        this.history = history.items;
        this.historyTotal = history.total;
        return generated;
      } finally {
        this.generating = false;
        this.readinessLoading = false;
      }
    },

    async selectArchive(date: string) {
      this.selectingArchive = true;
      this.readinessLoading = true;
      try {
        const [archive, readiness] = await Promise.all([
          reportsApi.archive(date),
          reportsApi.readiness(date)
        ]);
        this.archive = archive;
        this.readiness = readiness;
      } finally {
        this.selectingArchive = false;
        this.readinessLoading = false;
      }
    },

    async generatePeriod(endDate: string, period: WorkflowReportPeriod) {
      this.periodGenerating = true;
      try {
        const generated = await reportsApi.generatePeriod(endDate, period);
        const history = await reportsApi.periodHistory(period);
        this.periodArchive = generated;
        this.periodHistory = history.items;
        this.periodHistoryTotal = history.total;
        return generated;
      } finally {
        this.periodGenerating = false;
      }
    },

    async selectPeriodArchive(endDate: string, period: WorkflowReportPeriod) {
      this.selectingPeriodArchive = true;
      try {
        this.periodArchive = await reportsApi.periodArchive(endDate, period);
      } finally {
        this.selectingPeriodArchive = false;
      }
    }
  }
});
