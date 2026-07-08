import { describe, expect, it } from "vitest";
import type {
  AttributionTag,
  InsightEvent,
  InsightEvidence,
  InsightEventLevel,
  InsightEventStatus
} from "@amazon-monitor/shared";
import {
  getActionEvidenceDeltaRows,
  getActionEvidenceMovementRows
} from "./actionCenterEvidenceDeltas";

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
      currentRank: 18,
      previousRank: 80,
      rankChange: 62,
      priceBefore: 29.99,
      priceAfter: 24.99,
      priceChangeRate: -0.167,
      reviewCountBefore: 20,
      reviewCountAfter: 42,
      reviewCountChange: 22,
      isCoreCompetitor: false,
      evidenceItems: [],
      ...evidence
    },
    scoreTotal: rest.scoreTotal ?? 88,
    scoreLevel: "A",
    scoreBreakdown: rest.scoreBreakdown ?? {
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
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...rest
  };
}

describe("action center evidence deltas", () => {
  it("formats rank, price, and review pressure from event evidence", () => {
    const rows = getActionEvidenceDeltaRows(makeEvent());

    expect(rows.map((row) => ({
      key: row.key,
      beforeLabel: row.beforeLabel,
      afterLabel: row.afterLabel,
      deltaLabel: row.deltaLabel,
      tone: row.tone,
      hasData: row.hasData
    }))).toEqual([
      {
        key: "rank",
        beforeLabel: "#80",
        afterLabel: "#18",
        deltaLabel: "+62 名",
        tone: "danger",
        hasData: true
      },
      {
        key: "price",
        beforeLabel: "$29.99",
        afterLabel: "$24.99",
        deltaLabel: "-$5.00",
        tone: "danger",
        hasData: true
      },
      {
        key: "review",
        beforeLabel: "20",
        afterLabel: "42",
        deltaLabel: "+22 条 Review",
        tone: "warning",
        hasData: true
      }
    ]);
  });

  it("marks easing pressure when rank falls back and price rises", () => {
    const rows = getActionEvidenceDeltaRows(makeEvent({
      evidence: {
        previousRank: 20,
        currentRank: 80,
        rankChange: -60,
        priceBefore: 24.99,
        priceAfter: 29.99,
        priceChangeRate: 0.2,
        reviewCountBefore: 42,
        reviewCountAfter: 42,
        reviewCountChange: 0
      }
    }));

    expect(rows.map((row) => [row.key, row.deltaLabel, row.tone])).toEqual([
      ["rank", "-60 名", "success"],
      ["price", "+$5.00", "success"],
      ["review", "0 条 Review", "info"]
    ]);
  });

  it("does not infer deltas when the supporting evidence is missing", () => {
    const rows = getActionEvidenceDeltaRows(makeEvent({
      evidence: {
        previousRank: null,
        currentRank: null,
        rankChange: null,
        priceBefore: null,
        priceAfter: null,
        priceChangeRate: null,
        reviewCountBefore: null,
        reviewCountAfter: null,
        reviewCountChange: null
      }
    }));

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "rank", deltaLabel: "无数据", hasData: false }),
      expect.objectContaining({ key: "price", deltaLabel: "无数据", hasData: false }),
      expect.objectContaining({ key: "review", deltaLabel: "无数据", hasData: false })
    ]));
  });

  it("counts pressure-building evidence movement across events", () => {
    const rows = getActionEvidenceMovementRows([
      makeEvent({
        id: "rank-price-review",
        evidence: {
          previousRank: 80,
          currentRank: 18,
          priceBefore: 29.99,
          priceAfter: 24.99,
          reviewCountBefore: 20,
          reviewCountAfter: 42
        }
      }),
      makeEvent({
        id: "rank-only",
        evidence: {
          previousRank: 70,
          currentRank: 40,
          priceBefore: 24.99,
          priceAfter: 26.99,
          reviewCountBefore: 42,
          reviewCountAfter: 42
        }
      }),
      makeEvent({
        id: "missing",
        evidence: {
          previousRank: null,
          currentRank: null,
          rankChange: null,
          priceBefore: null,
          priceAfter: null,
          reviewCountBefore: null,
          reviewCountAfter: null,
          reviewCountChange: null
        }
      })
    ]);

    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ["BSR 上升", 2],
      ["价格下探", 1],
      ["Review 增长", 1]
    ]);
  });
});
