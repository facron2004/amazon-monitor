import { describe, expect, it } from "vitest";
import type { InsightEvent, InsightEvidence } from "@amazon-monitor/shared";
import { buildActionColumnSummary } from "./actionCenterColumnSummary";

type EventOverrides = Partial<Omit<InsightEvent, "evidence">> & {
  evidence?: Partial<InsightEvidence>;
};

function makeEvent(overrides: EventOverrides = {}): InsightEvent {
  const { evidence, ...rest } = overrides;
  return {
    id: rest.id ?? "event-1",
    eventDate: "2026-06-30",
    asin: "B000TEST",
    brand: "Acme",
    categoryId: 1,
    keywordId: null,
    eventType: "CORE_COMPETITOR_RISK",
    eventLevel: rest.eventLevel ?? "P1",
    eventTitle: "Acme gained rank",
    eventSummary: "Acme gained rank in the monitored category.",
    attributionTags: [],
    evidence: {
      marketplace: "US",
      currentRank: 12,
      previousRank: 30,
      rankChange: 18,
      isCoreCompetitor: false,
      evidenceItems: [],
      ...evidence
    },
    scoreTotal: rest.scoreTotal ?? 80,
    scoreLevel: "A",
    scoreBreakdown: {
      rankingScore: 30,
      productScore: 16,
      promoScore: 12,
      brandScore: 12,
      riskScore: 10,
      reasons: []
    },
    suggestedAction: "Review competitor movement.",
    status: rest.status ?? "TODO",
    assignee: rest.assignee ?? null,
    reviewDueDate: rest.reviewDueDate ?? null,
    reviewResult: null,
    userNote: null,
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...rest,
    orgId: rest.orgId ?? 1
  };
}

describe("action center column summary", () => {
  it("returns zeros for an empty column", () => {
    expect(buildActionColumnSummary([], "2026-07-01")).toEqual({
      eventCount: 0,
      totalScore: 0,
      averageScore: 0,
      p0Count: 0,
      dueNowCount: 0,
      assignedCount: 0,
      assignedPercent: 0
    });
  });

  it("summarizes queue pressure and ownership coverage", () => {
    const summary = buildActionColumnSummary([
      makeEvent({ id: "p0-due", eventLevel: "P0", scoreTotal: 90, assignee: "Ada", reviewDueDate: "2026-06-30" }),
      makeEvent({ id: "p1-today", eventLevel: "P1", scoreTotal: 70, assignee: "", reviewDueDate: "2026-07-01" }),
      makeEvent({ id: "p2-future", eventLevel: "P2", scoreTotal: 50, assignee: "Lin", reviewDueDate: "2026-07-05" })
    ], "2026-07-01");

    expect(summary).toEqual({
      eventCount: 3,
      totalScore: 210,
      averageScore: 70,
      p0Count: 1,
      dueNowCount: 2,
      assignedCount: 2,
      assignedPercent: 67
    });
  });
});
