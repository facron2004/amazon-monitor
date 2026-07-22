import type {
  CreateTaskInput,
  InventoryReplenishmentPlan,
  ProductProfitActionOption,
  ProductProfitPlan,
  TaskPriority
} from "@amazon-monitor/shared";

export function profitActionTaskSourceId(
  plan: ProductProfitPlan,
  option: ProductProfitActionOption
): string {
  return `profit-plan:${plan.productId}:${plan.date ?? "no-date"}:${option.kind}`;
}

export function buildProfitActionTask(
  plan: ProductProfitPlan,
  option: ProductProfitActionOption,
  inventoryPlan: InventoryReplenishmentPlan | null,
  input: { orgId: number; createdBy: number }
): CreateTaskInput {
  const isPromotion = option.kind !== "target_margin";
  const inventoryEvidence = inventoryPlan
    ? `${formatNumber(inventoryPlan.inventoryDays, "天")} · ${inventoryPlan.level}`
    : "缺少库存计划";
  const competitorEvidence = "未建立我方 SKU 与可比竞品到手价的可靠映射，执行前必须人工补证";
  const currency = marketplaceCurrency(plan.marketplace);

  return {
    orgId: input.orgId,
    sourceType: "rule",
    sourceId: profitActionTaskSourceId(plan, option),
    title: `${isPromotion ? "促销价格评审" : "价格调整评审"}：${plan.sku} · ${option.label}`,
    description: [
      "请在 Seller Central 或活动后台执行前完成价格、库存、广告和竞品证据复核。",
      "",
      `证据日期：${plan.date ?? "缺少证据"}`,
      `SKU / ASIN：${plan.sku} / ${plan.asin}`,
      `站点：${plan.marketplace}`,
      `当前均价：${formatMoney(plan.averageSellingPrice, currency)}`,
      `拟执行价格：${formatMoney(option.price, currency)}`,
      `拟执行毛利率：${formatPercent(option.marginRate)}`,
      `最低安全价：${formatMoney(plan.minimumSafePrice, currency)}`,
      `最低毛利率：${formatPercent(plan.minimumMarginRate)}`,
      `目标毛利价：${formatMoney(plan.targetMarginPrice, currency)}`,
      `广告成本/件：${formatMoney(plan.adCostPerUnit, currency)}`,
      `TACOS：${formatPercent(plan.tacos)}`,
      `库存证据：${inventoryEvidence}`,
      `竞品证据缺口：${competitorEvidence}`,
      "",
      "执行边界：该任务仅记录建议，不会自动改价、创建 Coupon/Deal 或修改广告预算。"
    ].join("\n"),
    taskType: isPromotion ? "coupon" : "price",
    priority: highestPriority(plan),
    assigneeId: null,
    dueDate: plan.date,
    relatedAsin: plan.asin,
    relatedKeyword: null,
    relatedBrand: plan.brand,
    relatedCategoryId: null,
    aiRecommendation: isPromotion
      ? `可评审 ${option.label}，拟执行价格 ${formatMoney(option.price, currency)}、毛利率 ${formatPercent(option.marginRate)}。补齐竞品到手价并确认库存与广告策略后，再人工执行。`
      : `可评审调整至目标毛利价 ${formatMoney(option.price, currency)}。补齐竞品到手价并确认库存与广告策略后，再人工执行。`,
    createdBy: input.createdBy
  };
}

function highestPriority(plan: ProductProfitPlan): TaskPriority {
  if (plan.issues.some((issue) => issue.priority === "P0")) return "P0";
  if (plan.issues.some((issue) => issue.priority === "P1")) return "P1";
  return "P2";
}

function marketplaceCurrency(marketplace: string): string {
  const normalized = marketplace.toUpperCase();
  if (normalized.includes("UK") || normalized.includes("CO.UK")) return "£";
  if (normalized.includes("DE")) return "€";
  if (normalized.includes("JP")) return "¥";
  return "$";
}

function formatMoney(value: number | null, currency: string): string {
  if (value === null) return "缺少证据";
  return `${currency}${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value)}`;
}

function formatNumber(value: number | null, unit: string): string {
  if (value === null) return "缺少证据";
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "缺少证据";
  return `${Math.round(value * 1000) / 10}%`;
}
