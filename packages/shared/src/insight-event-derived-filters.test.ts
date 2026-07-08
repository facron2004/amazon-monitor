import { describe, expect, it } from "vitest";
import type { InsightEvent } from "./insight-events.js";
import {
  isActionEvidenceMovementMatch,
  isActionStageMatch,
  isActionScoreDriverMatch,
  isReviewCadenceBucketMatch
} from "./insight-event-derived-filters.js";

function event(overrides: Partial<InsightEvent> = {}): InsightEvent {
  return {
    id: overrides.id ?? "evt-1",
    eventDate: "2026-06-30",
    asin: "B000TEST",
    brand: "Acme",
    categoryId: 1,
    keywordId: null,
    eventType: "RANK_SURGE",
    eventLevel: "P1",
    eventTitle: "Acme gained rank",
    eventSummary: "Acme gained rank.",
    attributionTags: [],
    evidence: {
      marketplace: "US",
      previousRank: 80,
      currentRank: 20,
      priceBefore: 29.99,
      priceAfter: 24.99,
      reviewCountBefore: 10,
      reviewCountAfter: 28,
      evidenceItems: [],
      ...overrides.evidence
    },
    scoreTotal: 80,
    scoreLevel: "A",
    scoreBreakdown: overrides.scoreBreakdown ?? {
      rankingScore: 30,
      productScore: 10,
      promoScore: 30,
      brandScore: 5,
      riskScore: 0,
      reasons: []
    },
    suggestedAction: "Watch",
    status: overrides.status ?? "TODO",
    assignee: null,
    reviewDueDate: overrides.reviewDueDate ?? "2026-07-03",
    reviewResult: null,
    userNote: null,
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides
  };
}

describe("insight event derived filters", () => {
  it("matches pressure-building evidence movement", () => {
    const row = event();
    expect(isActionEvidenceMovementMatch(row, "rankGain")).toBe(true);
    expect(isActionEvidenceMovementMatch(row, "priceCut")).toBe(true);
    expect(isActionEvidenceMovementMatch(row, "reviewGrowth")).toBe(true);
  });

  it("matches review cadence by due date and reviewable status", () => {
    expect(isReviewCadenceBucketMatch(event({ reviewDueDate: "2026-06-29" }), "overdue", "2026-06-30")).toBe(true);
    expect(isReviewCadenceBucketMatch(event({ reviewDueDate: "2026-06-30" }), "today", "2026-06-30")).toBe(true);
    expect(isReviewCadenceBucketMatch(event({ reviewDueDate: "2026-07-03" }), "upcoming", "2026-06-30")).toBe(true);
    expect(isReviewCadenceBucketMatch(event({ status: "WATCHING", reviewDueDate: "2026-06-30" }), "today", "2026-06-30")).toBe(false);
  });

  it("matches strongest score drivers including ties", () => {
    const row = event();
    expect(isActionScoreDriverMatch(row, "rankingScore")).toBe(true);
    expect(isActionScoreDriverMatch(row, "promoScore")).toBe(true);
    expect(isActionScoreDriverMatch(row, "productScore")).toBe(false);
  });

  it("matches operational action stages", () => {
    expect(isActionStageMatch(event({ status: "TODO", reviewDueDate: "2026-06-29" }), "reviewDue", "2026-06-30")).toBe(true);
    expect(isActionStageMatch(event({ status: "TODO", assignee: null, reviewDueDate: null }), "unassigned", "2026-06-30")).toBe(true);
    expect(isActionStageMatch(event({ status: "TODO", assignee: "Ada", reviewDueDate: null }), "ready", "2026-06-30")).toBe(true);
    expect(isActionStageMatch(event({ status: "WATCHING", assignee: "Ada", reviewDueDate: null }), "watching", "2026-06-30")).toBe(true);
    expect(isActionStageMatch(event({ status: "REVIEW_PENDING", assignee: "Ada", reviewDueDate: "2026-07-03" }), "scheduled", "2026-06-30")).toBe(true);
    expect(isActionStageMatch(event({ status: "REVIEWED", assignee: "Ada", reviewDueDate: null }), "closed", "2026-06-30")).toBe(true);
    expect(isActionStageMatch(event({ status: "FOLLOWED", assignee: "Ada", reviewDueDate: "2026-06-29" }), "reviewDue", "2026-06-30")).toBe(true);
  });
});
