import { describe, expect, it } from "vitest";
import type { InsightEvent, InsightEventLevel, InsightEventStatus } from "@amazon-monitor/shared";
import { buildActionRecommendationSummary } from "./actionCenterRecommendation";

type EventOverrides = Partial<Omit<InsightEvent, "eventLevel" | "status">> & {
  eventLevel?: InsightEventLevel;
  status?: InsightEventStatus;
};

function makeEvent(overrides: EventOverrides = {}): InsightEvent {
  return {
    id: overrides.id ?? "event-1",
    eventDate: "2026-06-30",
    asin: "B000TEST",
    brand: "Acme",
    categoryId: 1,
    keywordId: null,
    eventType: "CORE_COMPETITOR_RISK",
    eventLevel: overrides.eventLevel ?? "P1",
    eventTitle: "Acme gained rank",
    eventSummary: "Acme gained rank in the monitored category.",
    attributionTags: [],
    evidence: {
      marketplace: "US",
      evidenceItems: []
    },
    scoreTotal: 80,
    scoreLevel: "A",
    scoreBreakdown: {
      rankingScore: 24,
      productScore: 16,
      promoScore: 10,
      brandScore: 18,
      riskScore: 12,
      reasons: []
    },
    suggestedAction: overrides.suggestedAction ?? "Schedule a follow-up review.",
    status: overrides.status ?? "TODO",
    assignee: overrides.assignee ?? null,
    reviewDueDate: overrides.reviewDueDate ?? null,
    reviewResult: null,
    userNote: null,
    createdAt: "2026-06-30T08:00:00.000Z",
    updatedAt: "2026-06-30T08:00:00.000Z",
    ...overrides,
    orgId: overrides.orgId ?? 1
  };
}

describe("action center recommendation summary", () => {
  it("marks overdue review actions as urgent", () => {
    const summary = buildActionRecommendationSummary(
      makeEvent({ reviewDueDate: "2026-06-28", assignee: "Ada" }),
      "2026-06-30"
    );

    expect(summary).toMatchObject({
      ownerLabel: "Ada",
      reviewDueLabel: "Overdue since 06-28",
      reviewDueState: "overdue",
      alertType: "error"
    });
  });

  it("uses warning tone for due-today and P0 events", () => {
    expect(buildActionRecommendationSummary(
      makeEvent({ reviewDueDate: "2026-06-30" }),
      "2026-06-30"
    )).toMatchObject({
      reviewDueLabel: "Due today",
      alertType: "warning"
    });

    expect(buildActionRecommendationSummary(
      makeEvent({ eventLevel: "P0" }),
      "2026-06-30"
    ).alertType).toBe("warning");
  });

  it("falls back cleanly when ownership, schedule, or action copy is missing", () => {
    const summary = buildActionRecommendationSummary(
      makeEvent({ suggestedAction: "   ", status: "FOLLOWED" }),
      "2026-06-30"
    );

    expect(summary).toMatchObject({
      ownerLabel: "Unassigned",
      reviewDueLabel: "No review scheduled",
      suggestedAction: "Review the evidence before taking action.",
      alertType: "success"
    });
  });
});
