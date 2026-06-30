import { describe, expect, it } from "vitest";
import type {
  AttributionTag,
  InsightEvent,
  InsightEvidence,
  InsightEventLevel,
  InsightEventStatus
} from "@amazon-monitor/shared";
import { buildReviewCadenceSummary } from "./actionCenterReviewCadence";

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
    reviewDueDate: rest.reviewDueDate ?? null,
    reviewResult: null,
    userNote: null,
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
    ...rest
  };
}

describe("action center review cadence", () => {
  it("merges visible and due events into overdue, today, and upcoming buckets", () => {
    const dueEvents = [
      makeEvent({ id: "overdue", eventLevel: "P0", reviewDueDate: "2026-06-27", scoreTotal: 90 }),
      makeEvent({ id: "today", eventLevel: "P1", reviewDueDate: "2026-06-29", scoreTotal: 70 })
    ];
    const visibleEvents = [
      makeEvent({ id: "today", eventLevel: "P1", reviewDueDate: "2026-06-29", scoreTotal: 70 }),
      makeEvent({ id: "upcoming", eventLevel: "P2", reviewDueDate: "2026-07-02", scoreTotal: 50 })
    ];

    const summary = buildReviewCadenceSummary(visibleEvents, dueEvents, "2026-06-29");

    expect(summary.buckets).toEqual([
      { key: "overdue", label: "Overdue", count: 1, p0Count: 1, totalScore: 90 },
      { key: "today", label: "Today", count: 1, p0Count: 0, totalScore: 70 },
      { key: "upcoming", label: "Upcoming", count: 1, p0Count: 0, totalScore: 50 }
    ]);
    expect(summary.rows.map((row) => [row.event.id, row.bucket, row.daysOffset])).toEqual([
      ["overdue", "overdue", -2],
      ["today", "today", 0],
      ["upcoming", "upcoming", 3]
    ]);
  });

  it("keeps the queue scoped to system-review statuses", () => {
    const summary = buildReviewCadenceSummary([
      makeEvent({ id: "todo", status: "TODO", reviewDueDate: "2026-06-29" }),
      makeEvent({ id: "pending", status: "REVIEW_PENDING", reviewDueDate: "2026-06-29" }),
      makeEvent({ id: "watching", status: "WATCHING", reviewDueDate: "2026-06-29" }),
      makeEvent({ id: "reviewed", status: "REVIEWED", reviewDueDate: "2026-06-29" }),
      makeEvent({ id: "no-date", status: "TODO", reviewDueDate: null })
    ], [], "2026-06-29");

    expect(summary.rows.map((row) => row.event.id)).toEqual(["todo", "pending"]);
    expect(summary.buckets.find((bucket) => bucket.key === "today")?.count).toBe(2);
  });
});
