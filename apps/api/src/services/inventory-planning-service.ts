import type {
  InventoryPlanLevel,
  InventoryReplenishmentIssue,
  InventoryReplenishmentPlan,
  InventoryReplenishmentSetting,
  OwnedProductDailyMetric,
  ProductDataFreshness
} from "@amazon-monitor/shared";

const DEFAULT_LEAD_TIME_DAYS = 21;
const DEFAULT_SAFETY_STOCK_DAYS = 14;
const DEFAULT_TARGET_STOCK_DAYS = 60;
const OVERSTOCK_DAYS = 120;

interface InventoryProduct {
  productId: number;
  orgId: number;
  sku: string;
  asin: string;
  marketplace: string;
  brand: string | null;
  productTitle: string;
  freshness: ProductDataFreshness;
}

export function buildInventoryReplenishmentPlan(input: {
  product: InventoryProduct;
  metrics: OwnedProductDailyMetric[];
  setting: InventoryReplenishmentSetting | null;
  date?: string;
}): InventoryReplenishmentPlan {
  const latestMetric = input.metrics[0] ?? null;
  const leadTimeDays = input.setting?.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
  const safetyStockDays = input.setting?.safetyStockDays ?? DEFAULT_SAFETY_STOCK_DAYS;
  const targetStockDays = input.setting?.targetStockDays ?? DEFAULT_TARGET_STOCK_DAYS;
  const dailySalesVelocity = inferDailyVelocity(input.metrics, latestMetric);
  const inventoryAvailable = latestMetric?.inventoryAvailable ?? null;
  const inventoryDays = latestMetric?.inventoryDays ?? inferInventoryDays(inventoryAvailable, dailySalesVelocity);
  const reorderPointUnits = input.setting?.reorderPointUnits ?? inferReorderPoint(dailySalesVelocity, leadTimeDays, safetyStockDays);
  const recommendedOrderQuantity = recommendOrderQuantity({
    inventoryAvailable,
    dailySalesVelocity,
    targetStockDays,
    minOrderQuantity: input.setting?.minOrderQuantity ?? null,
    packSize: input.setting?.packSize ?? null
  });
  const stockoutDate = inventoryDays === null ? null : addDays(input.date ?? latestMetric?.date, Math.floor(inventoryDays));
  const reorderByDate = inventoryDays === null ? null : addDays(input.date ?? latestMetric?.date, Math.floor(inventoryDays - leadTimeDays - safetyStockDays));
  const issues = buildIssues({
    latestMetric,
    inventoryDays,
    inventoryAvailable,
    dailySalesVelocity,
    leadTimeDays,
    safetyStockDays,
    targetStockDays,
    recommendedOrderQuantity
  });
  return {
    ...input.product,
    date: input.date ?? latestMetric?.date ?? null,
    latestMetric,
    setting: input.setting,
    inventoryAvailable,
    inventoryDays,
    dailySalesVelocity,
    leadTimeDays,
    safetyStockDays,
    targetStockDays,
    reorderPointUnits,
    recommendedOrderQuantity,
    stockoutDate,
    reorderByDate,
    level: deriveLevel(issues),
    issues,
    freshness: latestMetric ? metricFreshness(latestMetric) : input.product.freshness
  };
}

