import { describe, expect, it } from "vitest";
import type {
  InsightEvent,
  InsightEventLevel,
  InsightEventStatus,
  InsightEventType
} from "@amazon-monitor/shared";
import { getActionSignalFlowRows } from "./actionCenterSignalFlow";

type EventOverrides = Partial<Omit<InsightEvent, "eventLevel" | "eventType" | "status">> & {
  eventLevel?: InsightEventLevel;
  eventType?: InsightEventType;
  status?: InsightEventStatus;
};

function makeEvent(overrides: EventOverrides = {}): InsightEvent {
  return {
    id: overrides.id ?? "event-1",
    eventDate: overrides.eventDate ?? "2026-06-30",
    asin: overrides.asin ?? "B000TEST",
    brand: overrides.brand ?? "Acme",
    categoryId: 1,
    keywordId: null,
    eventType: overrides.eventType ?? "CORE_COMPETITOR_RISK",
    eventLevel: overrides.eventLevel ?? "P1",
    eventTitle: overrides.eventTitle ?? "Acme gained rank",
    eventSummary: overrides.eventSummary ?? "Acme gained rank in the monitored category.",
    attributionTags: [],
    evidence: {
      marketplace: "US",
      evidenceItems: []
    },
    scoreTotal: overrides.scoreTotal ?? 70,
    scoreLevel: "A",
    scoreBreakdown: {
      rankingScore: 20,
      productScore: 15,
      promoScore: 10,
      brandScore: 15,
      riskScore: 10,
      reasons: []
    },
    suggestedAction: "Review competitor movement.",
    status: overrides.status ?? "TODO",
    assignee: null,
    reviewDueDate: overrides.reviewDueDate ?? null,
    reviewResult: null,
    userNote: null,
    createdAt: overrides.createdAt ?? "2026-06-30T08:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-30T08:00:00.000Z",
    ...overrides
  };
}

describe("action center signal flow", () => {
  it("prioritizes due reviews before priority level, score, and recency", () => {
    const rows = getActionSignalFlowRows([
      makeEvent({ id: "p0-high", eventLevel: "P0", scoreTotal: 99, createdAt: "2026-06-30T10:00:00.000Z" }),
      makeEvent({ id: "due-p2", eventLevel: "P2", scoreTotal: 30, reviewDueDate: "2026-06-29" }),
      makeEvent({ id: "p1-fresh", eventLevel: "P1", scoreTotal: 80, createdAt: "2026-06-30T11:00:00.000Z" })
    ], "2026-06-30");

    expect(rows.map((row) => row.id)).toEqual(["due-p2", "p0-high", "p1-fresh"]);
    expect(rows[0]?.isReviewDue).toBe(true);
  });

  it("builds compact display rows with fallbacks and clamped score percentages", () => {
    const rows = getActionSignalFlowRows([
      makeEvent({
        id: "unknown-brand",
        asin: null,
        brand: "  ",
        scoreTotal: 118,
        createdAt: "2026-06-30T12:34:56.000Z"
      })
    ], "2026-06-30");

    expect(rows[0]).toMatchObject({
      id: "unknown-brand",
      brandLabel: "Unknown brand",
      asinLabel: "No ASIN",
      timestampLabel: "06-30 12:34",
      scorePercent: 100
    });
  });

  it("limits the rendered flow size", () => {
    const rows = getActionSignalFlowRows([
      makeEvent({ id: "one" }),
      makeEvent({ id: "two" }),
      makeEvent({ id: "three" })
    ], "2026-06-30", 2);

    expect(rows).toHaveLength(2);
  });
});
