import type { DataSourceStatus, DataSourceSyncStatus, DataSourceType } from "./types-data-sources.js";

export const dailyReportCoverageStatuses = ["complete", "partial", "empty"] as const;

export type DailyReportCoverageStatus = (typeof dailyReportCoverageStatuses)[number];

export const dailyReportCoverageStatusLabels: Record<DailyReportCoverageStatus, string> = {
  complete: "覆盖完整",
  partial: "部分数据",
  empty: "等待数据"
};

export interface DailyReportCoverage {
  ownSkuMetrics: number;
  keywordSnapshots: number;
  categorySnapshots: number;
  competitorChanges: number;
  bsrChanges: number;
  insightEvents: number;
  adsMetrics: number;
  inventoryPlans: number;
  openTasks: number;
}

export const dailyReportCoverageFeedKeys = [
  "ownSkuMetrics",
  "keywordSnapshots",
  "categorySnapshots",
  "adsMetrics",
  "inventoryPlans"
] as const;

export type DailyReportCoverageFeedKey = (typeof dailyReportCoverageFeedKeys)[number];

export const dailyReportReadinessStates = ["ready", "missing", "attention"] as const;

export type DailyReportReadinessState = (typeof dailyReportReadinessStates)[number];

export interface DailyReportReadinessSource {
  id: number;
  name: string;
  sourceType: DataSourceType;
  status: DataSourceStatus;
  syncStatus: DataSourceSyncStatus;
  lastSuccessAt: string | null;
}

export interface DailyReportReadinessAction {
  target: "data-sources" | "collectors";
  label: string;
}

export interface DailyReportReadinessItem {
  feed: DailyReportCoverageFeedKey;
  label: string;
  count: number;
  state: DailyReportReadinessState;
  message: string;
  sources: DailyReportReadinessSource[];
  action: DailyReportReadinessAction;
}

export interface DailyReportReadiness {
  reportDate: string;
  archiveGenerated: boolean;
  coverageStatus: DailyReportCoverageStatus;
  gapsCount: number;
  items: DailyReportReadinessItem[];
}

export interface DailyReportArchive {
  id: number;
  orgId: number;
  reportDate: string;
  markdown: string;
  coverageStatus: DailyReportCoverageStatus;
  coverage: DailyReportCoverage;
  signalCount: number;
  riskCount: number;
  taskCount: number;
  version: number;
  generatedBy: number | null;
  generatedByName: string | null;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyReportHistoryResponse {
  items: DailyReportArchive[];
  total: number;
  limit: number;
  offset: number;
}

export const workflowReportPeriods = ["weekly", "monthly"] as const;

export type WorkflowReportPeriod = (typeof workflowReportPeriods)[number];

export const workflowReportPeriodLabels: Record<WorkflowReportPeriod, string> = {
  weekly: "周报",
  monthly: "月报"
};

export interface PeriodReportCoverage {
  productMetrics: number;
  marketplaces: number;
  insightEvents: number;
  adsMetrics: number;
  listingHealthItems: number;
  reviews: number;
  completedTasks: number;
}

export interface PeriodReportArchive {
  id: number;
  orgId: number;
  period: WorkflowReportPeriod;
  startDate: string;
  endDate: string;
  markdown: string;
  coverageStatus: DailyReportCoverageStatus;
  coverage: PeriodReportCoverage;
  salesMarketplaceCount: number;
  insightCount: number;
  completedTaskCount: number;
  version: number;
  generatedBy: number | null;
  generatedByName: string | null;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PeriodReportHistoryResponse {
  items: PeriodReportArchive[];
  total: number;
  limit: number;
  offset: number;
}
