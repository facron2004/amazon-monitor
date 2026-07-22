import { describe, expect, it } from "vitest";
import { buildPromotionPlanView, type PromotionPlan } from "./types-promotions.js";

describe("promotion plan monitoring", () => {
  it("derives preparation, active, review, and terminal states from one plan", () => {
    const plan = fixture();
    expect(buildPromotionPlanView(plan, "2026-07-08").monitorState).toBe("preparation_due");
    expect(buildPromotionPlanView(plan, "2026-07-10").monitorState).toBe("active");
    expect(buildPromotionPlanView(plan, "2026-07-13").monitorState).toBe("review_due");
    expect(buildPromotionPlanView({ ...plan, status: "completed" }, "2026-07-13").monitorState).toBe("completed");
    expect(buildPromotionPlanView({ ...plan, status: "cancelled" }, "2026-07-10").monitorState).toBe("cancelled");
  });
});

function fixture(): PromotionPlan {
  return {
    id: 1,
    orgId: 1,
    storeId: null,
    storeName: null,
    productId: null,
    sku: null,
    asin: null,
    brand: null,
    name: "Prime Day",
    type: "prime_day",
    marketplace: "US",
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    status: "planned",
    targetPrice: null,
    budget: null,
    inventoryTarget: null,
    notes: null,
    preparationTaskId: null,
    reviewTaskId: null,
    createdBy: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z"
  };
}
