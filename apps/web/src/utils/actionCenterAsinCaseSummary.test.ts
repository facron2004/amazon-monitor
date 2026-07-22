import { describe, expect, it } from "vitest";
import type { InsightEvent, InsightEvidence } from "@amazon-monitor/shared";
import type { AsinGroupedView } from "../stores/insightEvents";
import { buildActionAsinCaseSummary } from "./actionCenterAsinCaseSummary";

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

function makeGroup(overrides: Partial<AsinGroupedView> = {}): AsinGroupedView {
  const representative = overrides.representative ?? makeEvent({
    asin: overrides.asin ?? "B000TEST",
    eventLevel: overrides.topLevel ?? "P1",
    scoreTotal: overrides.scoreTotal ?? 80
  });
  return {
    asin: overrides.asin ?? "B000001",
    representative,
    events: overrides.events ?? [representative],
    attributionTags: overrides.attributionTags ?? [],
    strategyTags: overrides.strategyTags ?? [],
    topLevel: overrides.topLevel ?? representative.eventLevel,
    watchLevel: overrides.watchLevel ?? null,
    scoreTotal: overrides.scoreTotal ?? representative.scoreTotal,
    opportunityScore: overrides.opportunityScore ?? 60,
    riskScore: overrides.riskScore ?? 40,
    opportunityReasons: overrides.opportunityReasons ?? ["ranking +30"],
    riskReasons: overrides.riskReasons ?? ["risk +10"]
  };
}

describe("action center ASIN case summary", () => {
  it("returns zeros for empty case lists", () => {
    expect(buildActionAsinCaseSummary([])).toEqual({
      caseCount: 0,
      eventCount: 0,
      p0CaseCount: 0,
      multiEventCaseCount: 0,
      multiEventPercent: 0,
      coreCaseCount: 0,
      corePercent: 0,
      totalScore: 0,
      averageScore: 0
    });
  });

  it("summarizes ASIN case pressure", () => {
    const multiEvent = makeGroup({
      asin: "B001",
      topLevel: "P0",
      scoreTotal: 90,
      events: [
        makeEvent({ id: "b001-a", asin: "B001", eventLevel: "P0", scoreTotal: 90 }),
        makeEvent({ id: "b001-b", asin: "B001", eventLevel: "P1", scoreTotal: 60 })
      ]
    });
    const watchedCore = makeGroup({
      asin: "B002",
      watchLevel: "CORE",
      scoreTotal: 70
    });
    const evidenceCore = makeGroup({
      asin: "B003",
      scoreTotal: 50,
      events: [makeEvent({ asin: "B003", evidence: { isCoreCompetitor: true }, scoreTotal: 50 })]
    });

    expect(buildActionAsinCaseSummary([multiEvent, watchedCore, evidenceCore])).toEqual({
      caseCount: 3,
      eventCount: 4,
      p0CaseCount: 1,
      multiEventCaseCount: 1,
      multiEventPercent: 33,
      coreCaseCount: 2,
      corePercent: 67,
      totalScore: 210,
      averageScore: 70
    });
  });
});
