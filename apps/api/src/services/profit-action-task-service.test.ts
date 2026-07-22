import { describe, expect, it } from "vitest";
import type {
  InventoryReplenishmentPlan,
  ProductProfitActionOption,
  ProductProfitPlan
} from "@amazon-monitor/shared";
import {
  buildProfitActionTask,
  profitActionTaskSourceId
} from "./profit-action-task-service.js";

describe("profit action task service", () => {
  it("builds a non-automatic price review task without exposing raw costs", () => {
    const plan = createProfitPlan();
    const option: ProductProfitActionOption = {
      kind: "target_margin",
      label: "目标毛利价",
      price: 234.62,
      marginRate: 0.3,
      safe: true,
      blockedReasons: []
    };
    const task = buildProfitActionTask(plan, option, createInventoryPlan(), {
      orgId: 1,
      createdBy: 2
    });

    expect(profitActionTaskSourceId(plan, option)).toBe("profit-plan:1:2026-07-16:target_margin");
    expect(task).toMatchObject({
      sourceType: "rule",
      sourceId: "profit-plan:1:2026-07-16:target_margin",
      title: "价格调整评审：QA-PROFIT · 目标毛利价",
      taskType: "price",
      priority: "P1",
      dueDate: "2026-07-16"
    });
    expect(task.description).toContain("拟执行价格：$234.62");
    expect(task.description).toContain("库存证据：18 天 · watch");
    expect(task.description).toContain("竞品证据缺口");
    expect(task.description).toContain("不会自动改价");
    expect(task.description).not.toContain("采购成本");
  });
});

function createProfitPlan(): ProductProfitPlan {
  return {
    productId: 1,
    orgId: 1,
    sku: "QA-PROFIT",
    asin: "B0PROFITQA",
    marketplace: "US",
    brand: "Northstar",
    productTitle: "Northstar Product",
    date: "2026-07-16",
    latestMetric: null,
    setting: null,
    salesAmount: 2200,
    unitsSold: 10,
    averageSellingPrice: 220,
    adSpend: 100,
    adCostPerUnit: 10,
    tacos: 0.045,
    grossMargin: 0.36,
    targetMarginRate: 0.3,
    minimumMarginRate: 0.2,
    minimumSafePrice: 196.77,
    targetMarginPrice: 234.62,
    scenarios: [],
    level: "watch",
    issues: [{
      type: "below_target_margin",
      priority: "P1",
      label: "Below target",
      message: "Current margin is below target.",
      suggestion: "Review price.",
      evidence: []
    }],
    freshness: {
      dataSource: "manual",
      lastSyncedAt: "2026-07-16T08:00:00.000Z",
      syncStatus: "manual",
      syncError: null
    }
  };
}

function createInventoryPlan(): InventoryReplenishmentPlan {
  return {
    productId: 1,
    orgId: 1,
    sku: "QA-PROFIT",
    asin: "B0PROFITQA",
    marketplace: "US",
    brand: "Northstar",
    productTitle: "Northstar Product",
    date: "2026-07-16",
    latestMetric: null,
    setting: null,
    inventoryAvailable: 180,
    inventoryDays: 18,
    dailySalesVelocity: 10,
    leadTimeDays: 20,
    safetyStockDays: 10,
    targetStockDays: 60,
    reorderPointUnits: 300,
    recommendedOrderQuantity: 420,
    stockoutDate: "2026-08-04",
    reorderByDate: "2026-07-16",
    level: "watch",
    issues: [],
    freshness: {
      dataSource: "manual",
      lastSyncedAt: "2026-07-16T08:00:00.000Z",
      syncStatus: "manual",
      syncError: null
    }
  };
}
