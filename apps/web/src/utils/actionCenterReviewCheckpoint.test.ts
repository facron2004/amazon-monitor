import { describe, expect, it } from "vitest";
import { insightReviewResultLabels, type InsightEvent, type InsightEvidence } from "@amazon-monitor/shared";
import { buildReviewCheckpointSummary } from "./actionCenterReviewCheckpoint";

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

describe("action center review checkpoint", () => {
  it("marks events without a schedule as needing review scheduling", () => {
    const summary = buildReviewCheckpointSummary(makeEvent(), "2026-07-01");

    expect(summary.label).toBe("Needs review schedule");
    expect(summary.tone).toBe("info");
    expect(summary.steps.map((step) => step.status)).toEqual(["success", "process", "wait", "wait"]);
  });

  it("marks overdue reviews as the active checkpoint", () => {
    const summary = buildReviewCheckpointSummary(makeEvent({
      assignee: "Ada",
      reviewDueDate: "2026-06-28"
    }), "2026-07-01");

    expect(summary.label).toBe("Review overdue");
    expect(summary.tone).toBe("danger");
    expect(summary.activeIndex).toBe(2);
    expect(summary.steps[2]).toMatchObject({
      title: "Review",
      description: "Overdue 06-28",
      status: "error"
    });
  });

  it("distinguishes due-today from future scheduled reviews", () => {
    const today = buildReviewCheckpointSummary(makeEvent({ reviewDueDate: "2026-07-01" }), "2026-07-01");
    const future = buildReviewCheckpointSummary(makeEvent({ reviewDueDate: "2026-07-04" }), "2026-07-01");

    expect(today.label).toBe("Review due today");
    expect(today.tone).toBe("warning");
    expect(today.steps[2]?.status).toBe("process");
    expect(future.label).toBe("Review scheduled");
    expect(future.tone).toBe("info");
    expect(future.steps[2]?.description).toBe("Review on 07-04");
  });

  it("marks reviewed or closed events as closed loop", () => {
    const summary = buildReviewCheckpointSummary(makeEvent({
      status: "REVIEWED",
      reviewResult: "CONFIRMED",
      assignee: "Ada"
    }), "2026-07-01");

    expect(summary.label).toBe("Closed loop");
    expect(summary.tone).toBe("success");
    expect(summary.activeIndex).toBe(3);
    expect(summary.steps.map((step) => step.status)).toEqual(["success", "success", "success", "success"]);
    expect(summary.steps[3]?.description).toBe(insightReviewResultLabels.CONFIRMED);
  });
});
