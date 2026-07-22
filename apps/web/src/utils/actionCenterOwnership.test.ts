import { describe, expect, it } from "vitest";
import type {
  AttributionTag,
  InsightEvent,
  InsightEvidence,
  InsightEventLevel,
  InsightEventStatus
} from "@amazon-monitor/shared";
import {
  buildOwnershipLoadSummary,
  getOwnershipLoadRows
} from "./actionCenterOwnership";

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
    assignee: rest.assignee ?? null,
    reviewDueDate: rest.reviewDueDate ?? null,
    reviewResult: null,
    userNote: null,
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
    ...rest,
    orgId: rest.orgId ?? 1
  };
}

describe("action center ownership load", () => {
  it("aggregates unresolved events by assignee and unassigned queue", () => {
    const rows = getOwnershipLoadRows([
      makeEvent({ id: "alice-1", assignee: "Alice", eventLevel: "P1", status: "TODO", scoreTotal: 80 }),
      makeEvent({ id: "alice-2", assignee: "Alice", eventLevel: "P0", status: "REVIEW_PENDING", scoreTotal: 60, eventTitle: "P0 due" }),
      makeEvent({ id: "blank-1", assignee: "   ", eventLevel: "P2", status: "WATCHING", scoreTotal: 50 }),
      makeEvent({ id: "closed-1", assignee: "Alice", eventLevel: "P0", status: "REVIEWED", scoreTotal: 999 })
    ]);

    expect(rows).toEqual([
      {
        assignee: "Alice",
        label: "Alice",
        eventCount: 2,
        p0Count: 1,
        reviewPendingCount: 1,
        totalScore: 140,
        topEventId: "alice-2",
        topEventTitle: "P0 due"
      },
      {
        assignee: null,
        label: "Unassigned",
        eventCount: 1,
        p0Count: 0,
        reviewPendingCount: 0,
        totalScore: 50,
        topEventId: "blank-1",
        topEventTitle: "Acme gained rank"
      }
    ]);
  });

  it("keeps the highest pressure owners first", () => {
    const rows = getOwnershipLoadRows([
      makeEvent({ id: "alice", assignee: "Alice", scoreTotal: 50 }),
      makeEvent({ id: "bob", assignee: "Bob", eventLevel: "P0", scoreTotal: 90 }),
      makeEvent({ id: "unassigned", assignee: null, scoreTotal: 120 })
    ]);

    expect(rows.map((row) => row.label)).toEqual(["Unassigned", "Bob", "Alice"]);
  });

  it("summarizes owner coverage and unassigned pressure", () => {
    const summary = buildOwnershipLoadSummary([
      makeEvent({ id: "alice", assignee: "Alice", eventLevel: "P0", status: "REVIEW_PENDING", scoreTotal: 90 }),
      makeEvent({ id: "bob", assignee: "Bob", eventLevel: "P1", status: "TODO", scoreTotal: 50 }),
      makeEvent({ id: "blank", assignee: "  ", eventLevel: "P2", status: "WATCHING", scoreTotal: 40 }),
      makeEvent({ id: "closed", assignee: null, status: "REVIEWED", scoreTotal: 100 })
    ]);

    expect(summary).toEqual({
      openCount: 3,
      assignedCount: 2,
      unassignedCount: 1,
      ownerCount: 2,
      p0Count: 1,
      reviewPendingCount: 1,
      assignedPercent: 67,
      unassignedPercent: 33,
      topOwnerLabel: "Alice",
      topOwnerScore: 90,
      loadLabel: "1 unassigned",
      loadTone: "danger"
    });
  });

  it("distinguishes covered and empty ownership load", () => {
    expect(buildOwnershipLoadSummary([
      makeEvent({ id: "alice", assignee: "Alice", eventLevel: "P2", status: "TODO", scoreTotal: 40 })
    ])).toMatchObject({
      openCount: 1,
      assignedPercent: 100,
      unassignedPercent: 0,
      loadLabel: "Covered",
      loadTone: "success"
    });

    expect(buildOwnershipLoadSummary([
      makeEvent({ id: "closed", assignee: null, status: "REVIEWED", scoreTotal: 100 })
    ])).toMatchObject({
      openCount: 0,
      assignedPercent: 0,
      topOwnerLabel: "-",
      loadLabel: "No open load",
      loadTone: "info"
    });
  });
});
