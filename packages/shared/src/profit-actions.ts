import type {
  ProductProfitActionOption,
  ProductProfitPlan,
  ProfitActionKind,
  ProfitScenarioKind
} from "./types-profit.js";

const ACTION_DEFINITIONS: Array<{
  kind: ProfitActionKind;
  label: string;
  scenarioKind?: ProfitScenarioKind;
}> = [
  { kind: "target_margin", label: "目标毛利价" },
  { kind: "coupon_10", label: "10% Coupon", scenarioKind: "coupon_10" },
  { kind: "coupon_15", label: "15% Coupon", scenarioKind: "coupon_15" },
  { kind: "deal", label: "Deal 价格", scenarioKind: "deal" }
];

export function buildProductProfitActionOptions(plan: ProductProfitPlan): ProductProfitActionOption[] {
  return ACTION_DEFINITIONS.map((definition) => {
    const scenario = definition.scenarioKind
      ? plan.scenarios.find((item) => item.kind === definition.scenarioKind)
      : null;
    const price = definition.kind === "target_margin" ? plan.targetMarginPrice : scenario?.price ?? null;
    const marginRate = definition.kind === "target_margin" ? plan.targetMarginRate : scenario?.marginRate ?? null;
    const blockedReasons: string[] = [];

    if (price === null) blockedReasons.push("缺少可执行价格");
    if (marginRate === null) blockedReasons.push("缺少毛利率证据");
    if (plan.minimumSafePrice === null) blockedReasons.push("缺少最低安全价");
    if (
      price !== null
      && plan.minimumSafePrice !== null
      && price + 0.005 < plan.minimumSafePrice
    ) {
      blockedReasons.push("低于最低安全价");
    }
    if (marginRate !== null && marginRate + 0.00005 < plan.minimumMarginRate) {
      blockedReasons.push("低于最低毛利率");
    }

    return {
      kind: definition.kind,
      label: definition.label,
      price,
      marginRate,
      safe: blockedReasons.length === 0,
      blockedReasons
    };
  });
}
