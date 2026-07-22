import { describe, expect, it } from "vitest";
import type { InsightEvent, InsightEvidence } from "@amazon-monitor/shared";
import type { AsinGroupedView } from "../stores/insightEvents";
import { buildAsinLeaderboards } from "./actionCenterLeaderboards";

type EventOverrides = Partial<Omit<InsightEvent, "evidence">> & {
  evidence?: Partial<InsightEvidence>;
};

function makeEvent(overrides: EventOverrides = {}): InsightEvent {
  const { evidence, ...rest } = overrides;
  return {
    id: rest.id ?? "event-1",
    eventDate: "2026-07-18",
    asin: "B000001",
    brand: "Acme",
    categoryId: 1,
    keywordId: null,
    eventType: rest.eventType ?? "RANK_SURGE",
    eventLevel: rest.eventLevel ?? "P1",
    eventTitle: "Sample event",
    eventSummary: "summary",
    attributionTags: rest.attributionTags ?? [],
    evidence: {
      marketplace: "US",
      currentRank: 12,
      previousRank: 40,
      rankChange: 28,
      isCoreCompetitor: false,
      evidenceItems: [],
      ...evidence
    },
    scoreTotal: rest.scoreTotal ?? 70,
    scoreLevel: "B",
    scoreBreakdown: rest.scoreBreakdown ?? {
      rankingScore: 30,
      productScore: 10,
      promoScore: 10,
      brandScore: 5,
      riskScore: 5,
      reasons: []
    },
    suggestedAction: "watch",
    status: "TODO",
    assignee: null,
    reviewDueDate: null,
    reviewResult: null,
    userNote: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    ...rest,
    orgId: rest.orgId ?? 1
  };
}

function makeGroup(overrides: Partial<AsinGroupedView> = {}): AsinGroupedView {
  const representative = overrides.representative ?? makeEvent({
    asin: overrides.asin ?? "B000001",
    eventLevel: overrides.topLevel ?? "P1",
    scoreTotal: overrides.scoreTotal ?? 70
  });
  return {
    asin: overrides.asin ?? "B000001",
    representative,
    events: overrides.events ?? [representative],
    attributionTags: overrides.attributionTags ?? representative.attributionTags,
    strategyTags: overrides.strategyTags ?? [],
    topLevel: overrides.topLevel ?? representative.eventLevel,
    watchLevel: overrides.watchLevel ?? null,
    scoreTotal: overrides.scoreTotal ?? representative.scoreTotal,
    opportunityScore: overrides.opportunityScore ?? 50,
    riskScore: overrides.riskScore ?? 30,
    opportunityReasons: overrides.opportunityReasons ?? ["ranking +30"],
    riskReasons: overrides.riskReasons ?? ["risk +5"]
  };
}

describe("buildAsinLeaderboards", () => {
  it("returns empty boards for empty groups", () => {
    expect(buildAsinLeaderboards([])).toEqual({
      opportunity: [],
      risk: [],
      newBreakout: [],
      promoAnomaly: []
    });
  });

  it("ranks opportunity and risk boards by dual scores", () => {
    const boards = buildAsinLeaderboards([
      makeGroup({ asin: "B0LOW", opportunityScore: 20, riskScore: 10 }),
      makeGroup({ asin: "B0OPP", opportunityScore: 90, riskScore: 20 }),
      makeGroup({ asin: "B0RISK", opportunityScore: 40, riskScore: 95 })
    ], 2);

    expect(boards.opportunity.map((item) => item.asin)).toEqual(["B0OPP", "B0RISK"]);
    expect(boards.risk.map((item) => item.asin)).toEqual(["B0RISK", "B0OPP"]);
  });

  it("filters new-breakout and promo anomaly boards by event signals", () => {
    const newBreakout = makeGroup({
      asin: "B0NEW",
      opportunityScore: 80,
      scoreTotal: 88,
      representative: makeEvent({
        id: "new-1",
        asin: "B0NEW",
        eventType: "NEW_PRODUCT_BREAKOUT",
        scoreTotal: 88
      }),
      events: [
        makeEvent({
          id: "new-1",
          asin: "B0NEW",
          eventType: "NEW_PRODUCT_BREAKOUT",
          scoreTotal: 88
        })
      ]
    });
    const promo = makeGroup({
      asin: "B0PROMO",
      opportunityScore: 70,
      representative: makeEvent({
        id: "promo-1",
        asin: "B0PROMO",
        eventType: "COUPON_ADDED",
        scoreTotal: 70,
        scoreBreakdown: {
          rankingScore: 10,
          productScore: 5,
          promoScore: 18,
          brandScore: 0,
          riskScore: 0,
          reasons: []
        }
      }),
      events: [
        makeEvent({
          id: "promo-1",
          asin: "B0PROMO",
          eventType: "COUPON_ADDED",
          scoreTotal: 70,
          scoreBreakdown: {
            rankingScore: 10,
            productScore: 5,
            promoScore: 18,
            brandScore: 0,
            riskScore: 0,
            reasons: []
          }
        })
      ]
    });
    const plain = makeGroup({ asin: "B0PLAIN", opportunityScore: 99, riskScore: 99 });

    const boards = buildAsinLeaderboards([newBreakout, promo, plain]);
    expect(boards.newBreakout.map((item) => item.asin)).toEqual(["B0NEW"]);
    expect(boards.promoAnomaly.map((item) => item.asin)).toEqual(["B0PROMO"]);
    expect(boards.opportunity[0]?.asin).toBe("B0PLAIN");
  });
});