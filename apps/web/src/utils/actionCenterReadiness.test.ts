import { describe, expect, it } from "vitest";
import type {
  AttributionTag,
  InsightEvent,
  InsightEvidence,
  InsightEventLevel,
  InsightEventStatus
} from "@amazon-monitor/shared";
import { buildActionReadinessSummary } from "./actionCenterReadiness";

type EventOverrides = Partial<Omit<InsightEvent, "attributionTags" | "evidence" | "eventLevel" | "status">> & {
  attributionTags?: AttributionTag[];
  eventLevel?: InsightEventLevel;
  evidence?: Partial<InsightEvidence>;
  status?: InsightEventStatus;
};

function makeEvent(overrides: EventOverrides = {}): InsightEvent {
  const { attributionTags, eventLevel, evidence, status, ...rest } = overrides;
  return {
    id: rest.id ?? "event-1",
    eventDate: "2026-06-29",
    asin: rest.asin ?? "B000TEST",
    brand: rest.brand ?? "Acme",
    categoryId: 1,
    keywordId: null,
    eventType: "CORE_COMPETITOR_RISK",
    eventLevel: eventLevel ?? "P1",
    eventTitle: rest.eventTitle ?? "Acme gained rank",
    eventSummary: "Acme gained rank in the monitored category.",
    attributionTags: attributionTags ?? [],
    evidence: {
      marketplace: "US",
      currentRank: 12,
      previousRank: 30,
      rankChange: 18,
      isCoreCompetitor: false,
      evidenceItems: [],
      ...evidence
    },
    scoreTotal: rest.scoreTotal ?? 88,
    scoreLevel: "A",
    scoreBreakdown: {
      rankingScore: 30,
      productScore: 16,
      promoScore: 12,
      brandScore: 20,
      riskScore: 10,
      reasons: []
    },
    suggestedAction: "Review competitor movement.",
    status: status ?? "TODO",
    assignee: rest.assignee ?? null,
    reviewDueDate: rest.reviewDueDate ?? null,
    reviewResult: null,
    userNote: null,
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
    ...rest,
    orgId: rest.orgId ?? 1
  };
}

describe("action center readiness summary", () => {
  it("returns zeroed coverage for an empty view", () => {
    expect(buildActionReadinessSummary([], "2026-06-29")).toEqual({
      actionableCount: 0,
      assignedCount: 0,
      assignedPercent: 0,
      scheduledReviewCount: 0,
      scheduledReviewPercent: 0,
      dueNowCount: 0,
      unassignedCount: 0,
      p0OpenCount: 0,
      totalScore: 0
    });
  });

  it("counts only actionable events for coverage and pressure", () => {
    const summary = buildActionReadinessSummary([
      makeEvent({ id: "todo", status: "TODO", assignee: "Alice", reviewDueDate: "2026-06-29", scoreTotal: 90 }),
      makeEvent({ id: "watching", status: "WATCHING", assignee: "   ", eventLevel: "P0", scoreTotal: 70 }),
      makeEvent({ id: "pending", status: "REVIEW_PENDING", assignee: null, reviewDueDate: "2026-07-02", scoreTotal: 40 }),
      makeEvent({ id: "closed", status: "REVIEWED", assignee: "Bob", eventLevel: "P0", reviewDueDate: "2026-06-20", scoreTotal: 999 })
    ], "2026-06-29");

    expect(summary).toEqual({
      actionableCount: 3,
      assignedCount: 1,
      assignedPercent: 33,
      scheduledReviewCount: 2,
      scheduledReviewPercent: 67,
      dueNowCount: 1,
      unassignedCount: 2,
      p0OpenCount: 1,
      totalScore: 200
    });
  });

  it("treats overdue and today review dates as due now", () => {
    const summary = buildActionReadinessSummary([
      makeEvent({ id: "overdue", reviewDueDate: "2026-06-27" }),
      makeEvent({ id: "today", reviewDueDate: "2026-06-29" }),
      makeEvent({ id: "future", reviewDueDate: "2026-07-01" }),
      makeEvent({ id: "closed", status: "IGNORED", reviewDueDate: "2026-06-20" })
    ], "2026-06-29");

    expect(summary.dueNowCount).toBe(2);
  });
});
