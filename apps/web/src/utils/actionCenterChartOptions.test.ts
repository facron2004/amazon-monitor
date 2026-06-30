import { describe, expect, it } from "vitest";
import {
  strategyTagLabels,
  type AttributionTag,
  type InsightEvent,
  type InsightEvidence,
  type InsightEventLevel,
  type InsightEventStatus,
  type StrategyTag
} from "@amazon-monitor/shared";
import {
  buildPriorityMixChartOption,
  buildBrandActionPressureChartOption,
  buildReviewCadenceChartOption,
  buildStrategyFocusChartOption,
  buildWorkflowFunnelChartOption,
  getBrandActionPressureRows,
  getPriorityMixData,
  getReviewCadenceChartData,
  getStrategyFocusData,
  getWorkflowFunnelData
} from "./actionCenterChartOptions";

interface ChartOption {
  yAxis?: { data?: string[] };
  series: Array<{ data: unknown[] }>;
}

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
    asin: "B000TEST",
    brand: "Acme",
    categoryId: 1,
    keywordId: null,
    eventType: "CORE_COMPETITOR_RISK",
    eventLevel: eventLevel ?? "P1",
    eventTitle: "Acme gained rank",
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
    scoreTotal: 88,
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
    reviewResult: rest.reviewResult ?? null,
    userNote: null,
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...rest
  };
}

const events: InsightEvent[] = [
  makeEvent({
    id: "todo-p0",
    eventLevel: "P0",
    status: "TODO",
    evidence: { strategyTags: ["HIGH_THREAT_CORE"], isCoreCompetitor: true, currentRank: 8 }
  }),
  makeEvent({
    id: "watch-p1",
    eventLevel: "P1",
    status: "WATCHING",
    attributionTags: ["PRICE_DRIVEN"],
    evidence: { currentRank: 18, previousRank: 80, rankChange: 62 }
  }),
  makeEvent({
    id: "review-p2",
    eventLevel: "P2",
    status: "REVIEW_PENDING",
    attributionTags: ["COUPON_DRIVEN"],
    evidence: { currentRank: 55, rankChange: 5 }
  }),
  makeEvent({
    id: "closed-p1",
    eventLevel: "P1",
    status: "REVIEWED",
    attributionTags: ["PROMO_END_DROP"],
    reviewResult: "REVERTED",
    evidence: { strategyTags: ["SHORT_SURGE_REVERSION"] }
  })
];

describe("action center chart options", () => {
  it("aggregates statuses into the Action Center workflow buckets", () => {
    expect(getWorkflowFunnelData(events)).toEqual([
      { name: "Todo", value: 1 },
      { name: "In progress", value: 2 },
      { name: "Closed", value: 1 }
    ]);

    const option = buildWorkflowFunnelChartOption(events) as ChartOption;
    expect(option.series[0]?.data).toEqual([1, 2, 1]);
  });

  it("keeps priority mix in P0/P1/P2 order", () => {
    expect(getPriorityMixData(events)).toEqual([
      { name: "P0", value: 1 },
      { name: "P1", value: 2 },
      { name: "P2", value: 1 }
    ]);

    const option = buildPriorityMixChartOption(events) as ChartOption;
    expect(option.series[0]?.data).toEqual([
      { name: "P0", value: 1 },
      { name: "P1", value: 2 },
      { name: "P2", value: 1 }
    ]);
  });

  it("infers and counts strategy tags before building the strategy chart", () => {
    const rows = getStrategyFocusData(events);
    const highThreat = rows.find((row) => row.name === strategyTagLabels.HIGH_THREAT_CORE);
    const lowPrice = rows.find((row) => row.name === strategyTagLabels.LOW_PRICE_RANKING);
    const expectedTags: StrategyTag[] = ["COUPON_DEPENDENT", "SHORT_SURGE_REVERSION"];

    expect(highThreat?.value).toBe(1);
    expect(lowPrice?.value).toBe(1);
    for (const tag of expectedTags) {
      expect(rows).toContainEqual({ name: strategyTagLabels[tag], value: 1 });
    }

    const option = buildStrategyFocusChartOption(events) as ChartOption;
    expect(option.yAxis?.data?.length).toBe(rows.length);
    expect(option.series[0]?.data).toEqual(rows.map((row) => ({
      name: row.name,
      value: row.value
    })).reverse());
  });

  it("builds a brand pressure queue from unresolved visible events", () => {
    const brandEvents: InsightEvent[] = [
      makeEvent({ id: "acme-1", brand: "Acme", status: "TODO", eventLevel: "P1", scoreTotal: 90 }),
      makeEvent({ id: "acme-2", brand: "Acme", status: "WATCHING", eventLevel: "P0", scoreTotal: 70 }),
      makeEvent({ id: "beta-1", brand: "Beta", status: "REVIEW_PENDING", eventLevel: "P0", scoreTotal: 120 }),
      makeEvent({ id: "closed-1", brand: "Closed", status: "REVIEWED", eventLevel: "P0", scoreTotal: 999 })
    ];

    const rows = getBrandActionPressureRows(brandEvents);
    expect(rows).toEqual([
      {
        brand: "Acme",
        value: 160,
        eventCount: 2,
        p0Count: 1,
        topEventId: "acme-1",
        topEventTitle: "Acme gained rank",
        canFocus: true
      },
      {
        brand: "Beta",
        value: 120,
        eventCount: 1,
        p0Count: 1,
        topEventId: "beta-1",
        topEventTitle: "Acme gained rank",
        canFocus: true
      }
    ]);

    const option = buildBrandActionPressureChartOption(brandEvents) as ChartOption;
    expect(option.yAxis?.data).toEqual(["Beta", "Acme"]);
    expect(option.series[0]?.data).toEqual([
      { name: "Beta", value: 120 },
      { name: "Acme", value: 160 }
    ]);
  });

  it("builds review cadence buckets from visible and due-review events", () => {
    const visibleEvents: InsightEvent[] = [
      makeEvent({ id: "today", status: "TODO", reviewDueDate: "2026-06-30" }),
      makeEvent({ id: "upcoming", status: "REVIEW_PENDING", reviewDueDate: "2026-07-03" })
    ];
    const reviewDueEvents: InsightEvent[] = [
      makeEvent({ id: "overdue", status: "TODO", reviewDueDate: "2026-06-28" }),
      makeEvent({ id: "today", status: "TODO", reviewDueDate: "2026-06-30" })
    ];

    expect(getReviewCadenceChartData(visibleEvents, reviewDueEvents, "2026-06-30")).toEqual([
      { name: "Overdue", value: 1 },
      { name: "Today", value: 1 },
      { name: "Upcoming", value: 1 }
    ]);

    const option = buildReviewCadenceChartOption(visibleEvents, reviewDueEvents, "2026-06-30") as ChartOption;
    expect(option.series[0]?.data).toEqual([
      { name: "Overdue", value: 1 },
      { name: "Today", value: 1 },
      { name: "Upcoming", value: 1 }
    ]);
  });
});
