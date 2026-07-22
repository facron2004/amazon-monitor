import type { OwnedProductDailyMetric, ProductDataFreshness, ProductSyncStatus } from "./types-products.js";
import type { Task } from "./types-workflow.js";

export const profitPlanLevels = ["healthy", "watch", "risk", "data_gap"] as const;
export type ProfitPlanLevel = (typeof profitPlanLevels)[number];

export const profitScenarioKinds = ["current", "coupon_10", "coupon_15", "deal"] as const;
export type ProfitScenarioKind = (typeof profitScenarioKinds)[number];

export const profitActionKinds = ["target_margin", "coupon_10", "coupon_15", "deal"] as const;
export type ProfitActionKind = (typeof profitActionKinds)[number];

export const profitIssueTypes = ["missing_sales", "missing_cost", "below_min_margin", "below_target_margin", "ad_cost_pressure"] as const;
export type ProfitIssueType = (typeof profitIssueTypes)[number];

export const profitIssuePriorities = ["P0", "P1", "P2"] as const;
export type ProfitIssuePriority = (typeof profitIssuePriorities)[number];

export interface ProductProfitSetting extends ProductDataFreshness {
  id: number;
  productId: number;
  purchaseCost: number | null;
  inboundFreight: number | null;
  fbaFee: number | null;
  referralFeeRate: number;
  storageFee: number | null;
  returnLossRate: number;
  targetMarginRate: number;
  minimumMarginRate: number;
  dealFee: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertProductProfitSettingInput {
  productId: number;
  purchaseCost?: number | null;
  inboundFreight?: number | null;
  fbaFee?: number | null;
  referralFeeRate?: number | null;
  storageFee?: number | null;
  returnLossRate?: number | null;
  targetMarginRate?: number | null;
  minimumMarginRate?: number | null;
  dealFee?: number | null;
  dataSource?: string;
  lastSyncedAt?: string | null;
  syncStatus?: ProductSyncStatus;
  syncError?: string | null;
}

export interface ProductProfitScenario {
  kind: ProfitScenarioKind;
  label: string;
  price: number | null;
  discountRate: number;
  grossRevenue: number | null;
  productCost: number | null;
  platformFees: number | null;
  adCost: number | null;
  promoCost: number | null;
  netProfit: number | null;
  marginRate: number | null;
  profitPerUnit: number | null;
}

export interface ProductProfitIssue {
  type: ProfitIssueType;
  priority: ProfitIssuePriority;
  label: string;
  message: string;
  suggestion: string;
  evidence: string[];
}

export interface ProductProfitPlan {
  productId: number;
  orgId: number;
  sku: string;
  asin: string;
  marketplace: string;
  brand: string | null;
  productTitle: string;
  date: string | null;
  latestMetric: OwnedProductDailyMetric | null;
  setting: ProductProfitSetting | null;
  salesAmount: number | null;
  unitsSold: number | null;
  averageSellingPrice: number | null;
  adSpend: number | null;
  adCostPerUnit: number | null;
  tacos: number | null;
  grossMargin: number | null;
  targetMarginRate: number;
  minimumMarginRate: number;
  minimumSafePrice: number | null;
  targetMarginPrice: number | null;
  scenarios: ProductProfitScenario[];
  level: ProfitPlanLevel;
  issues: ProductProfitIssue[];
  freshness: ProductDataFreshness;
}

export interface ProductProfitPlanFilter {
  orgId?: number;
  productId?: number;
  date?: string;
  q?: string;
  level?: ProfitPlanLevel;
  limit?: number;
  offset?: number;
}

export interface ProductProfitActionOption {
  kind: ProfitActionKind;
  label: string;
  price: number | null;
  marginRate: number | null;
  safe: boolean;
  blockedReasons: string[];
}

export interface ProductProfitActionTaskResponse {
  created: boolean;
  option: ProductProfitActionOption;
  task: Task;
}
