import type {
  AiActionPriority,
  AiAgentOutput,
  AiListingAnalysisResponse,
  AiListingRewriteDraft,
  AiRecommendedAction,
  ListingHealthIssue
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { assessDataFreshness, guardAgentOutput } from "./ai-data-freshness.js";
import { normalizeAiActionPriority, validateAiAgentOutput } from "./ai-agent-policy.js";

const LISTING_OPTIMIZER_MODEL = "deterministic-listing-optimizer-v3";

export function analyzeListing(
  store: Store,
  input: { productId: number; orgId: number; date: string }
): AiListingAnalysisResponse {
  const listingHealth = store.getProductListingHealth(input.productId, input.date);
  if (!listingHealth || listingHealth.orgId !== input.orgId) {
    throw Object.assign(new Error("Listing health item not found"), { statusCode: 404 });
  }
  const dataFreshness = assessDataFreshness({
    evidenceDate: listingHealth.snapshotDate ?? input.date,
    records: listingHealth.snapshotId === null ? [] : [listingHealth.freshness],
    maxAgeHours: 24,
    dataLabel: "Listing"
  });
  const baseOutput = buildListingOptimizerOutput(
    listingHealth,
    listingHealth.snapshotId === null ? 0.35 : 0.7
  );
  const output = guardAgentOutput(baseOutput, dataFreshness, {
    action: `Refresh the Listing snapshot for ${listingHealth.sku} before drafting publishable changes`,
    priority: "P2",
    reason: dataFreshness.warning ?? "Listing evidence is not ready.",
    risk: "A rewrite based on stale or incomplete Listing evidence can remove current claims or reintroduce resolved gaps.",
    needs_human_approval: true
  });
  const validationErrors = validateAiAgentOutput(output);
  const inputContextJson = JSON.stringify({
    date: input.date,
    orgId: input.orgId,
    productId: input.productId,
    snapshotId: listingHealth.snapshotId,
    healthScore: listingHealth.health.score,
    dataFreshness,
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
