import type {
  AdsWorkflowItem,
  AdsWorkflowResponse,
  AdsWorkflowSummary,
  ProductProfitPlan,
} from "@amazon-monitor/shared";

export function toAdsSummary(summary: AdsWorkflowSummary): AdsWorkflowResponse {
  return {
    ...summary,
    accessLevel: "summary",
    totalSpend: null,
    totalSales: null,
    items: summary.items.map(toAdsSummaryItem),
  };
}

export function toAdsFull(summary: AdsWorkflowSummary): AdsWorkflowResponse {
  return {
    ...summary,
    accessLevel: "full",
  };
}

export function toProfitSummary(plan: ProductProfitPlan): ProductProfitPlan {
  return {
    ...plan,
    latestMetric: null,
    setting: null,
    salesAmount: null,
    unitsSold: null,
    adSpend: null,
    adCostPerUnit: null,
    tacos: null,
    grossMargin: null,
    scenarios: plan.scenarios.map((scenario) => ({
      ...scenario,
      grossRevenue: null,
      productCost: null,
      platformFees: null,
      adCost: null,
      promoCost: null,
      netProfit: null,
      profitPerUnit: null,
    })),
  };
}

function toAdsSummaryItem(item: AdsWorkflowItem): AdsWorkflowItem {
  return {
    ...item,
    metric: {
      ...item.metric,
      campaignId: `restricted-${item.metric.id}`,
      campaignName: "Restricted campaign",
      adGroupName: null,
      targetText: null,
      searchTerm: null,
      matchType: null,
      impressions: null,
      clicks: null,
      spend: null,
      sales: null,
      orders: null,
      unitsSold: null,
      roas: null,
      cpc: null,
      ctr: null,
      cvr: null,
      budget: null,
      budgetUsageRate: null,
      syncError: null,
    },
    productSku: null,
    productAsin: null,
    efficiencyScore: 0,
    wasteScore: 0,
    scaleScore: 0,
    insights: item.insights.map((insight) => ({
      ...insight,
      message: "A threshold-based Ads signal needs review by the Ads owner.",
      evidence: [],
    })),
  };
}
