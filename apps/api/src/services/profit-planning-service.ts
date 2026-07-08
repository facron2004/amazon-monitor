import type {
  OwnedProductDailyMetric,
  ProductDataFreshness,
  ProductProfitIssue,
  ProductProfitPlan,
  ProductProfitScenario,
  ProductProfitSetting,
  ProfitPlanLevel
} from "@amazon-monitor/shared";

const DEFAULT_REFERRAL_FEE_RATE = 0.15;
const DEFAULT_RETURN_LOSS_RATE = 0.03;
const DEFAULT_TARGET_MARGIN_RATE = 0.3;
const DEFAULT_MINIMUM_MARGIN_RATE = 0.2;

interface ProfitProduct {
  productId: number;
  orgId: number;
  sku: string;
  asin: string;
  marketplace: string;
  brand: string | null;
  productTitle: string;
  freshness: ProductDataFreshness;
}

export function buildProductProfitPlan(input: {
  product: ProfitProduct;
  metrics: OwnedProductDailyMetric[];
  setting: ProductProfitSetting | null;
  date?: string;
}): ProductProfitPlan {
  const latestMetric = input.metrics[0] ?? null;
  const unitsSold = latestMetric?.unitsSold ?? null;
  const salesAmount = latestMetric?.salesAmount ?? null;
  const averageSellingPrice = inferAverageSellingPrice(salesAmount, unitsSold);
  const adSpend = latestMetric?.adSpend ?? null;
  const adCostPerUnit = inferUnitCost(adSpend, unitsSold);
  const rates = {
    referralFeeRate: input.setting?.referralFeeRate ?? DEFAULT_REFERRAL_FEE_RATE,
    returnLossRate: input.setting?.returnLossRate ?? DEFAULT_RETURN_LOSS_RATE,
    targetMarginRate: input.setting?.targetMarginRate ?? DEFAULT_TARGET_MARGIN_RATE,
    minimumMarginRate: input.setting?.minimumMarginRate ?? DEFAULT_MINIMUM_MARGIN_RATE
  };
  const cost = {
    productCost: sumCosts(input.setting?.purchaseCost, input.setting?.inboundFreight, input.setting?.fbaFee, input.setting?.storageFee),
    adCost: adCostPerUnit,
    dealFee: input.setting?.dealFee ?? null
  };
  const scenarios = buildScenarios(averageSellingPrice, cost, rates);
  const issues = buildIssues({
    latestMetric,
    setting: input.setting,
    averageSellingPrice,
    adSpend,
    salesAmount,
    tacos: latestMetric?.tacos ?? null,
    grossMargin: latestMetric?.grossMargin ?? null,
    scenarios,
    targetMarginRate: rates.targetMarginRate,
    minimumMarginRate: rates.minimumMarginRate
  });
  return {
    ...input.product,
    date: input.date ?? latestMetric?.date ?? null,
    latestMetric,
    setting: input.setting,
    salesAmount,
    unitsSold,
    averageSellingPrice,
    adSpend,
    adCostPerUnit,
    tacos: latestMetric?.tacos ?? null,
    grossMargin: latestMetric?.grossMargin ?? null,
    targetMarginRate: rates.targetMarginRate,
    minimumMarginRate: rates.minimumMarginRate,
    minimumSafePrice: solveSafetyPrice(cost, rates, rates.minimumMarginRate),
    targetMarginPrice: solveSafetyPrice(cost, rates, rates.targetMarginRate),
    scenarios,
    level: deriveLevel(issues),
    issues,
    freshness: latestMetric ? metricFreshness(latestMetric) : input.product.freshness
  };
}

function buildScenarios(
  averageSellingPrice: number | null,
  cost: { productCost: number | null; adCost: number | null; dealFee: number | null },
  rates: { referralFeeRate: number; returnLossRate: number }
): ProductProfitScenario[] {
  return [
    buildScenario("current", "Current price", averageSellingPrice, 0, cost, rates),
    buildScenario("coupon_10", "10% Coupon", averageSellingPrice, 0.1, cost, rates),
    buildScenario("coupon_15", "15% Coupon", averageSellingPrice, 0.15, cost, rates),
    buildScenario("deal", "Deal price", averageSellingPrice, 0.2, cost, rates, cost.dealFee ?? 0)
  ];
}

