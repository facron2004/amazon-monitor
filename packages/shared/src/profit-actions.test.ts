import { describe, expect, it } from "vitest";
import type { ProductProfitPlan } from "./types-profit.js";
import { buildProductProfitActionOptions } from "./profit-actions.js";

describe("profit action options", () => {
  it("allows only scenarios inside both price and margin guardrails", () => {
    const options = buildProductProfitActionOptions(createPlan());

    expect(options).toEqual([
      expect.objectContaining({
        kind: "target_margin",
        price: 234.62,
        marginRate: 0.3,
        safe: true
      }),
      expect.objectContaining({
        kind: "coupon_10",
        price: 198,
        safe: true
      }),
      expect.objectContaining({
        kind: "coupon_15",
        price: 187,
        safe: false,
        blockedReasons: expect.arrayContaining(["低于最低安全价", "低于最低毛利率"])
      }),
      expect.objectContaining({
        kind: "deal",
        price: 176,
        safe: false
      })
    ]);
  });

  it("blocks every action when safety-line evidence is missing", () => {
    const options = buildProductProfitActionOptions(createPlan({
      minimumSafePrice: null,
      targetMarginPrice: null
    }));

    expect(options.every((option) => !option.safe)).toBe(true);
    expect(options[0].blockedReasons).toEqual(expect.arrayContaining([
      "缺少可执行价格",
      "缺少最低安全价"
    ]));
  });
});

function createPlan(overrides: Partial<ProductProfitPlan> = {}): ProductProfitPlan {
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
    scenarios: [
      scenario("current", "Current", 220, 0.2655),
      scenario("coupon_10", "10% Coupon", 198, 0.205),
      scenario("coupon_15", "15% Coupon", 187, 0.1676),
      scenario("deal", "Deal", 176, 0.0984)
    ],
    level: "watch",
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

function scenario(
  kind: ProductProfitPlan["scenarios"][number]["kind"],
  label: string,
  price: number,
  marginRate: number
): ProductProfitPlan["scenarios"][number] {
  return {
    kind,
    label,
    price,
    discountRate: 0,
    grossRevenue: null,
    productCost: null,
    platformFees: null,
    adCost: null,
    promoCost: null,
    netProfit: null,
    marginRate,
    profitPerUnit: null
  };
}
