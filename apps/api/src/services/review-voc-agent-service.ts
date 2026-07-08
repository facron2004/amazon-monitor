import type {
  AiActionPriority,
  AiAgentOutput,
  AiRecommendedAction,
  AiReviewVocAnalysisResponse,
  ReviewVocIssue,
  ReviewVocSummary
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { validateAiAgentOutput } from "./ai-agent-service.js";

const REVIEW_VOC_MODEL = "deterministic-review-voc-v1";

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
    confidence
  };
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
    priority: normalizePriority(issue.priority, confidence),
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
    priority: normalizePriority("P2", confidence),
    reason: "No concentrated negative review theme was found in the current window.",
    risk: "Premature optimization may distract from stronger SKU, Ads, or competitor signals.",
    needs_human_approval: true
  };
}

function normalizePriority(priority: AiActionPriority, confidence: number): AiActionPriority {
  if (confidence >= 0.5) return priority;
  if (priority === "P0") return "P1";
  return priority;
}
