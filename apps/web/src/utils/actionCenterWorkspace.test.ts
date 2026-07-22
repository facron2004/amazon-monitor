import { describe, expect, it } from "vitest";
import type {
  AsinWatchState,
  InsightEvent,
  InsightEvidence,
} from "@amazon-monitor/shared";
import {
  actionCenterColumnForStatus,
  buildReviewDueKpiDetail,
  countHighRiskCoreCompetitors,
  countWatchingAsins,
  uniqueInsightAsinCount,
} from "./actionCenterWorkspace.js";

type EventOverrides = Partial<Omit<InsightEvent, "evidence">> & {
  evidence?: Partial<InsightEvidence>;
};

function makeEvent(overrides: EventOverrides = {}): InsightEvent {
  const { evidence, ...rest } = overrides;
  return {
    id: rest.id ?? "event-1",
    orgId: 1,
    eventDate: "2026-07-22",
    asin: rest.asin ?? "B000TEST",
    brand: "Acme",
    categoryId: 1,
    keywordId: null,
    eventType: rest.eventType ?? "CORE_COMPETITOR_RISK",
    eventLevel: rest.eventLevel ?? "P1",
    eventTitle: "Competitor movement",
    eventSummary: "Competitor gained rank.",
    attributionTags: [],
    evidence: {
      marketplace: "US",
      isCoreCompetitor: true,
      evidenceItems: [],
      ...evidence,
    },
    scoreTotal: 80,
    scoreLevel: "A",
    scoreBreakdown: {
      rankingScore: 30,
      productScore: 16,
      promoScore: 12,
      brandScore: 12,
      riskScore: 10,
      reasons: [],
    },
    suggestedAction: "Review competitor movement.",
    status: rest.status ?? "TODO",
    assignee: null,
    reviewDueDate: rest.reviewDueDate ?? null,
    reviewResult: null,
    userNote: null,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    ...rest,
  };
}

function watchState(
  asin: string,
  watchLevel: AsinWatchState["watchLevel"],
): AsinWatchState {
  return {
    orgId: 1,
    asin,
    watchLevel,
    watchReason: null,
    firstWatchDate: "2026-07-20",
    lastEventDate: "2026-07-22",
    note: null,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
  };
}

describe("action center workspace", () => {
  it("maps every event status into the three workflow columns", () => {
    expect(actionCenterColumnForStatus("TODO")).toBe("todo");
    expect(actionCenterColumnForStatus("WATCHING")).toBe("mid");
    expect(actionCenterColumnForStatus("REVIEW_PENDING")).toBe("mid");
    expect(actionCenterColumnForStatus("FOLLOWED")).toBe("closed");
    expect(actionCenterColumnForStatus("REVIEWED")).toBe("closed");
    expect(actionCenterColumnForStatus("IGNORED")).toBe("closed");
  });

  it("deduplicates watched and high-risk ASINs across states and events", () => {
    const events = [
      makeEvent({ id: "one", asin: "A", status: "WATCHING" }),
      makeEvent({ id: "two", asin: "A", eventLevel: "P0" }),
      makeEvent({ id: "three", asin: "B", eventLevel: "P2" }),
    ];

    expect(uniqueInsightAsinCount(events)).toBe(2);
    expect(
      countWatchingAsins(
        [
          watchState("A", "CORE"),
          watchState("B", "IGNORED"),
          watchState("C", "NORMAL"),
        ],
        events,
      ),
    ).toBe(2);
    expect(countHighRiskCoreCompetitors(events)).toBe(1);
  });

  it("summarizes overdue and same-day review pressure", () => {
    const events = [
      makeEvent({ id: "overdue", reviewDueDate: "2026-07-21" }),
      makeEvent({ id: "today", reviewDueDate: "2026-07-22" }),
      makeEvent({ id: "future", reviewDueDate: "2026-07-23" }),
    ];

    expect(buildReviewDueKpiDetail(events, "2026-07-22")).toBe(
      "逾期 1 / 今日 1",
    );
    expect(buildReviewDueKpiDetail([], "2026-07-22")).toBe("暂无到期");
  });
});
