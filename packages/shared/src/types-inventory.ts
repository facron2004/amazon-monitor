import type { OwnedProductDailyMetric, ProductDataFreshness, ProductSyncStatus } from "./types-products.js";

export const inventoryPlanLevels = ["healthy", "watch", "critical", "overstock"] as const;
export type InventoryPlanLevel = (typeof inventoryPlanLevels)[number];

export const inventoryPlanPriorities = ["P0", "P1", "P2"] as const;
export type InventoryPlanPriority = (typeof inventoryPlanPriorities)[number];

export const inventoryIssueTypes = ["stockout_risk", "reorder_due", "overstock", "data_gap"] as const;
export type InventoryIssueType = (typeof inventoryIssueTypes)[number];

export interface InventoryReplenishmentSetting extends ProductDataFreshness {
  id: number;
  productId: number;
  leadTimeDays: number;
  safetyStockDays: number;
  targetStockDays: number;
  minOrderQuantity: number | null;
  packSize: number | null;
  supplierName: string | null;
  reorderPointUnits: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertInventoryReplenishmentSettingInput {
  productId: number;
  leadTimeDays?: number | null;
  safetyStockDays?: number | null;
  targetStockDays?: number | null;
  minOrderQuantity?: number | null;
  packSize?: number | null;
  supplierName?: string | null;
  reorderPointUnits?: number | null;
  dataSource?: string;
  lastSyncedAt?: string | null;
  syncStatus?: ProductSyncStatus;
  syncError?: string | null;
}

export interface InventoryReplenishmentIssue {
  type: InventoryIssueType;
  priority: InventoryPlanPriority;
  label: string;
  message: string;
  suggestion: string;
  evidence: string[];
}

export interface InventoryReplenishmentPlan {
  productId: number;
  orgId: number;
  sku: string;
  asin: string;
  marketplace: string;
  brand: string | null;
  productTitle: string;
  date: string | null;
  latestMetric: OwnedProductDailyMetric | null;
  setting: InventoryReplenishmentSetting | null;
  inventoryAvailable: number | null;
  inventoryDays: number | null;
  dailySalesVelocity: number | null;
  leadTimeDays: number;
  safetyStockDays: number;
  targetStockDays: number;
  reorderPointUnits: number | null;
  recommendedOrderQuantity: number | null;
  stockoutDate: string | null;
  reorderByDate: string | null;
  level: InventoryPlanLevel;
  issues: InventoryReplenishmentIssue[];
  freshness: ProductDataFreshness;
}

export interface InventoryPlanListFilter {
  orgId?: number;
  productId?: number;
  date?: string;
  q?: string;
  level?: InventoryPlanLevel;
  limit?: number;
  offset?: number;
}
