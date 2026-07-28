import type {
  AiAgentOutput,
  AiCompetitorAnalysisResponse,
  AiRecommendedAction,
  InsightEvent,
  InsightEventType
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import {
  assessDataFreshness,
  guardAgentOutput,
  insightEventFreshnessRecords
} from "./ai-data-freshness.js";
import { normalizeAiActionPriority, validateAiAgentOutput } from "./ai-agent-policy.js";

const COMPETITOR_ANALYST_MODEL = "deterministic-competitor-analyst-v2";

interface CompetitorAnalysisInput {
  date: string;
  eventId: string;
  orgId: number;
}

export function analyzeCompetitor(store: Store, input: CompetitorAnalysisInput): AiCompetitorAnalysisResponse {
  const event = store.getInsightEvent(input.eventId, input.orgId);
  if (!event) {
    throw Object.assign(new Error("Insight event not found"), { statusCode: 404 });
  }

  const relatedEvents = findRelatedEvents(store, event);
  const dataFreshness = assessDataFreshness({
    evidenceDate: event.eventDate,
    records: insightEventFreshnessRecords([event, ...relatedEvents]),
    maxAgeHours: competitorMaxAgeHours(event.eventType),
    dataLabel: "Competitor"
  });
  const baseOutput = buildCompetitorOutput(event, relatedEvents, calculateConfidence(event, relatedEvents));
  const output = guardAgentOutput(baseOutput, dataFreshness, {
    action: `Refresh competitor evidence for ${formatSubject(event)} before planning a response`,
    priority: "P2",
    reason: dataFreshness.warning ?? "Competitor evidence is not ready.",
    risk: "Pricing, ranking, or promotion responses based on stale evidence can waste margin and traffic.",
    needs_human_approval: true
  });
  const validationErrors = validateAiAgentOutput(output);
  const inputContextJson = JSON.stringify({
    date: input.date,
    orgId: input.orgId,
    eventId: input.eventId,
    eventType: event.eventType,
    eventLevel: event.eventLevel,
    asin: event.asin,
    brand: event.brand,
    relatedEventIds: relatedEvents.map((item) => item.id),
    dataFreshness,
    generatedAt: new Date().toISOString()
  });

  if (validationErrors.length > 0) {
    store.createAiRun({
      orgId: input.orgId,
      agentType: "competitor_analyst",
      inputContextJson,
      output: null,
      model: COMPETITOR_ANALYST_MODEL,
      status: "failed",
      errorMessage: validationErrors.join("; ")
    });
    throw Object.assign(new Error(`Invalid AI Agent output: ${validationErrors.join("; ")}`), { statusCode: 500 });
  }

  const run = store.createAiRun({
    orgId: input.orgId,
    agentType: "competitor_analyst",
    inputContextJson,
    output,
    model: COMPETITOR_ANALYST_MODEL,
    status: "success",
    tokenUsage: null,
    errorMessage: null
  });
  return { date: input.date, eventId: event.id, output, run, event, relatedEvents };
}

function competitorMaxAgeHours(eventType: InsightEventType): number {
  if (isPricingEvent(eventType)) return 3;
  if (isRankingEvent(eventType)) return 6;
  return 24;
}

function findRelatedEvents(store: Store, event: InsightEvent): InsightEvent[] {
  const params = event.asin
    ? { asin: event.asin, limit: 20 }
    : event.brand
      ? { brand: event.brand, limit: 20 }
      : { categoryId: event.categoryId ?? undefined, limit: 20 };

  return store
    .listInsightEvents({ ...params, orgId: event.orgId })
    .filter((item) => item.id !== event.id)
    .slice(0, 5);
}

function buildCompetitorOutput(
  event: InsightEvent,
  relatedEvents: InsightEvent[],
  confidence: number
): AiAgentOutput {
  const actions = [
    actionFromSelectedEvent(event, confidence),
    ...actionsForEventType(event, confidence),
    ...relatedEventActions(event, relatedEvents, confidence)
  ].slice(0, 5);

  return {
    summary: `${formatSubject(event)}: ${event.eventTitle}`,
    evidence: buildEvidence(event, relatedEvents),
    impact: buildImpact(event, relatedEvents),
    recommended_actions: actions,
    confidence
  };
}

function buildEvidence(event: InsightEvent, relatedEvents: InsightEvent[]): string[] {
  const evidence = [
    `${event.eventLevel} ${event.eventType}: score ${event.scoreTotal}/${event.scoreLevel}.`,
    ...event.evidence.evidenceItems.slice(0, 4)
  ];

  if (event.evidence.currentRank != null || event.evidence.previousRank != null) {
    evidence.push(`Rank moved from ${formatOptionalRank(event.evidence.previousRank)} to ${formatOptionalRank(event.evidence.currentRank)}.`);
  }
  if (event.evidence.priceBefore != null || event.evidence.priceAfter != null) {
    evidence.push(`Price moved from ${formatOptionalNumber(event.evidence.priceBefore)} to ${formatOptionalNumber(event.evidence.priceAfter)}.`);
  }
  if (event.evidence.reviewCountBefore != null || event.evidence.reviewCountAfter != null) {
    evidence.push(`Review count moved from ${formatOptionalNumber(event.evidence.reviewCountBefore)} to ${formatOptionalNumber(event.evidence.reviewCountAfter)}.`);
  }
  if (relatedEvents.length > 0) {
    evidence.push(`${relatedEvents.length} related signal${relatedEvents.length === 1 ? "" : "s"} found for the same ASIN, brand, or category.`);
  }

  return evidence.slice(0, 8);
}

function buildImpact(event: InsightEvent, relatedEvents: InsightEvent[]): string {
  const repeatSignal = relatedEvents.some((item) => item.eventLevel === "P0" || item.eventType === event.eventType);
  const suffix = repeatSignal
    ? " Related signals suggest this is not an isolated observation."
    : " Current evidence should still be verified before changing price, ads, or listing operations.";

  if (isPricingEvent(event.eventType)) {
    return `Competitor price or promo movement may pressure ranking, buy-box perception, and margin response decisions.${suffix}`;
  }
  if (isRankingEvent(event.eventType)) {
    return `Ranking movement may indicate share capture, launch acceleration, or category defense risk.${suffix}`;
  }
  if (isReviewEvent(event.eventType)) {
    return `Review momentum can shift conversion trust and make a lower-priced or newer competitor harder to displace.${suffix}`;
  }

  if (event.eventType === "LISTING_CHANGED") {
    return `A competitor title or main-image change may alter click-through and positioning.${suffix}`;
  }
  if (event.eventType === "CORE_COMPETITOR_RISK") {
    return `A watched competitor is showing enough movement to deserve operator review before the next pricing or traffic decision.${suffix}`;
  }
  return `This signal can change the priority of competitor monitoring and follow-up tasks.${suffix}`;
}

function actionFromSelectedEvent(event: InsightEvent, confidence: number): AiRecommendedAction {
  return {
    action: event.suggestedAction || `Review competitor signal for ${formatSubject(event)}`,
    priority: normalizeAiActionPriority(event.eventLevel, confidence),
    reason: event.eventSummary || event.eventTitle,
    risk: event.eventLevel === "P0"
      ? "High-priority competitor movement can trigger an overreaction if the operator skips evidence review."
      : "Signal may be noisy, stale, or category-specific without operator confirmation.",
    needs_human_approval: true
  };
}

function actionsForEventType(event: InsightEvent, confidence: number): AiRecommendedAction[] {
  if (isPricingEvent(event.eventType)) {
    return [{
      action: `Compare price, coupon, and deal response options for ${formatSubject(event)}`,
      priority: normalizeAiActionPriority(event.eventLevel === "P0" ? "P0" : "P1", confidence),
      reason: "The selected signal contains pricing or promotion movement.",
      risk: "Matching a competitor blindly can damage margin or reset customer price expectations.",
      needs_human_approval: true
    }];
  }

  if (isRankingEvent(event.eventType)) {
    return [{
      action: `Check ranking defense levers for ${formatSubject(event)}`,
      priority: normalizeAiActionPriority(event.eventLevel === "P0" ? "P0" : "P1", confidence),
      reason: "The selected signal indicates organic rank or category share movement.",
      risk: "Traffic, content, or promotion changes without root-cause review can spend budget on the wrong lever.",
      needs_human_approval: true
    }];
  }

  if (isReviewEvent(event.eventType)) {
    return [{
      action: `Review social-proof gap and buyer objection themes against ${formatSubject(event)}`,
      priority: normalizeAiActionPriority("P1", confidence),
      reason: "The selected signal includes review or rating momentum.",
      risk: "Listing or support changes based on a small review sample can misread buyer objections.",
      needs_human_approval: true
    }];
  }

  if (event.eventType === "LISTING_CHANGED") {
    return [{
      action: `Compare the changed title or main image for ${formatSubject(event)} with ranking movement over the next 3 days`,
      priority: normalizeAiActionPriority("P1", confidence),
      reason: "The selected signal contains a competitor Listing content change.",
      risk: "Copying a competitor content change without CTR or conversion evidence can weaken positioning.",
      needs_human_approval: true
    }];
  }

  return [{
    action: `Keep ${formatSubject(event)} under watch and refresh competitor evidence`,
    priority: normalizeAiActionPriority("P2", confidence),
    reason: "The selected signal is useful for monitoring but needs a second check before execution.",
    risk: "Creating work too early can add noise to the operator queue.",
    needs_human_approval: true
  }];
}

function relatedEventActions(
  event: InsightEvent,
  relatedEvents: InsightEvent[],
  confidence: number
): AiRecommendedAction[] {
  const p0Count = relatedEvents.filter((item) => item.eventLevel === "P0").length;
  if (p0Count === 0) return [];
  return [{
    action: `Review ${p0Count} related P0 competitor signal${p0Count === 1 ? "" : "s"} before closing this case`,
    priority: normalizeAiActionPriority("P1", confidence),
    reason: `${formatSubject(event)} has related high-priority events in the current evidence set.`,
    risk: "Closing one event without checking related signals can hide an active competitor pattern.",
    needs_human_approval: true
  }];
}

function calculateConfidence(event: InsightEvent, relatedEvents: InsightEvent[]): number {
  let score = 0.4;
  if (event.scoreTotal >= 70) score += 0.15;
  if (event.evidence.evidenceItems.length > 0) score += 0.15;
  if (hasMetricEvidence(event)) score += 0.15;
  if (event.asin !== null || event.brand !== null) score += 0.05;
  if (relatedEvents.length > 0) score += 0.08;
  if (relatedEvents.some((item) => item.eventLevel === "P0")) score += 0.04;
  return Math.min(0.88, Number(score.toFixed(2)));
}

function hasMetricEvidence(event: InsightEvent): boolean {
  const evidence = event.evidence;
  return evidence.currentRank != null
    || evidence.previousRank != null
    || evidence.priceBefore != null
    || evidence.priceAfter != null
    || evidence.reviewCountBefore != null
    || evidence.reviewCountAfter != null
    || evidence.ratingBefore != null
    || evidence.ratingAfter != null
    || (evidence.listingChangedFields?.length ?? 0) > 0
    || evidence.couponAfter != null
    || evidence.dealType != null;
}

function isPricingEvent(eventType: InsightEventType): boolean {
  return eventType.includes("PRICE") || eventType.includes("COUPON") || eventType.includes("DEAL");
}

function isRankingEvent(eventType: InsightEventType): boolean {
  return eventType.includes("RANK")
    || eventType.includes("TOP")
    || eventType.includes("BREAKOUT")
    || eventType.includes("BRAND_MATRIX")
    || eventType === "LOW_REVIEW_HIGH_RANK";
}

function isReviewEvent(eventType: InsightEventType): boolean {
  return eventType.includes("REVIEW") || eventType === "RATING_DROP" || eventType === "LOW_REVIEW_HIGH_RANK";
}


function formatSubject(event: InsightEvent): string {
  return event.asin ?? event.brand ?? event.evidence.categoryName ?? "Competitor signal";
}

function formatOptionalRank(value: number | null | undefined): string {
  return value == null ? "n/a" : `#${value}`;
}

function formatOptionalNumber(value: number | null | undefined): string {
  return value == null ? "n/a" : String(value);
}