function buildIssues(input: {
  latestMetric: OwnedProductDailyMetric | null;
  inventoryDays: number | null;
  inventoryAvailable: number | null;
  dailySalesVelocity: number | null;
  leadTimeDays: number;
  safetyStockDays: number;
  targetStockDays: number;
  recommendedOrderQuantity: number | null;
}): InventoryReplenishmentIssue[] {
  if (!input.latestMetric || input.inventoryDays === null || input.dailySalesVelocity === null) {
    return [{
      type: "data_gap",
      priority: "P2",
      label: "Missing inventory evidence",
      message: "Inventory days or sales velocity is missing.",
      suggestion: "Import daily inventory and units-sold metrics before approving replenishment decisions.",
      evidence: [
        `inventory_days=${input.inventoryDays ?? "n/a"}`,
        `daily_velocity=${input.dailySalesVelocity ?? "n/a"}`
      ]
    }];
  }

  const issues: InventoryReplenishmentIssue[] = [];
  const reorderThreshold = input.leadTimeDays + input.safetyStockDays;
  if (input.inventoryDays <= input.safetyStockDays) {
    issues.push({
      type: "stockout_risk",
      priority: "P0",
      label: "Stockout risk",
      message: `Inventory covers only ${input.inventoryDays.toFixed(1)} days.`,
      suggestion: "Create an urgent replenishment task and verify supplier or FBA transfer options.",
      evidence: [`inventory_days=${input.inventoryDays.toFixed(1)}`, `safety_stock_days=${input.safetyStockDays}`]
    });
  } else if (input.inventoryDays <= reorderThreshold) {
    issues.push({
      type: "reorder_due",
      priority: "P1",
      label: "Reorder due",
      message: `Inventory is inside the ${reorderThreshold}-day lead-time plus safety-stock window.`,
      suggestion: "Prepare a purchase order or transfer plan after checking demand and margin assumptions.",
      evidence: [`inventory_days=${input.inventoryDays.toFixed(1)}`, `recommended_qty=${input.recommendedOrderQuantity ?? "n/a"}`]
    });
  }

  if (input.inventoryDays >= Math.max(OVERSTOCK_DAYS, input.targetStockDays * 1.8)) {
    issues.push({
      type: "overstock",
      priority: "P2",
      label: "Overstock watch",
      message: `Inventory covers ${input.inventoryDays.toFixed(1)} days, above the target window.`,
      suggestion: "Review demand, storage fees, promotions, and replenishment pacing before placing another order.",
      evidence: [`inventory_days=${input.inventoryDays.toFixed(1)}`, `target_stock_days=${input.targetStockDays}`]
    });
  }

  return issues;
}

function inferDailyVelocity(metrics: OwnedProductDailyMetric[], latest: OwnedProductDailyMetric | null): number | null {
  const units = metrics.slice(0, 14).map((metric) => metric.unitsSold).filter(isPositiveNumber);
  if (units.length > 0) {
    return round(units.reduce((sum, value) => sum + value, 0) / units.length);
  }
  if (latest?.inventoryAvailable !== null && latest?.inventoryAvailable !== undefined && latest.inventoryDays !== null && latest.inventoryDays !== undefined && latest.inventoryDays > 0) {
    return round(latest.inventoryAvailable / latest.inventoryDays);
  }
  return null;
}

function inferInventoryDays(inventoryAvailable: number | null, dailySalesVelocity: number | null): number | null {
  if (inventoryAvailable === null || dailySalesVelocity === null || dailySalesVelocity <= 0) return null;
  return round(inventoryAvailable / dailySalesVelocity);
}

function inferReorderPoint(dailySalesVelocity: number | null, leadTimeDays: number, safetyStockDays: number): number | null {
  if (dailySalesVelocity === null) return null;
  return Math.ceil(dailySalesVelocity * (leadTimeDays + safetyStockDays));
}

function recommendOrderQuantity(input: {
  inventoryAvailable: number | null;
  dailySalesVelocity: number | null;
  targetStockDays: number;
  minOrderQuantity: number | null;
  packSize: number | null;
}): number | null {
  if (input.inventoryAvailable === null || input.dailySalesVelocity === null) return null;
  const targetUnits = Math.ceil(input.dailySalesVelocity * input.targetStockDays);
  let quantity = Math.max(0, targetUnits - input.inventoryAvailable);
  if (input.minOrderQuantity !== null && quantity > 0) {
    quantity = Math.max(quantity, input.minOrderQuantity);
  }
  if (input.packSize !== null && input.packSize > 1 && quantity > 0) {
    quantity = Math.ceil(quantity / input.packSize) * input.packSize;
  }
  return quantity;
}

function deriveLevel(issues: InventoryReplenishmentIssue[]): InventoryPlanLevel {
  if (issues.some((issue) => issue.priority === "P0")) return "critical";
  if (issues.some((issue) => issue.type === "overstock")) return "overstock";
  if (issues.some((issue) => issue.priority === "P1" || issue.type === "data_gap")) return "watch";
  return "healthy";
}

function metricFreshness(metric: OwnedProductDailyMetric): ProductDataFreshness {
  return {
    dataSource: metric.dataSource,
    lastSyncedAt: metric.lastSyncedAt,
    syncStatus: metric.syncStatus,
    syncError: metric.syncError
  };
}

function addDays(date: string | undefined, days: number): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + Math.max(0, days));
  return parsed.toISOString().slice(0, 10);
}

function isPositiveNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
