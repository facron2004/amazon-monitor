import type {
  AiActionPriority,
  AiAgentOutput,
  AiDailyBriefResponse,
  AiListingAnalysisResponse,
  AiRecommendedAction,
  InsightEvent,
  ListingHealthIssue,
  OwnedProductListItem,
  Task
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";

const DAILY_OPERATOR_MODEL = "deterministic-daily-operator-v1";
const LISTING_OPTIMIZER_MODEL = "deterministic-listing-optimizer-v1";
const OPEN_TASK_STATUSES: Task["status"][] = ["pending", "in_progress", "awaiting_review"];

interface DailyBriefInput {
  date: string;
  orgId: number;
}

export function generateDailyBrief(store: Store, input: DailyBriefInput): AiDailyBriefResponse {
  const topEvents = store.listTopInsights(input.date, 5);
  const openTasks = store
    .listTasks({ statusIn: OPEN_TASK_STATUSES, limit: 100 })
    .filter((task) => task.orgId === input.orgId);
  const products = store.listProducts({ orgId: input.orgId, status: "active", date: input.date, limit: 100 });
  const highRiskProducts = products
    .filter((product) => product.riskScore.level !== "low")
    .sort((left, right) => right.riskScore.score - left.riskScore.score)
    .slice(0, 5);
  const confidence = calculateConfidence(topEvents, products, openTasks);
  const output = buildDailyOperatorOutput({
    date: input.date,
    topEvents,
    openTasks,
    highRiskProducts,
    confidence
  });
  const validationErrors = validateAiAgentOutput(output);
  const inputContextJson = JSON.stringify({
    date: input.date,
    orgId: input.orgId,
    topEventIds: topEvents.map((event) => event.id),
    openTaskCount: openTasks.length,
    highRiskProductIds: highRiskProducts.map((product) => product.id),
    generatedAt: new Date().toISOString()
  });

  if (validationErrors.length > 0) {
    store.createAiRun({
      agentType: "daily_operator",
      inputContextJson,
      output: null,
      model: DAILY_OPERATOR_MODEL,
      status: "failed",
      errorMessage: validationErrors.join("; ")
    });
    throw Object.assign(new Error(`Invalid AI Agent output: ${validationErrors.join("; ")}`), { statusCode: 500 });
  }

  const run = store.createAiRun({
    agentType: "daily_operator",
    inputContextJson,
    output,
    model: DAILY_OPERATOR_MODEL,
    status: "success",
    tokenUsage: null,
    errorMessage: null
  });
  return { date: input.date, output, run, topEvents };
}

export function analyzeListing(store: Store, input: { productId: number; orgId: number; date: string }): AiListingAnalysisResponse {
  const listingHealth = store.getProductListingHealth(input.productId, input.date);
  if (!listingHealth || listingHealth.orgId !== input.orgId) {
    throw Object.assign(new Error("Listing health item not found"), { statusCode: 404 });
  }
  const confidence = listingHealth.snapshotId === null ? 0.35 : 0.7;
  const output = buildListingOptimizerOutput(listingHealth, confidence);
  const validationErrors = validateAiAgentOutput(output);
  const inputContextJson = JSON.stringify({
    date: input.date,
    orgId: input.orgId,
    productId: input.productId,
    snapshotId: listingHealth.snapshotId,
    healthScore: listingHealth.health.score,
    generatedAt: new Date().toISOString()
  });
  if (validationErrors.length > 0) {
    store.createAiRun({
      agentType: "listing_optimizer",
      inputContextJson,
      output: null,
      model: LISTING_OPTIMIZER_MODEL,
      status: "failed",
      errorMessage: validationErrors.join("; ")
    });
    throw Object.assign(new Error(`Invalid AI Agent output: ${validationErrors.join("; ")}`), { statusCode: 500 });
  }
  const run = store.createAiRun({
    agentType: "listing_optimizer",
    inputContextJson,
    output,
    model: LISTING_OPTIMIZER_MODEL,
    status: "success",
    tokenUsage: null,
    errorMessage: null
  });
  return { date: input.date, productId: input.productId, output, run, listingHealth };
}

function buildListingOptimizerOutput(
  listingHealth: AiListingAnalysisResponse["listingHealth"],
  confidence: number
): AiAgentOutput {
  const issues = listingHealth.health.issues.slice(0, 5);
  const evidence = issues.length > 0
    ? issues.map((issue) => `${issue.label}: ${issue.message}`)
    : listingHealth.health.strengths;
  return {
    summary: `Listing health score is ${listingHealth.health.score}/100 for ${listingHealth.sku}.`,
    evidence,
    impact: listingHealth.health.level === "risk"
      ? "Listing quality may suppress conversion or prevent Review/Q&A learnings from improving buyer confidence."
      : "Listing is usable, but targeted improvements can still improve keyword coverage and buyer objection handling.",
    recommended_actions: issues.length > 0
      ? issues.map((issue) => actionFromListingIssue(issue, listingHealth.health.score, confidence))
      : [{
          action: "Keep current Listing under watch and refresh evidence after the next Review/keyword update",
          priority: "P2",
          reason: "No blocking Listing health issues were found from the current evidence.",
          risk: "Optimization may be unnecessary until new evidence changes.",
          needs_human_approval: true
        }],
    confidence
  };
}

function buildDailyOperatorOutput(input: {
  date: string;
  topEvents: InsightEvent[];
  openTasks: Task[];
  highRiskProducts: OwnedProductListItem[];
  confidence: number;
}): AiAgentOutput {
  const evidence = buildEvidence(input);
  const recommendedActions = [
    ...input.topEvents.map((event) => actionFromEvent(event, input.confidence)),
    ...input.highRiskProducts.map((product) => actionFromProduct(product, input.confidence)),
    ...buildTaskActions(input.openTasks, input.confidence)
  ].slice(0, 5);

  return {
    summary: buildSummary(input),
    evidence,
    impact: buildImpact(input),
    recommended_actions: recommendedActions.length > 0
      ? recommendedActions
      : [fallbackAction(input.confidence)],
    confidence: input.confidence
  };
}

function buildSummary(input: {
  date: string;
  topEvents: InsightEvent[];
  openTasks: Task[];
  highRiskProducts: OwnedProductListItem[];
}): string {
  if (input.topEvents.length === 0 && input.highRiskProducts.length === 0) {
    return `${input.date}: no high-priority insight events or SKU risk signals are available yet.`;
  }
  const p0Count = input.topEvents.filter((event) => event.eventLevel === "P0").length;
  return `${input.date}: ${input.topEvents.length} priority insight signals, ${p0Count} P0 signals, ${input.highRiskProducts.length} SKU risk signals, and ${input.openTasks.length} open workflow tasks need operator review.`;
}

function buildImpact(input: {
  topEvents: InsightEvent[];
  openTasks: Task[];
  highRiskProducts: OwnedProductListItem[];
}): string {
  const p0Count = input.topEvents.filter((event) => event.eventLevel === "P0").length;
  const highRiskCount = input.highRiskProducts.filter((product) => product.riskScore.level === "high").length;
  if (p0Count > 0 || highRiskCount > 0) {
    return "Potential revenue, ranking, inventory, or competitor-response risk if these items are not reviewed today.";
  }
  if (input.topEvents.length > 0 || input.openTasks.length > 0) {
    return "Operational follow-up is useful, but current evidence does not indicate an urgent automated action.";
  }
  return "Insufficient fresh evidence for operational decisions; refresh data before acting.";
}

function buildEvidence(input: {
  topEvents: InsightEvent[];
  openTasks: Task[];
  highRiskProducts: OwnedProductListItem[];
}): string[] {
  const evidence: string[] = [];
  for (const event of input.topEvents.slice(0, 5)) {
    evidence.push(`${event.eventLevel} ${event.eventType}: ${event.eventTitle} (score ${event.scoreTotal})`);
  }
  for (const product of input.highRiskProducts.slice(0, 3)) {
    evidence.push(`SKU ${product.sku} risk score ${product.riskScore.score}: ${product.riskScore.reasons[0] ?? "risk driver present"}`);
  }
  if (input.openTasks.length > 0) {
    evidence.push(`${input.openTasks.length} open tasks across pending/in-progress/review states.`);
  }
  if (evidence.length === 0) {
    evidence.push("No top insight events, open tasks, or high-risk SKU scores were found for this date.");
  }
  return evidence;
}

function actionFromEvent(event: InsightEvent, confidence: number): AiRecommendedAction {
  const target = event.asin ?? event.brand ?? event.eventTitle;
  return {
    action: event.suggestedAction || `Review signal for ${target}`,
    priority: normalizePriority(event.eventLevel, confidence),
    reason: event.eventSummary || event.eventTitle,
    risk: event.eventLevel === "P0"
      ? "High-priority signal may affect ranking, pricing, or competitor response."
      : "Signal may be noisy; verify evidence before action.",
    needs_human_approval: true
  };
}

function actionFromProduct(product: OwnedProductListItem, confidence: number): AiRecommendedAction {
  const requestedPriority: AiActionPriority = product.riskScore.level === "high" ? "P0" : "P1";
  return {
    action: `Review SKU ${product.sku} (${product.asin}) risk drivers`,
    priority: normalizePriority(requestedPriority, confidence),
    reason: product.riskScore.reasons[0] ?? `Risk score is ${product.riskScore.score}.`,
    risk: "SKU-level metric movement may affect sales, inventory, ads, or organic rank.",
    needs_human_approval: true
  };
}

function actionFromListingIssue(issue: ListingHealthIssue, score: number, confidence: number): AiRecommendedAction {
  const requestedPriority: AiActionPriority = score < 70 && issue.level === "fail" ? "P0" : issue.level === "fail" ? "P1" : "P2";
  return {
    action: issue.suggestion,
    priority: normalizePriority(requestedPriority, confidence),
    reason: issue.message,
    risk: issue.level === "fail"
      ? "This issue can hurt Listing conversion or keyword relevance if left unresolved."
      : "This issue is a quality gap to verify before publishing Listing edits.",
    needs_human_approval: true
  };
}

function buildTaskActions(openTasks: Task[], confidence: number): AiRecommendedAction[] {
  const p0Tasks = openTasks.filter((task) => task.priority === "P0");
  if (p0Tasks.length === 0) return [];
  return [{
    action: `Review ${p0Tasks.length} open P0 workflow task${p0Tasks.length === 1 ? "" : "s"}`,
    priority: normalizePriority("P0", confidence),
    reason: "Open P0 tasks already exist and should be reconciled before adding new operational work.",
    risk: "Duplicate or stale tasks can dilute operator focus.",
    needs_human_approval: true
  }];
}

function fallbackAction(confidence: number): AiRecommendedAction {
  return {
    action: "Refresh collection data and generate insight events before taking operational action",
    priority: normalizePriority("P2", confidence),
    reason: "The Agent does not have enough evidence to recommend a concrete SKU, listing, ad, or competitor action.",
    risk: "Acting without fresh evidence can create noisy or harmful workflow tasks.",
    needs_human_approval: true
  };
}

function calculateConfidence(
  topEvents: InsightEvent[],
  products: OwnedProductListItem[],
  openTasks: Task[]
): number {
  let score = 0.35;
  if (topEvents.length > 0) score += 0.25;
  if (topEvents.some((event) => event.scoreTotal >= 80)) score += 0.1;
  if (products.some((product) => product.latestMetric !== null)) score += 0.15;
  if (openTasks.length > 0) score += 0.05;
  return Math.min(0.9, Number(score.toFixed(2)));
}

function normalizePriority(priority: AiActionPriority, confidence: number): AiActionPriority {
  if (confidence >= 0.5) return priority;
  if (priority === "P0") return "P1";
  return priority;
}

export function validateAiAgentOutput(output: AiAgentOutput): string[] {
  const errors: string[] = [];
  if (!output.summary.trim()) errors.push("summary is required");
  if (!output.impact.trim()) errors.push("impact is required");
  if (!Number.isFinite(output.confidence) || output.confidence < 0 || output.confidence > 1) {
    errors.push("confidence must be between 0 and 1");
  }
  if (!Array.isArray(output.evidence) || output.evidence.length === 0 || output.evidence.some((item) => !item.trim())) {
    errors.push("evidence must contain non-empty strings");
  }
  if (!Array.isArray(output.recommended_actions) || output.recommended_actions.length === 0) {
    errors.push("recommended_actions must contain at least one action");
  }
  for (const [index, action] of output.recommended_actions.entries()) {
    if (!action.action.trim()) errors.push(`recommended_actions.${index}.action is required`);
    if (!action.reason.trim()) errors.push(`recommended_actions.${index}.reason is required`);
    if (!action.risk.trim()) errors.push(`recommended_actions.${index}.risk is required`);
    if (action.needs_human_approval !== true) errors.push(`recommended_actions.${index}.needs_human_approval must be true`);
    if (action.priority !== "P0" && action.priority !== "P1" && action.priority !== "P2") {
      errors.push(`recommended_actions.${index}.priority is invalid`);
    }
    if (output.confidence < 0.5 && action.priority === "P0") {
      errors.push(`recommended_actions.${index}.priority cannot be P0 when confidence is below 0.5`);
    }
  }
  return errors;
}