function buildScenario(
  kind: ProductProfitScenario["kind"],
  label: string,
  averageSellingPrice: number | null,
  discountRate: number,
  cost: { productCost: number | null; adCost: number | null },
  rates: { referralFeeRate: number; returnLossRate: number },
  promoCost = 0
): ProductProfitScenario {
  const price = averageSellingPrice === null ? null : round(averageSellingPrice * (1 - discountRate));
  if (price === null) {
    return emptyScenario(kind, label, discountRate);
  }
  const productCost = cost.productCost ?? 0;
  const platformFees = round(price * (rates.referralFeeRate + rates.returnLossRate));
  const adCost = cost.adCost ?? 0;
  const netProfit = round(price - productCost - platformFees - adCost - promoCost);
  const marginRate = price > 0 ? roundRatio(netProfit / price) : null;
  return {
    kind,
    label,
    price,
    discountRate,
    grossRevenue: price,
    productCost,
    platformFees,
    adCost,
    promoCost,
    netProfit,
    marginRate,
    profitPerUnit: netProfit
  };
}

function buildIssues(input: {
  latestMetric: OwnedProductDailyMetric | null;
  setting: ProductProfitSetting | null;
  averageSellingPrice: number | null;
  adSpend: number | null;
  salesAmount: number | null;
  tacos: number | null;
  grossMargin: number | null;
  scenarios: ProductProfitScenario[];
  targetMarginRate: number;
  minimumMarginRate: number;
}): ProductProfitIssue[] {
  const issues: ProductProfitIssue[] = [];
  if (!input.latestMetric || input.averageSellingPrice === null) {
    issues.push({
      type: "missing_sales",
      priority: "P2",
      label: "Missing sales evidence",
      message: "Sales amount or units sold is missing for the selected evidence date.",
      suggestion: "Import owned SKU sales and units-sold metrics before approving price or promotion decisions.",
      evidence: [`sales=${input.salesAmount ?? "n/a"}`, `average_price=${input.averageSellingPrice ?? "n/a"}`]
    });
  }

  if (!input.setting || input.setting.purchaseCost === null || input.setting.fbaFee === null) {
    issues.push({
      type: "missing_cost",
      priority: "P2",
      label: "Missing cost assumptions",
      message: "Purchase cost or FBA fee is missing, so margin safety lines may be incomplete.",
      suggestion: "Enter SKU cost assumptions before using profit recommendations for action planning.",
      evidence: [`purchase_cost=${input.setting?.purchaseCost ?? "n/a"}`, `fba_fee=${input.setting?.fbaFee ?? "n/a"}`]
    });
  }

  const current = input.scenarios.find((scenario) => scenario.kind === "current");
  if (current?.marginRate !== null && current?.marginRate !== undefined && current.marginRate < input.minimumMarginRate) {
    issues.push({
      type: "below_min_margin",
      priority: "P0",
      label: "Current margin below floor",
      message: `Current estimated margin is ${formatPercent(current.marginRate)}, below the minimum ${formatPercent(input.minimumMarginRate)} floor.`,
      suggestion: "Avoid additional discounts and review cost, price, and Ads spend before approving promotions.",
      evidence: [`current_margin=${formatPercent(current.marginRate)}`, `minimum_margin=${formatPercent(input.minimumMarginRate)}`]
    });
  } else if (input.scenarios.some((scenario) => scenario.kind !== "current" && isBelow(scenario.marginRate, input.minimumMarginRate))) {
    issues.push({
      type: "below_min_margin",
      priority: "P1",
      label: "Promotion margin below floor",
      message: "At least one promotion scenario falls below the minimum margin floor.",
      suggestion: "Use the minimum safe price as the promotion guardrail and keep human approval required.",
      evidence: input.scenarios
        .filter((scenario) => scenario.kind !== "current" && isBelow(scenario.marginRate, input.minimumMarginRate))
        .map((scenario) => `${scenario.kind}=${formatPercent(scenario.marginRate)}`)
    });
  } else if (isBelow(current?.marginRate ?? null, input.targetMarginRate)) {
    issues.push({
      type: "below_target_margin",
      priority: "P1",
      label: "Margin below target",
      message: `Current estimated margin is below the target ${formatPercent(input.targetMarginRate)} margin.`,
      suggestion: "Review price, Ads efficiency, and cost assumptions before increasing traffic or discount depth.",
      evidence: [`current_margin=${formatPercent(current?.marginRate ?? null)}`, `target_margin=${formatPercent(input.targetMarginRate)}`]
    });
  }

  const adRatio = input.tacos ?? inferRatio(input.adSpend, input.salesAmount);
  if (adRatio !== null && adRatio >= 0.25) {
    issues.push({
      type: "ad_cost_pressure",
      priority: "P2",
      label: "Ads cost pressure",
      message: `Ads spend is ${formatPercent(adRatio)} of sales on the latest evidence date.`,
      suggestion: "Check search-term waste and protect only profitable campaigns while margin is under pressure.",
      evidence: [`tacos=${formatPercent(adRatio)}`, `gross_margin=${formatPercent(input.grossMargin)}`]
    });
  }

  return issues;
}

