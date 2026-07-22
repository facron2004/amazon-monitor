import { describe, expect, it } from "vitest";
import type { InventoryReplenishmentPlan } from "@amazon-monitor/shared";
import {
  buildInventoryPlanTask,
  hasActionableInventoryEvidence,
  inventoryPlanTaskSourceId
} from "./inventory-task-service.js";

describe("inventory task service", () => {
  it("builds an approval-gated overstock action from the plan evidence", () => {
    const plan = createPlan({
      level: "overstock",
      recommendedOrderQuantity: 0,
      issues: [{
        type: "overstock",
        priority: "P1",
        label: "Overstock risk",
        message: "Inventory exceeds 90 days.",
        suggestion: "Pause replenishment.",
        evidence: ["inventory_days=120"]
      }]
    });

    expect(hasActionableInventoryEvidence(plan)).toBe(true);
    expect(inventoryPlanTaskSourceId(plan)).toBe("inventory-plan:7:2026-07-16:overstock");
    expect(buildInventoryPlanTask(plan, { orgId: 3, createdBy: 9 })).toMatchObject({
      orgId: 3,
      sourceType: "rule",
      sourceId: "inventory-plan:7:2026-07-16:overstock",
      title: "库存处置：QA-SKU",
      taskType: "inventory",
      priority: "P1",
      dueDate: null,
      createdBy: 9
    });
  });

  it("rejects a data-gap-only plan as non-actionable", () => {
    const plan = createPlan({
      level: "watch",
      issues: [{
        type: "data_gap",
        priority: "P2",
        label: "Missing metrics",
        message: "No inventory evidence.",
        suggestion: "Sync inventory.",
        evidence: []
      }]
    });

    expect(hasActionableInventoryEvidence(plan)).toBe(false);
  });
});

function createPlan(overrides: Partial<InventoryReplenishmentPlan>): InventoryReplenishmentPlan {
  return {
    productId: 7,
    orgId: 3,
    sku: "QA-SKU",
    asin: "B0INVQA001",
    marketplace: "US",
    brand: "QA Brand",
    productTitle: "QA Product",
    date: "2026-07-16",
    latestMetric: null,
    setting: null,
    inventoryAvailable: 600,
    inventoryDays: 120,
    dailySalesVelocity: 5,
    leadTimeDays: 21,
    safetyStockDays: 14,
    targetStockDays: 60,
    reorderPointUnits: 175,
    recommendedOrderQuantity: null,
    stockoutDate: null,
    reorderByDate: null,
    level: "healthy",
    issues: [],
    freshness: {
      dataSource: "manual",
      lastSyncedAt: "2026-07-16T08:00:00.000Z",
      syncStatus: "manual",
      syncError: null
    },
    ...overrides
  };
}
