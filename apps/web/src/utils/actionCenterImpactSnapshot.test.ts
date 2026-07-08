import { describe, expect, it } from "vitest";
import type { InsightEvent, InsightEvidence } from "@amazon-monitor/shared";
import { buildActionImpactSnapshotRows } from "./actionCenterImpactSnapshot";

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
    reviewResult: rest.reviewResult ?? null,
    userNote: null,
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...rest
  };
}

describe("action center impact snapshot", () => {
  it("summarizes BSR, price, and review impact metrics", () => {
    const rows = buildActionImpactSnapshotRows(makeEvent());

    expect(rows.map((row) => ({
      key: row.key,
      valueLabel: row.valueLabel,
      beforeLabel: row.beforeLabel,
      afterLabel: row.afterLabel,
      deltaLabel: row.deltaLabel,
      tone: row.tone,
      hasData: row.hasData
    }))).toEqual([
      {
        key: "rank",
        valueLabel: "#12",
        beforeLabel: "#30",
        afterLabel: "#12",
        deltaLabel: "+18 ranks",
        tone: "danger",
        hasData: true
      },
      {
        key: "price",
        valueLabel: "$24.99",
        beforeLabel: "$29.99",
        afterLabel: "$24.99",
        deltaLabel: "-$5.00",
        tone: "danger",
        hasData: true
      },
      {
        key: "review",
        valueLabel: "42",
        beforeLabel: "20",
        afterLabel: "42",
        deltaLabel: "+22 reviews",
        tone: "warning",
        hasData: true
      }
    ]);
  });

  it("falls back to previous and current BSR when explicit rank change is missing", () => {
    const rows = buildActionImpactSnapshotRows(makeEvent({
      evidence: {
        previousRank: 90,
        currentRank: 45,
        rankChange: null
      }
    }));

    expect(rows[0]).toMatchObject({
      key: "rank",
      valueLabel: "#45",
      deltaLabel: "+45 ranks",
      tone: "warning"
    });
  });

  it("marks missing metric values as unavailable", () => {
    const rows = buildActionImpactSnapshotRows(makeEvent({
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

    expect(rows).toEqual([
      expect.objectContaining({ key: "rank", valueLabel: "-", deltaLabel: "No data", hasData: false }),
      expect.objectContaining({ key: "price", valueLabel: "-", deltaLabel: "No data", hasData: false }),
      expect.objectContaining({ key: "review", valueLabel: "-", deltaLabel: "No data", hasData: false })
    ]);
  });

  it("adds a promo row when a deal or coupon is present", () => {
    const rows = buildActionImpactSnapshotRows(makeEvent({
      evidence: {
        couponBefore: "5% coupon",
        couponAfter: "10% coupon",
        dealType: "Prime Day Deal"
      }
    }));

    expect(rows[3]).toMatchObject({
      key: "promo",
      valueLabel: "Prime Day Deal",
      beforeLabel: "5% coupon",
      afterLabel: "Prime Day Deal",
      deltaLabel: "Deal active",
      tone: "warning",
      progress: 100
    });
  });
});
