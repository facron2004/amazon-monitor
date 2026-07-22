import type { ProductDataFreshness, ProductSyncStatus } from "./types-products.js";

export const adsInsightTypes = ["spend_spike", "acos_high", "wasted_spend", "scale_opportunity", "data_gap"] as const;
export type AdsInsightType = (typeof adsInsightTypes)[number];

export const adsInsightPriorities = ["P0", "P1", "P2"] as const;
export type AdsInsightPriority = (typeof adsInsightPriorities)[number];

export const adsWorkflowLevels = ["healthy", "watch", "risk", "scale"] as const;
export type AdsWorkflowLevel = (typeof adsWorkflowLevels)[number];

export interface AdDailyMetric extends ProductDataFreshness {
  id: number;
  orgId: number;
  productId: number | null;
  date: string;
  campaignId: string;
  campaignName: string;
  adGroupName: string | null;
  targetText: string | null;
  searchTerm: string | null;
  matchType: string | null;
  impressions: number | null;
  clicks: number | null;
  spend: number | null;
  sales: number | null;
  orders: number | null;
  unitsSold: number | null;
  acos: number | null;
  roas: number | null;
  cpc: number | null;
  ctr: number | null;
  cvr: number | null;
  budget: number | null;
  budgetUsageRate: number | null;
  createdAt: string;
}

export interface UpsertAdDailyMetricInput {
  orgId: number;
  productId?: number | null;
  date: string;
  campaignId: string;
  campaignName: string;
  adGroupName?: string | null;
  targetText?: string | null;
  searchTerm?: string | null;
  matchType?: string | null;
  impressions?: number | null;
  clicks?: number | null;
  spend?: number | null;
  sales?: number | null;
  orders?: number | null;
  unitsSold?: number | null;
  acos?: number | null;
  roas?: number | null;
  cpc?: number | null;
  ctr?: number | null;
  cvr?: number | null;
  budget?: number | null;
  budgetUsageRate?: number | null;
  dataSource?: string;
  lastSyncedAt?: string | null;
  syncStatus?: ProductSyncStatus;
  syncError?: string | null;
}

export interface AdsWorkflowInsight {
  type: AdsInsightType;
  priority: AdsInsightPriority;
  label: string;
  message: string;
  suggestion: string;
  evidence: string[];
}

export interface AdsWorkflowItem {
  metric: AdDailyMetric;
  productSku: string | null;
  productAsin: string | null;
  level: AdsWorkflowLevel;
  efficiencyScore: number;
  wasteScore: number;
  scaleScore: number;
  insights: AdsWorkflowInsight[];
}

export interface AdsWorkflowSummary {
  date: string;
  totalSpend: number;
  totalSales: number;
  averageAcos: number | null;
  riskCount: number;
  scaleCount: number;
  items: AdsWorkflowItem[];
}

export interface AdsWorkflowResponse extends Omit<AdsWorkflowSummary, "totalSpend" | "totalSales"> {
  accessLevel: "full" | "summary";
  totalSpend: number | null;
  totalSales: number | null;
}

export interface AdsMetricListFilter {
  orgId?: number;
  productId?: number;
  date?: string;
  startDate?: string;
  endDate?: string;
  q?: string;
  level?: AdsWorkflowLevel;
  limit?: number;
  offset?: number;
}
