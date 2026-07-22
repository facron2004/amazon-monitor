import type {
  AdsWorkflowInsight,
  AdsWorkflowItem,
  AiAdsAnalysisResponse,
  AiAdsOptimizationArtifact,
  AiAgentOutput,
  AiRecommendedAction
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { normalizeAiActionPriority, validateAiAgentOutput } from "./ai-agent-policy.js";

const ADS_ANALYST_MODEL = "deterministic-ads-analyst-v2";

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
      orgId: input.orgId,
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
    orgId: input.orgId,
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
    confidence,
    artifacts: {
      adsOptimization: buildAdsOptimizationArtifact(items, date)
    }
  };
}

function buildAdsOptimizationArtifact(items: AdsWorkflowItem[], date: string): AiAdsOptimizationArtifact {
  const riskItems = items.filter((item) => item.level === "risk" || item.level === "watch");
  const scaleItems = items.filter((item) => item.level === "scale");
  return {
    evidenceDate: date,
    wasteCandidates: riskItems
      .filter((item) => hasInsight(item, "wasted_spend") || hasInsight(item, "acos_high") || hasInsight(item, "spend_spike"))
      .map((item) => ({
        campaign: item.metric.campaignName,
        target: targetLabel(item),
        spend: item.metric.spend,
        sales: item.metric.sales,
        clicks: item.metric.clicks,
        reason: wasteReason(item),
        evidence: item.insights.flatMap((insight) => insight.evidence).filter(Boolean)
      })),
    negativeKeywordSuggestions: buildNegativeSuggestions(riskItems),
    bidAdjustments: [
      ...riskItems
        .filter((item) => hasInsight(item, "wasted_spend") || hasInsight(item, "acos_high") || hasInsight(item, "spend_spike"))
        .map((item) => ({
          target: targetLabel(item),
          campaign: item.metric.campaignName,
          direction: "decrease" as const,
          suggestedChangePercent: hasInsight(item, "wasted_spend") ? 20 : 15,
          reason: wasteReason(item),
          evidence: metricEvidence(item)
        })),
      ...scaleItems.map((item) => ({
        target: targetLabel(item),
        campaign: item.metric.campaignName,
        direction: "increase" as const,
        suggestedChangePercent: 10,
        reason: "Low ACOS, usable conversion evidence, and high budget utilization indicate a controlled scale test.",
        evidence: metricEvidence(item)
      }))
    ],
    budgetAdjustments: [
      ...riskItems
        .filter((item) => hasInsight(item, "wasted_spend") || hasInsight(item, "spend_spike"))
        .map((item) => ({
          campaign: item.metric.campaignName,
          direction: "decrease" as const,
          currentBudget: item.metric.budget,
          suggestedChangePercent: 10,
          reason: "Reduce exposure while search-term quality and conversion evidence are reviewed.",
          guardrails: [
            "Confirm the campaign is not protecting a strategic organic keyword.",
            "Review placement and search-term data before applying the change."
          ]
        })),
      ...scaleItems.map((item) => ({
        campaign: item.metric.campaignName,
        direction: "increase" as const,
        currentBudget: item.metric.budget,
        suggestedChangePercent: 10,
        reason: "Run a bounded budget test because the campaign is efficient and near its budget cap.",
        guardrails: [
          "Confirm inventory coverage and profit margin before scaling.",
          "Recheck ACOS and CVR after the next complete attribution window."
        ]
      }))
    ],
    scaleCandidates: scaleItems.map((item) => ({
      campaign: item.metric.campaignName,
      target: targetLabel(item),
      acos: item.metric.acos,
      cvr: item.metric.cvr,
      budgetUsageRate: item.metric.budgetUsageRate,
      recommendation: "Test a 10% bid or budget increase after inventory and margin approval.",
      evidence: metricEvidence(item)
    })),
    dataGaps: buildAdsDataGaps(items),
    riskNotes: [
      "All bid, budget, and negative-keyword changes require human approval and must not be submitted automatically.",
      "Current bid values are not available in the Ads metric model, so recommendations use bounded percentage changes rather than fabricated bids.",
      "Search-term and placement reports should be reviewed before adding negatives or moving campaign budget."
    ]
  };
}

function buildNegativeSuggestions(items: AdsWorkflowItem[]): AiAdsOptimizationArtifact["negativeKeywordSuggestions"] {
  return items.flatMap((item) => {
    const term = item.metric.searchTerm ?? item.metric.targetText;
    if (!term || (!hasInsight(item, "wasted_spend") && !hasInsight(item, "spend_spike"))) return [];
    const noSales = (item.metric.sales ?? 0) <= 0 && (item.metric.spend ?? 0) > 0;
    return [{
      term,
      matchType: item.metric.searchTerm && noSales ? "exact" as const : "review_only" as const,
      campaign: item.metric.campaignName,
      reason: noSales
        ? "The term has meaningful spend with no attributed sales."
        : "Spend increased without matching sales improvement; inspect query relevance before negating.",
      evidence: metricEvidence(item)
    }];
  });
}

function buildAdsDataGaps(items: AdsWorkflowItem[]): string[] {
  const gaps = ["Current bid values and placement-level performance are unavailable."];
  if (items.length === 0) {
    gaps.push("No Ads daily metrics are available for the selected date.");
    return gaps;
  }
  if (items.some((item) => !item.metric.searchTerm)) {
    gaps.push("Some rows do not include search-term evidence; target-level data alone is insufficient for an automatic negative keyword.");
  }
  if (items.some((item) => item.metric.budget === null)) {
    gaps.push("Some campaigns do not include the current daily budget.");
  }
  return gaps;
}

function hasInsight(item: AdsWorkflowItem, type: AdsWorkflowInsight["type"]): boolean {
  return item.insights.some((insight) => insight.type === type);
}

function targetLabel(item: AdsWorkflowItem): string {
  return item.metric.searchTerm ?? item.metric.targetText ?? item.metric.adGroupName ?? item.metric.campaignName;
}

function wasteReason(item: AdsWorkflowItem): string {
  return item.insights
    .filter((insight) => insight.type === "wasted_spend" || insight.type === "acos_high" || insight.type === "spend_spike")
    .map((insight) => insight.message)
    .join(" ");
}

function metricEvidence(item: AdsWorkflowItem): string[] {
  const metric = item.metric;
  return [
    `spend=${metric.spend?.toFixed(2) ?? "n/a"}`,
    `sales=${metric.sales?.toFixed(2) ?? "n/a"}`,
    `clicks=${metric.clicks ?? "n/a"}`,
    `acos=${metric.acos === null ? "n/a" : `${(metric.acos * 100).toFixed(1)}%`}`,
    `cvr=${metric.cvr === null ? "n/a" : `${(metric.cvr * 100).toFixed(1)}%`}`,
    `budget_usage=${metric.budgetUsageRate === null ? "n/a" : `${(metric.budgetUsageRate * 100).toFixed(1)}%`}`
  ];
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
    priority: normalizeAiActionPriority(insight.priority, confidence),
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
    priority: normalizeAiActionPriority("P2", confidence),
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
