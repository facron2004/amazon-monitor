import type {
  AiActionPriority,
  AiAgentOutput,
  AiDailyBriefResponse,
  AiListingRewriteDraft,
  AiListingAnalysisResponse,
  AiRecommendedAction,
  InsightEvent,
  ListingHealthIssue,
  OwnedProductListItem,
  Task
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { normalizeAiActionPriority, validateAiAgentOutput } from "./ai-agent-policy.js";

const DAILY_OPERATOR_MODEL = "deterministic-daily-operator-v1";
const LISTING_OPTIMIZER_MODEL = "deterministic-listing-optimizer-v2";
const OPEN_TASK_STATUSES: Task["status"][] = ["pending", "in_progress", "awaiting_review"];

interface DailyBriefInput {
  date: string;
  orgId: number;
}

export function generateDailyBrief(store: Store, input: DailyBriefInput): AiDailyBriefResponse {
  const topEvents = store.listTopInsights(input.date, 5, {}, input.orgId);
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
      orgId: input.orgId,
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
    orgId: input.orgId,
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
      orgId: input.orgId,
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
    orgId: input.orgId,
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
    confidence,
    artifacts: {
      listingRewrite: buildListingRewriteDraft(listingHealth)
    }
  };
}

function buildListingRewriteDraft(
  listingHealth: AiListingAnalysisResponse["listingHealth"]
): AiListingRewriteDraft {
  return {
    proposedTitle: buildProposedTitle(listingHealth),
    titleEvidence: [
      `Current title: ${listingHealth.listingTitle || listingHealth.productTitle}`,
      `Core keywords: ${listingHealth.coreKeywords.join(", ") || "not provided"}`,
      `Evidence date: ${listingHealth.snapshotDate ?? "no Listing snapshot"}`
    ],
    bullets: buildRewriteBullets(listingHealth),
    imageBriefs: buildImageBriefs(listingHealth),
    aPlusModules: buildAPlusModules(listingHealth),
    riskNotes: [
      "Verify every product claim, specification, compatibility statement, and operating instruction before publishing.",
      "Treat this output as a draft only; Listing publication requires human approval.",
      "Do not add unsupported superlatives, competitor trademarks, medical claims, or guarantees."
    ]
  };
}

function buildProposedTitle(listingHealth: AiListingAnalysisResponse["listingHealth"]): string {
  const currentTitle = dedupeTitleWords(listingHealth.listingTitle || listingHealth.productTitle);
  const parts: string[] = [];
  if (listingHealth.brand && !includesNormalized(currentTitle, listingHealth.brand)) {
    parts.push(listingHealth.brand);
  }
  parts.push(currentTitle);
  for (const keyword of listingHealth.coreKeywords) {
    if (!includesNormalized(parts.join(" "), keyword)) {
      parts.push(toTitleCase(keyword));
    }
  }
  return parts.join(" - ").slice(0, 180).trim();
}

function buildRewriteBullets(
  listingHealth: AiListingAnalysisResponse["listingHealth"]
): AiListingRewriteDraft["bullets"] {
  const bullets: AiListingRewriteDraft["bullets"] = [];
  for (const [index, highlight] of listingHealth.reviewHighlights.entries()) {
    bullets.push({
      label: `Buyer theme ${index + 1}`,
      copy: `Address ${highlight}: explain the verified product behavior, operating step, and limitation that answers this buyer theme.`,
      evidence: [`Review highlight: ${highlight}`]
    });
  }
  for (const [index, gap] of listingHealth.qaGaps.entries()) {
    bullets.push({
      label: `Buyer question ${index + 1}`,
      copy: `Answer "${gap}" with a verified specification or operating instruction before publishing.`,
      evidence: [`Q&A gap: ${gap}`]
    });
  }
  for (const [index, keyword] of listingHealth.coreKeywords.entries()) {
    bullets.push({
      label: `Keyword use case ${index + 1}`,
      copy: `Connect the ${keyword} use case to one verified feature and one buyer outcome.`,
      evidence: [`Core keyword: ${keyword}`]
    });
  }
  for (const [index, bullet] of listingHealth.bulletPoints.entries()) {
    bullets.push({
      label: `Current bullet ${index + 1}`,
      copy: `Rewrite "${bullet}" into a benefit-led statement backed by a verified specification.`,
      evidence: [`Current bullet: ${bullet}`]
    });
  }
  return (bullets.length > 0 ? bullets : [{
    label: "Evidence gap",
    copy: "Add verified product features, buyer outcomes, and operating limits before drafting publishable bullets.",
    evidence: ["No bullets, Review highlights, Q&A gaps, or core keywords were provided."]
  }]).slice(0, 5);
}

