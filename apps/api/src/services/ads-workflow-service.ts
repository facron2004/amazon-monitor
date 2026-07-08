import type { AdDailyMetric, AdsWorkflowInsight, AdsWorkflowItem, AdsWorkflowLevel } from "@amazon-monitor/shared";

const TARGET_ACOS = 0.3;
const SCALE_ACOS = 0.18;
const MIN_MEANINGFUL_SPEND = 20;
const BUDGET_NEAR_CAP = 0.9;
const SPEND_SPIKE_RATIO = 1.3;

export interface AdsMetricHistoryContext {
  spend7dAvg: number | null;
  sales7dAvg: number | null;
}

export function buildAdsWorkflowItem(
  metric: AdDailyMetric,
  product: { sku: string; asin: string } | null,
  history?: AdsMetricHistoryContext
): AdsWorkflowItem {
  const insights = buildAdsInsights(metric, history);
  const wasteScore = scoreWaste(metric, insights);
  const scaleScore = scoreScale(metric, insights);
  const efficiencyScore = Math.max(0, Math.min(100, 100 - wasteScore + Math.round(scaleScore / 3)));
  return {
    metric,
    productSku: product?.sku ?? null,
    productAsin: product?.asin ?? null,
    level: deriveLevel(insights),
    efficiencyScore,
    wasteScore,
    scaleScore,
    insights
  };
}

function buildAdsInsights(metric: AdDailyMetric, history?: AdsMetricHistoryContext): AdsWorkflowInsight[] {
  const insights: AdsWorkflowInsight[] = [];
  const spend = metric.spend ?? 0;
  const sales = metric.sales ?? 0;
  const acos = metric.acos ?? (sales > 0 ? spend / sales : null);
  const cvr = metric.cvr ?? inferRate(metric.orders, metric.clicks);

  if (spend > 0 && sales <= 0 && spend >= MIN_MEANINGFUL_SPEND) {
    insights.push({
      type: "wasted_spend",
      priority: "P0",
      label: "Spend without sales",
      message: `Spend is ${spend.toFixed(2)} with no attributed sales.`,
      suggestion: "Check search terms, add negatives, and reduce bids or budget until conversion evidence improves.",
      evidence: [`spend=${spend.toFixed(2)}`, "sales=0"]
    });
  }

  if (acos !== null && acos >= TARGET_ACOS * 1.3) {
    insights.push({
      type: "acos_high",
      priority: acos >= TARGET_ACOS * 1.8 ? "P0" : "P1",
      label: "ACOS above target",
      message: `ACOS ${(acos * 100).toFixed(1)}% is above the 30% target buffer.`,
      suggestion: "Lower bids, review query quality, and move budget toward higher-converting campaigns.",
      evidence: [`acos=${(acos * 100).toFixed(1)}%`, "target=30%"]
    });
  }

  if (isSpendSpike(spend, sales, history)) {
    insights.push({
      type: "spend_spike",
      priority: "P1",
      label: "Spend spike without sales lift",
      message: "Spend is up at least 30% versus the 7-day average while sales are not improving.",
      suggestion: "Inspect search terms, add negatives, lower weak bids, or move budget to steadier targets.",
      evidence: [
        `spend=${spend.toFixed(2)}`,
        `avg_7d_spend=${history?.spend7dAvg?.toFixed(2) ?? "n/a"}`,
        `avg_7d_sales=${history?.sales7dAvg?.toFixed(2) ?? "n/a"}`
      ]
    });
  }

  if (metric.budgetUsageRate !== null && metric.budgetUsageRate !== undefined && metric.budgetUsageRate >= BUDGET_NEAR_CAP && acos !== null && acos <= SCALE_ACOS && (cvr ?? 0) >= 0.08) {
    insights.push({
      type: "scale_opportunity",
      priority: "P1",
      label: "Budget-constrained scale opportunity",
      message: `Budget usage ${(metric.budgetUsageRate * 100).toFixed(1)}% with ACOS ${(acos * 100).toFixed(1)}%.`,
      suggestion: "Consider raising budget or bids after checking inventory and margin safety.",
      evidence: [`budget_usage=${(metric.budgetUsageRate * 100).toFixed(1)}%`, `cvr=${((cvr ?? 0) * 100).toFixed(1)}%`]
    });
  }

  if (insights.length === 0 && metric.clicks === null && metric.spend === null) {
    insights.push({
      type: "data_gap",
      priority: "P2",
      label: "Missing ads evidence",
      message: "Clicks and spend are not available for this row.",
      suggestion: "Import the Amazon Ads daily report before making budget decisions.",
      evidence: ["clicks missing", "spend missing"]
    });
  }

  return insights;
}

function isSpendSpike(spend: number, sales: number, history: AdsMetricHistoryContext | undefined): boolean {
  if (!history || history.spend7dAvg === null || history.spend7dAvg < MIN_MEANINGFUL_SPEND) return false;
  const spendSpiked = spend >= history.spend7dAvg * SPEND_SPIKE_RATIO;
  const salesNotImproving = history.sales7dAvg === null || sales <= history.sales7dAvg;
  return spendSpiked && salesNotImproving;
}

function deriveLevel(insights: AdsWorkflowInsight[]): AdsWorkflowLevel {
  if (insights.some((insight) => insight.priority === "P0")) return "risk";
  if (insights.some((insight) => insight.type === "scale_opportunity")) return "scale";
  if (insights.length > 0) return "watch";
  return "healthy";
}

function scoreWaste(metric: AdDailyMetric, insights: AdsWorkflowInsight[]): number {
  let score = insights.some((insight) => insight.type === "wasted_spend") ? 70 : 0;
  const acos = metric.acos ?? ((metric.spend ?? 0) > 0 && (metric.sales ?? 0) > 0 ? (metric.spend ?? 0) / (metric.sales ?? 1) : null);
  if (acos !== null && acos > TARGET_ACOS) {
    score += Math.min(30, Math.round((acos - TARGET_ACOS) * 100));
  }
  return Math.min(100, score);
}

function scoreScale(metric: AdDailyMetric, insights: AdsWorkflowInsight[]): number {
  if (!insights.some((insight) => insight.type === "scale_opportunity")) return 0;
  const usage = metric.budgetUsageRate ?? 0;
  return Math.min(100, 60 + Math.round(usage * 40));
}

function inferRate(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}
