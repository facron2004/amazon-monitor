import type {
  AdsWorkflowInsight,
  AdsWorkflowItem,
  AiActionPriority,
  AiAdsAnalysisResponse,
  AiAgentOutput,
  AiRecommendedAction
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { validateAiAgentOutput } from "./ai-agent-service.js";

const ADS_ANALYST_MODEL = "deterministic-ads-analyst-v1";

interface AdsAnalysisInput {
  date: string;
  orgId: number;
}

export function analyzeAds(store: Store, input: AdsAnalysisInput): AiAdsAnalysisResponse {
  const summary = store.getAdsWorkflowSummary({
    orgId: input.orgId,
    date: input.date,
    limit: 200
  });
  const confidence = summary.items.length === 0 ? 0.35 : 0.72;
  const output = buildAdsAnalystOutput(summary.items, input.date, confidence);
  const validationErrors = validateAiAgentOutput(output);
  const inputContextJson = JSON.stringify({
    date: input.date,
    orgId: input.orgId,
    itemCount: summary.items.length,
    riskCount: summary.riskCount,
    scaleCount: summary.scaleCount,
    generatedAt: new Date().toISOString()
  });

  if (validationErrors.length > 0) {
    store.createAiRun({
      agentType: "ads_analyst",
      inputContextJson,
      output: null,
      model: ADS_ANALYST_MODEL,
      status: "failed",
      errorMessage: validationErrors.join("; ")
    });
    throw Object.assign(new Error(`Invalid AI Agent output: ${validationErrors.join("; ")}`), { statusCode: 500 });
  }

  const run = store.createAiRun({
    agentType: "ads_analyst",
    inputContextJson,
    output,
    model: ADS_ANALYST_MODEL,
    status: "success",
    tokenUsage: null,
    errorMessage: null
  });
  return { date: input.date, output, run, summary };
}

function buildAdsAnalystOutput(items: AdsWorkflowItem[], date: string, confidence: number): AiAgentOutput {
  const prioritizedItems = prioritizeItems(items);
  const evidence = prioritizedItems.length > 0
    ? prioritizedItems.slice(0, 5).map(itemEvidence)
    : [`${date}: no Ads daily metrics are available for analysis.`];
  const recommendedActions = prioritizedItems.flatMap((item) => actionsFromItem(item, confidence)).slice(0, 5);

  return {
    summary: buildSummary(items, date),
    evidence,
    impact: buildImpact(items),
    recommended_actions: recommendedActions.length > 0
      ? recommendedActions
      : [fallbackAction(confidence)],
    confidence
  };
}

function prioritizeItems(items: AdsWorkflowItem[]): AdsWorkflowItem[] {
  return [...items].sort((left, right) => {
    if (left.level === "risk" && right.level !== "risk") return -1;
    if (right.level === "risk" && left.level !== "risk") return 1;
    if (left.level === "scale" && right.level !== "scale") return -1;
    if (right.level === "scale" && left.level !== "scale") return 1;
    return Math.max(right.wasteScore, right.scaleScore) - Math.max(left.wasteScore, left.scaleScore);
  });
}

function buildSummary(items: AdsWorkflowItem[], date: string): string {
  if (items.length === 0) {
    return `${date}: no Ads metrics were found, so spend waste and scale opportunities cannot be diagnosed yet.`;
  }
  const riskCount = items.filter((item) => item.level === "risk").length;
  const scaleCount = items.filter((item) => item.level === "scale").length;
  return `${date}: ${items.length} Ads targets reviewed, with ${riskCount} risk items and ${scaleCount} scale opportunities.`;
}

function buildImpact(items: AdsWorkflowItem[]): string {
  if (items.some((item) => item.level === "risk")) {
    return "Unchecked Ads waste can drain budget from profitable campaigns or hide conversion issues that need search-term review.";
  }
  if (items.some((item) => item.level === "scale")) {
    return "Profitable campaigns may be budget constrained, creating a controlled opportunity to grow orders after operator review.";
  }
  return "Current Ads evidence is not urgent; continue monitoring before changing bids, budgets, or negatives.";
}

function actionsFromItem(item: AdsWorkflowItem, confidence: number): AiRecommendedAction[] {
  return item.insights.slice(0, 2).map((insight) => actionFromInsight(item, insight, confidence));
}

function actionFromInsight(
  item: AdsWorkflowItem,
  insight: AdsWorkflowInsight,
  confidence: number
): AiRecommendedAction {
  return {
    action: `${insight.suggestion} (${itemLabel(item)})`,
    priority: normalizePriority(insight.priority, confidence),
    reason: insight.message,
    risk: insight.type === "scale_opportunity"
      ? "Scaling too quickly can worsen ACOS if conversion or inventory constraints change."
      : "Bid, budget, or negative-keyword changes can reduce volume if the evidence is misread.",
    needs_human_approval: true
  };
}

function fallbackAction(confidence: number): AiRecommendedAction {
  return {
    action: "Import Ads daily metrics before changing bids, budgets, or negative keywords",
    priority: normalizePriority("P2", confidence),
    reason: "The Ads Analyst does not have enough spend, sales, click, or conversion evidence yet.",
    risk: "Acting without fresh Ads data can cut profitable traffic or scale unprofitable spend.",
    needs_human_approval: true
  };
}

function itemEvidence(item: AdsWorkflowItem): string {
  const metric = item.metric;
  const acos = metric.acos == null ? "n/a" : `${Math.round(metric.acos * 100)}%`;
  const spend = metric.spend == null ? "n/a" : metric.spend.toFixed(2);
  const sales = metric.sales == null ? "n/a" : metric.sales.toFixed(2);
  return `${itemLabel(item)}: ${item.level}, spend ${spend}, sales ${sales}, ACOS ${acos}.`;
}

function itemLabel(item: AdsWorkflowItem): string {
  const metric = item.metric;
  return item.productSku ?? item.productAsin ?? metric.targetText ?? metric.searchTerm ?? metric.campaignName;
}

function normalizePriority(priority: AiActionPriority, confidence: number): AiActionPriority {
  if (confidence >= 0.5) return priority;
  if (priority === "P0") return "P1";
  return priority;
}