function buildImageBriefs(
  listingHealth: AiListingAnalysisResponse["listingHealth"]
): AiListingRewriteDraft["imageBriefs"] {
  const briefs: AiListingRewriteDraft["imageBriefs"] = [];
  for (const highlight of listingHealth.reviewHighlights.slice(0, 2)) {
    briefs.push({
      slot: `Buyer concern: ${highlight}`,
      objective: `Show the verified product detail or operating step that addresses ${highlight}, with concise evidence-based callouts.`,
      evidence: `Review highlight: ${highlight}`
    });
  }
  for (const gap of listingHealth.qaGaps.slice(0, Math.max(0, 3 - briefs.length))) {
    briefs.push({
      slot: "FAQ image",
      objective: `Answer "${gap}" visually using a verified specification, diagram, or operating step.`,
      evidence: `Q&A gap: ${gap}`
    });
  }
  return briefs.length > 0 ? briefs : [{
    slot: "Product overview",
    objective: "Show the product, included components, scale, and one verified primary use case without unsupported claims.",
    evidence: "No Review or Q&A visual evidence was provided."
  }];
}

function buildAPlusModules(
  listingHealth: AiListingAnalysisResponse["listingHealth"]
): AiListingRewriteDraft["aPlusModules"] {
  const modules: AiListingRewriteDraft["aPlusModules"] = [];
  if (listingHealth.coreKeywords.length > 0) {
    modules.push({
      module: "Use-case comparison",
      objective: `Compare verified use cases related to ${listingHealth.coreKeywords.slice(0, 3).join(", ")}.`,
      evidence: `Core keywords: ${listingHealth.coreKeywords.slice(0, 3).join(", ")}`
    });
  }
  if (listingHealth.reviewHighlights.length > 0) {
    modules.push({
      module: "Buyer concern guide",
      objective: `Explain verified product behavior for ${listingHealth.reviewHighlights.slice(0, 3).join(", ")}.`,
      evidence: `Review highlights: ${listingHealth.reviewHighlights.slice(0, 3).join(", ")}`
    });
  }
  if (listingHealth.qaGaps.length > 0) {
    modules.push({
      module: "FAQ and operating guidance",
      objective: `Resolve ${listingHealth.qaGaps.length} open buyer question${listingHealth.qaGaps.length === 1 ? "" : "s"} with verified instructions.`,
      evidence: `Q&A gaps: ${listingHealth.qaGaps.slice(0, 3).join(" | ")}`
    });
  }
  return modules.length > 0 ? modules : [{
    module: "Evidence collection",
    objective: "Collect verified features, use cases, Review themes, and buyer questions before drafting A+ content.",
    evidence: "Current Listing evidence is incomplete."
  }];
}

function dedupeTitleWords(value: string): string {
  const seen = new Set<string>();
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter((word) => {
      const normalized = word.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (!normalized || !seen.has(normalized)) {
        if (normalized) seen.add(normalized);
        return true;
      }
      return false;
    })
    .join(" ");
}

function includesNormalized(value: string, target: string): boolean {
  const normalize = (input: string) => input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalize(value).includes(normalize(target));
}

function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
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
    priority: normalizeAiActionPriority(event.eventLevel, confidence),
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
    priority: normalizeAiActionPriority(requestedPriority, confidence),
    reason: product.riskScore.reasons[0] ?? `Risk score is ${product.riskScore.score}.`,
    risk: "SKU-level metric movement may affect sales, inventory, ads, or organic rank.",
    needs_human_approval: true
  };
}

function actionFromListingIssue(issue: ListingHealthIssue, score: number, confidence: number): AiRecommendedAction {
  const requestedPriority: AiActionPriority = score < 70 && issue.level === "fail" ? "P0" : issue.level === "fail" ? "P1" : "P2";
  return {
    action: issue.suggestion,
    priority: normalizeAiActionPriority(requestedPriority, confidence),
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
    priority: normalizeAiActionPriority("P0", confidence),
    reason: "Open P0 tasks already exist and should be reconciled before adding new operational work.",
    risk: "Duplicate or stale tasks can dilute operator focus.",
    needs_human_approval: true
  }];
}

function fallbackAction(confidence: number): AiRecommendedAction {
  return {
    action: "Refresh collection data and generate insight events before taking operational action",
    priority: normalizeAiActionPriority("P2", confidence),
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
