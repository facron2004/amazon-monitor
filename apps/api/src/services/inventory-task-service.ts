import type {
  CreateTaskInput,
  InventoryReplenishmentPlan,
  TaskPriority
} from "@amazon-monitor/shared";

export function inventoryPlanTaskSourceId(plan: InventoryReplenishmentPlan): string {
  const evidenceDate = plan.date ?? "no-date";
  return `inventory-plan:${plan.productId}:${evidenceDate}:${plan.level}`;
}

export function buildInventoryPlanTask(
  plan: InventoryReplenishmentPlan,
  input: { orgId: number; createdBy: number }
): CreateTaskInput {
  const isOverstock = plan.level === "overstock";
  const evidenceDate = plan.date ?? "无可用指标日期";
  const issueEvidence = plan.issues.flatMap((issue) => issue.evidence);
  const evidence = [
    `证据日期：${evidenceDate}`,
    `SKU / ASIN：${plan.sku} / ${plan.asin}`,
    `站点：${plan.marketplace}`,
    `可售库存：${formatMetric(plan.inventoryAvailable, "件")}`,
    `日均销量：${formatMetric(plan.dailySalesVelocity, "件/天")}`,
    `预计可售：${formatMetric(plan.inventoryDays, "天")}`,
    `补货点：${formatMetric(plan.reorderPointUnits, "件")}`,
    `建议数量：${formatMetric(plan.recommendedOrderQuantity, "件")}`,
    `预计断货：${plan.stockoutDate ?? "缺少证据"}`,
    `建议下单日：${plan.reorderByDate ?? "缺少证据"}`,
    `供应商：${plan.setting?.supplierName ?? "未配置"}`,
    ...issueEvidence.map((item) => `信号证据：${item}`)
  ];

  return {
    orgId: input.orgId,
    sourceType: "rule",
    sourceId: inventoryPlanTaskSourceId(plan),
    title: `${isOverstock ? "库存处置" : "补货确认"}：${plan.sku}`,
    description: [
      isOverstock
        ? "请人工确认滞销库存的处置方案，暂停新增补货前先核对销量、活动和广告证据。"
        : "请人工核对供应商交期、在途库存、MOQ/装箱数和现金计划后，再确认采购数量。",
      "",
      ...evidence
    ].join("\n"),
    taskType: "inventory",
    priority: highestPriority(plan),
    assigneeId: null,
    dueDate: plan.reorderByDate,
    relatedAsin: plan.asin,
    relatedKeyword: null,
    relatedBrand: plan.brand,
    relatedCategoryId: null,
    aiRecommendation: isOverstock
      ? "评估降价、Coupon、捆绑或清仓活动，并在人工确认前暂停新增补货；不要自动执行价格或广告调整。"
      : `建议补货 ${formatMetric(plan.recommendedOrderQuantity, "件")}。同时评估是否需要控量、降低广告预算或调整价格；所有采购、价格和广告动作必须人工确认。`,
    createdBy: input.createdBy
  };
}

export function hasActionableInventoryEvidence(plan: InventoryReplenishmentPlan): boolean {
  return plan.issues.some((issue) => issue.type !== "data_gap");
}

function highestPriority(plan: InventoryReplenishmentPlan): TaskPriority {
  if (plan.issues.some((issue) => issue.priority === "P0")) return "P0";
  if (plan.issues.some((issue) => issue.priority === "P1")) return "P1";
  return "P2";
}

function formatMetric(value: number | null, unit: string): string {
  if (value === null) return "缺少证据";
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}
