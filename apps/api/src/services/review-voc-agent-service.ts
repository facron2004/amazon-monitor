import type {
  AiAgentOutput,
  AiRecommendedAction,
  AiReviewVocArtifact,
  AiReviewVocAnalysisResponse,
  ReviewVocIssue,
  ReviewVocSummary
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { normalizeAiActionPriority, validateAiAgentOutput } from "./ai-agent-policy.js";

const REVIEW_VOC_MODEL = "deterministic-review-voc-v2";

interface ReviewVocAnalysisInput {
  date: string;
  orgId: number;
  productId: number;
}

export function analyzeReviewVoc(store: Store, input: ReviewVocAnalysisInput): AiReviewVocAnalysisResponse {
  const summary = store.getReviewVocSummary(input.productId, {
    orgId: input.orgId,
    date: input.date
  });
  if (!summary) {
    throw Object.assign(new Error("Review VOC summary not found"), { statusCode: 404 });
  }
  const confidence = summary.reviewCount === 0 ? 0.35 : Math.min(0.82, 0.55 + summary.reviewCount * 0.03);
  const output = buildReviewVocOutput(summary, confidence);
  const validationErrors = validateAiAgentOutput(output);
  const inputContextJson = JSON.stringify({
    date: input.date,
    orgId: input.orgId,
    productId: input.productId,
    reviewCount: summary.reviewCount,
    negativeCount: summary.negativeCount,
    generatedAt: new Date().toISOString()
  });

  if (validationErrors.length > 0) {
    store.createAiRun({
      orgId: input.orgId,
      agentType: "review_voc",
      inputContextJson,
      output: null,
      model: REVIEW_VOC_MODEL,
      status: "failed",
      errorMessage: validationErrors.join("; ")
    });
    throw Object.assign(new Error(`Invalid AI Agent output: ${validationErrors.join("; ")}`), { statusCode: 500 });
  }

  const run = store.createAiRun({
    orgId: input.orgId,
    agentType: "review_voc",
    inputContextJson,
    output,
    model: REVIEW_VOC_MODEL,
    status: "success",
    tokenUsage: null,
    errorMessage: null
  });
  return { date: input.date, productId: input.productId, output, run, summary };
}

function buildReviewVocOutput(summary: ReviewVocSummary, confidence: number): AiAgentOutput {
  const evidence = buildEvidence(summary);
  const actions = summary.issues.map((issue) => actionFromIssue(summary, issue, confidence)).slice(0, 5);
  return {
    summary: `${summary.sku}: ${summary.reviewCount} recent reviews, ${summary.negativeCount} negative, average rating ${summary.averageRating?.toFixed(1) ?? "n/a"}.`,
    evidence,
    impact: buildImpact(summary),
    recommended_actions: actions.length > 0 ? actions : [fallbackAction(summary, confidence)],
    confidence,
    artifacts: {
      reviewVoc: buildReviewVocArtifact(summary, confidence)
    }
  };
}

function buildReviewVocArtifact(summary: ReviewVocSummary, confidence: number): AiReviewVocArtifact {
  const negativeTopics = summary.topTopics.filter((topic) => topic.negativeCount > 0);
  return {
    negativeSummary: negativeTopics.length > 0
      ? negativeTopics.slice(0, 5).map((topic) => (
          `${topic.topic}: ${topic.negativeCount} negative / ${topic.mentionCount} mentions`
        ))
      : ["No concentrated negative topic is available in the current review window."],
    supplierActions: buildSupplierActions(summary, confidence),
    listingRecommendations: buildListingRecommendations(summary),
    supportDrafts: buildSupportDrafts(summary),
    productOpportunities: buildProductOpportunities(summary),
    competitorPainComparison: buildCompetitorComparison(summary),
    customerLanguage: summary.recentReviews.slice(0, 5).map((review) => ({
      phrase: review.title,
      sentiment: review.sentiment,
      safeUse: review.sentiment === "positive"
        ? "Use as a theme reference only after verifying the underlying product claim."
        : "Use to frame an objection, FAQ, or validation task; do not present it as a product benefit.",
      evidenceReviewId: review.id
    })),
    riskNotes: [
      "Human review is required before changing product specifications, supplier requirements, Listing copy, or customer-service policy.",
      "Review language indicates symptoms, not confirmed root causes; validate against QA, returns, support tickets, and batch evidence.",
      "Competitor pain comparison remains incomplete until competitor Review evidence is imported."
    ]
  };
}

function buildSupplierActions(summary: ReviewVocSummary, confidence: number): AiReviewVocArtifact["supplierActions"] {
  const actions = summary.topTopics
    .filter((topic) => topic.negativeCount > 0)
    .slice(0, 5)
    .map((topic) => ({
      topic: topic.topic,
      priority: normalizeAiActionPriority(topic.negativeCount >= 4 ? "P0" : "P1", confidence),
      action: supplierActionForTopic(topic.topic),
      evidence: `${topic.negativeCount} negative / ${topic.mentionCount} mentions; review ids ${topic.sampleReviewIds.join(", ")}`
    }));
  return actions.length > 0 ? actions : [{
    topic: "data_gap",
    priority: "P2",
    action: "Collect more Review, return, QA, and support evidence before issuing a supplier corrective-action request.",
    evidence: `Current review count: ${summary.reviewCount}`
  }];
}

function buildListingRecommendations(summary: ReviewVocSummary): string[] {
  const recommendations = summary.topTopics
    .filter((topic) => topic.mentionCount > 0)
    .slice(0, 5)
    .map((topic) => listingRecommendationForTopic(topic.topic));
  return recommendations.length > 0
    ? recommendations
    : ["Import Review text and map buyer questions before changing Listing claims."];
}

function buildSupportDrafts(summary: ReviewVocSummary): AiReviewVocArtifact["supportDrafts"] {
  const drafts = summary.topTopics
    .filter((topic) => topic.negativeCount > 0)
    .slice(0, 3)
    .map((topic) => ({
      scenario: `${topic.topic} complaint`,
      responseTemplate: supportTemplateForTopic(topic.topic),
      evidence: `${topic.negativeCount} negative mentions in the current ${summary.windowDays}-day window`
    }));
  return drafts.length > 0 ? drafts : [{
    scenario: "Insufficient VOC evidence",
    responseTemplate: "Thank the customer, ask for the exact symptom and order context, and route the case through the approved support policy.",
    evidence: `Current review count: ${summary.reviewCount}`
  }];
}

function buildProductOpportunities(summary: ReviewVocSummary): AiReviewVocArtifact["productOpportunities"] {
  const opportunities = summary.topTopics
    .filter((topic) => topic.negativeCount > 0)
    .slice(0, 4)
    .map((topic) => ({
      opportunity: productOpportunityForTopic(topic.topic),
      evidence: `${topic.negativeCount} negative / ${topic.mentionCount} mentions`,
      validationNeeded: "Confirm demand frequency, technical feasibility, cost impact, and whether the complaint is a product, usage, shipping, or support issue."
    }));
  return opportunities.length > 0 ? opportunities : [{
    opportunity: "No evidence-backed product opportunity is available yet.",
    evidence: `Current review count: ${summary.reviewCount}`,
    validationNeeded: "Collect a larger Review sample and compare it with returns, support tickets, and competitor evidence."
  }];
}

function buildCompetitorComparison(summary: ReviewVocSummary): AiReviewVocArtifact["competitorPainComparison"] {
  const rows = summary.topTopics.slice(0, 5).map((topic) => ({
    topic: topic.topic,
    ownProductEvidence: `${topic.negativeCount} negative / ${topic.mentionCount} mentions`,
    competitorEvidence: null,
    conclusion: "Competitor Review evidence is unavailable; do not claim relative advantage or disadvantage."
  }));
  return rows.length > 0 ? rows : [{
    topic: "data_gap",
    ownProductEvidence: "No current Review topic evidence.",
    competitorEvidence: null,
    conclusion: "Import own-product and competitor Review evidence before creating a pain-point comparison."
  }];
}

function supplierActionForTopic(topic: string): string {
  const actions: Record<string, string> = {
    quality: "Request batch-level defect checks, failure-mode evidence, and corrective/preventive action ownership.",
    noise: "Verify noise measurements, component tolerances, and abnormal-noise failure conditions by batch.",
    cleaning: "Validate cleanability, residue/odor causes, cleaning instructions, and packaging quick-start guidance.",
    shipping: "Audit packaging protection, carrier damage patterns, and incoming inspection evidence.",
    support: "Review warranty, return, replacement, and response-time evidence with the support owner."
  };
  return actions[topic] ?? `Investigate the ${topic} complaint cluster and assign a verified corrective-action owner.`;
}

function listingRecommendationForTopic(topic: string): string {
  const recommendations: Record<string, string> = {
    quality: "Clarify verified durability, operating limits, and troubleshooting steps without making unsupported reliability claims.",
    noise: "Set evidence-backed noise expectations and explain normal versus abnormal operating sounds.",
    cleaning: "Add verified cleaning steps, maintenance frequency, and residue/odor prevention guidance.",
    shipping: "Show included components and post-delivery inspection steps; do not present logistics damage as a product feature.",
    support: "Clarify approved warranty and support channels using the current service policy."
  };
  return recommendations[topic] ?? `Address the ${topic} buyer concern using verified product or operating evidence.`;
}

function supportTemplateForTopic(topic: string): string {
  return `Thank the customer for reporting the ${topic} issue. Confirm the exact symptom, usage context, and order or batch details, then provide only verified troubleshooting and remedies allowed by the approved support policy.`;
}

function productOpportunityForTopic(topic: string): string {
  const opportunities: Record<string, string> = {
    quality: "Reduce the observed failure mode or improve early defect detection.",
    noise: "Explore lower-noise operation or clearer normal-noise feedback.",
    cleaning: "Reduce cleaning effort and make maintenance steps easier to understand.",
    shipping: "Improve packaging protection and damage visibility.",
    support: "Improve self-service diagnostics and support handoff clarity."
  };
  return opportunities[topic] ?? `Investigate whether ${topic} represents a repeatable unmet product need.`;
}

function buildEvidence(summary: ReviewVocSummary): string[] {
  const evidence = summary.issues.length > 0
    ? summary.issues.slice(0, 5).map((issue) => `${issue.label}: ${issue.message}`)
    : [`${summary.sku} has no blocking VOC issue in the current review window.`];
  for (const topic of summary.topTopics.slice(0, 3)) {
    evidence.push(`${topic.topic}: ${topic.negativeCount} negative / ${topic.mentionCount} mentions.`);
  }
  return evidence;
}

function buildImpact(summary: ReviewVocSummary): string {
  if (summary.level === "risk") {
    return "Recent review language can hurt conversion, rating trust, and Listing claim credibility if not investigated.";
  }
  if (summary.level === "watch") {
    return "VOC should be reviewed before product, support, or Listing changes, but current evidence is not yet urgent.";
  }
  return "Review VOC is stable enough for monitoring; no high-risk action is indicated from current evidence.";
}

function actionFromIssue(
  summary: ReviewVocSummary,
  issue: ReviewVocIssue,
  confidence: number
): AiRecommendedAction {
  return {
    action: `${issue.suggestion} (${summary.sku})`,
    priority: normalizeAiActionPriority(issue.priority, confidence),
    reason: issue.message,
    risk: issue.type === "data_gap"
      ? "VOC decisions without review evidence may target the wrong buyer pain point."
      : "Changing Listing claims or support scripts without validating root cause can worsen buyer trust.",
    needs_human_approval: true
  };
}

function fallbackAction(summary: ReviewVocSummary, confidence: number): AiRecommendedAction {
  return {
    action: `Keep monitoring Review VOC for ${summary.sku} and refresh review evidence after the next import`,
    priority: normalizeAiActionPriority("P2", confidence),
    reason: "No concentrated negative review theme was found in the current window.",
    risk: "Premature optimization may distract from stronger SKU, Ads, or competitor signals.",
    needs_human_approval: true
  };
}
