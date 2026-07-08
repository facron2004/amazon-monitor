import { describe, expect, it } from "vitest";
import type {
  AttributionTag,
  InsightEvent,
  InsightEvidence,
  InsightEventLevel,
  InsightEventStatus
} from "@amazon-monitor/shared";
import {
  getActionScoreBreakdownRows,
  getActionScoreCompositionRows,
  isActionScoreDriverMatch,
  getTopActionScoreDrivers
} from "./actionCenterScoreBreakdown";

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
    eventDate: "2026-06-30",
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
    scoreBreakdown: rest.scoreBreakdown ?? {
      rankingScore: 35,
      productScore: 10,
      promoScore: 8,
      brandScore: 15,
      riskScore: 0,
      reasons: ["Ranking driver", "Brand driver"]
    },
    suggestedAction: "Review competitor movement.",
    status: status ?? "TODO",
    assignee: rest.assignee ?? null,
    reviewDueDate: rest.reviewDueDate ?? null,
    reviewResult: null,
    userNote: null,
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...rest
  };
}

describe("action center score breakdown", () => {
  it("normalizes score components with the backend scoring maxima", () => {
    const rows = getActionScoreBreakdownRows(makeEvent());

    expect(rows.map((row) => [row.key, row.value, row.max, row.percent])).toEqual([
      ["rankingScore", 35, 35, 100],
      ["productScore", 10, 25, 40],
      ["promoScore", 8, 20, 40],
      ["brandScore", 15, 15, 100],
      ["riskScore", 0, 15, 0]
    ]);
  });

  it("caps percentage display when stored scores exceed an axis maximum", () => {
    const rows = getActionScoreBreakdownRows(makeEvent({
      scoreBreakdown: {
        rankingScore: 45,
        productScore: 0,
        promoScore: 0,
        brandScore: 0,
        riskScore: 0,
        reasons: []
      }
    }));

    expect(rows[0]?.percent).toBe(100);
  });

  it("returns the strongest non-zero drivers first", () => {
    const drivers = getTopActionScoreDrivers(makeEvent({
      scoreBreakdown: {
        rankingScore: 18,
        productScore: 25,
        promoScore: 8,
        brandScore: 0,
        riskScore: 15,
        reasons: []
      }
    }), 2);

    expect(drivers.map((row) => row.label)).toEqual(["商品机会", "排名动能"]);
  });

  it("aggregates score composition across visible events", () => {
    const rows = getActionScoreCompositionRows([
      makeEvent({
        scoreBreakdown: {
          rankingScore: 20,
          productScore: 10,
          promoScore: 0,
          brandScore: 5,
          riskScore: 5,
          reasons: []
        }
      }),
      makeEvent({
        scoreBreakdown: {
          rankingScore: 10,
          productScore: 15,
          promoScore: 10,
          brandScore: 5,
          riskScore: 0,
          reasons: []
        }
      })
    ]);

    expect(rows.map((row) => [row.label, row.value, row.percent])).toEqual([
      ["排名动能", 30, 38],
      ["商品机会", 25, 31],
      ["活动/价格", 10, 13],
      ["品牌矩阵", 10, 13],
      ["核心风险", 5, 6]
    ]);
  });

  it("matches events by their strongest score driver including ties", () => {
    const event = makeEvent({
      scoreBreakdown: {
        rankingScore: 20,
        productScore: 10,
        promoScore: 20,
        brandScore: 5,
        riskScore: 0,
        reasons: []
      }
    });

    expect(isActionScoreDriverMatch(event, "rankingScore")).toBe(true);
    expect(isActionScoreDriverMatch(event, "promoScore")).toBe(true);
    expect(isActionScoreDriverMatch(event, "productScore")).toBe(false);
    expect(isActionScoreDriverMatch(event, "riskScore")).toBe(false);
  });
});
