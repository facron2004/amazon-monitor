import { describe, expect, it } from "vitest";
import type {
  AttributionTag,
  InsightEvent,
  InsightEvidence,
  InsightEventLevel,
  InsightEventStatus
} from "@amazon-monitor/shared";
import { getStrategyFocusRows } from "./actionCenterStrategyFocus";

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
    assignee: null,
    reviewDueDate: null,
    reviewResult: null,
    userNote: null,
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
    ...rest,
    orgId: rest.orgId ?? 1
  };
}

describe("action center strategy focus", () => {
  it("aggregates evidence-backed and inferred strategy tags", () => {
    const rows = getStrategyFocusRows([
      makeEvent({
        id: "core-1",
        eventLevel: "P0",
        scoreTotal: 100,
        eventTitle: "Core threat",
        evidence: { isCoreCompetitor: true, currentRank: 8, strategyTags: ["HIGH_THREAT_CORE"] }
      }),
      makeEvent({
        id: "coupon-1",
        attributionTags: ["COUPON_DRIVEN"],
        eventType: "COUPON_ADDED",
        scoreTotal: 70,
        evidence: { currentRank: 40 }
      }),
      makeEvent({
        id: "coupon-2",
        attributionTags: ["COUPON_DRIVEN"],
        eventType: "COUPON_ADDED",
        eventLevel: "P0",
        scoreTotal: 90,
        eventTitle: "Coupon P0",
        evidence: { currentRank: 18 }
      })
    ]);

    const highThreat = rows.find((row) => row.tag === "HIGH_THREAT_CORE");
    const coupon = rows.find((row) => row.tag === "COUPON_DEPENDENT");

    expect(highThreat).toMatchObject({
      eventCount: 1,
      p0Count: 1,
      totalScore: 100,
      topEventId: "core-1"
    });
    expect(coupon).toMatchObject({
      eventCount: 2,
      p0Count: 1,
      totalScore: 160,
      topEventId: "coupon-2",
      topEventTitle: "Coupon P0"
    });
    expect(rows[0]?.tag).toBe("COUPON_DEPENDENT");
  });
});