function emptyScenario(kind: ProductProfitScenario["kind"], label: string, discountRate: number): ProductProfitScenario {
  return {
    kind,
    label,
    price: null,
    discountRate,
    grossRevenue: null,
    productCost: null,
    platformFees: null,
    adCost: null,
    promoCost: null,
    netProfit: null,
    marginRate: null,
    profitPerUnit: null
  };
}

function solveSafetyPrice(
  cost: { productCost: number | null; adCost: number | null },
  rates: { referralFeeRate: number; returnLossRate: number },
  marginRate: number
): number | null {
  const denominator = 1 - rates.referralFeeRate - rates.returnLossRate - marginRate;
  if (denominator <= 0) return null;
  return round(((cost.productCost ?? 0) + (cost.adCost ?? 0)) / denominator);
}

function deriveLevel(issues: ProductProfitIssue[]): ProfitPlanLevel {
  if (issues.some((issue) => issue.priority === "P0")) return "risk";
  if (issues.some((issue) => issue.priority === "P1")) return "watch";
  if (issues.some((issue) => issue.type === "missing_sales" || issue.type === "missing_cost")) return "data_gap";
  return "healthy";
}

function inferAverageSellingPrice(salesAmount: number | null | undefined, unitsSold: number | null | undefined): number | null {
  if (salesAmount === null || salesAmount === undefined || unitsSold === null || unitsSold === undefined || unitsSold <= 0) return null;
  return round(salesAmount / unitsSold);
}

function inferUnitCost(total: number | null | undefined, unitsSold: number | null | undefined): number | null {
  if (total === null || total === undefined || unitsSold === null || unitsSold === undefined || unitsSold <= 0) return null;
  return round(total / unitsSold);
}

function sumCosts(...values: Array<number | null | undefined>): number | null {
  if (values.every((value) => value === null || value === undefined)) return null;
  return round(values.reduce<number>((sum, value) => sum + (value ?? 0), 0));
}

function metricFreshness(metric: OwnedProductDailyMetric): ProductDataFreshness {
  return {
    dataSource: metric.dataSource,
    lastSyncedAt: metric.lastSyncedAt,
    syncStatus: metric.syncStatus,
    syncError: metric.syncError
  };
}

function isBelow(value: number | null, threshold: number): boolean {
  return value !== null && value < threshold;
}

function inferRatio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return roundRatio(numerator / denominator);
}

function formatPercent(value: number | null): string {
  if (value === null) return "n/a";
  return `${Math.round(value * 1000) / 10}%`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
