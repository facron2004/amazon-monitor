import { describe, expect, it } from "vitest";
import {
  insightReviewResultLabels,
  type AttributionTag,
  type InsightEvent,
  type InsightEvidence,
  type InsightEventLevel,
  type InsightEventStatus,
  type InsightReviewResult
} from "@amazon-monitor/shared";
import { buildReviewOutcomeSummary } from "./actionCenterReviewOutcomes";

type EventOverrides = Partial<Omit<InsightEvent, "attributionTags" | "evidence" | "eventLevel" | "status" | "reviewResult">> & {
  attributionTags?: AttributionTag[];
  eventLevel?: InsightEventLevel;
  evidence?: Partial<InsightEvidence>;
  reviewResult?: InsightReviewResult | null;
  status?: InsightEventStatus;
};

function makeEvent(overrides: EventOverrides = {}): InsightEvent {
  const { attributionTags, eventLevel, evidence, reviewResult, status, ...rest } = overrides;
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
    reviewResult: reviewResult ?? null,
    userNote: null,
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: rest.updatedAt ?? "2026-06-30T00:00:00.000Z",
    ...rest,
    orgId: rest.orgId ?? 1
  };
}

describe("action center review outcomes", () => {
  it("aggregates reviewed events by review result", () => {
    const summary = buildReviewOutcomeSummary([
      makeEvent({ id: "confirmed", status: "REVIEWED", reviewResult: "CONFIRMED", eventLevel: "P0", scoreTotal: 90 }),
      makeEvent({ id: "continuing", status: "REVIEWED", reviewResult: "CONTINUING", scoreTotal: 80 }),
      makeEvent({ id: "reverted", status: "REVIEWED", reviewResult: "REVERTED", scoreTotal: 70 }),
      makeEvent({ id: "pending", status: "REVIEW_PENDING", reviewDueDate: "2026-06-30", scoreTotal: 60 })
    ], "2026-06-30");

    expect(summary.reviewedCount).toBe(3);
    expect(summary.pendingReviewCount).toBe(1);
    expect(summary.dueNowCount).toBe(1);
    expect(summary.validatedCount).toBe(2);
    expect(summary.validatedPercent).toBe(67);
    expect(summary.health).toMatchObject({
      reviewedCount: 3,
      pendingReviewCount: 1,
      dueNowCount: 1,
      validatedPercent: 67,
      pendingPercent: 25,
      topOutcomeLabel: insightReviewResultLabels.CONFIRMED,
      healthLabel: "1 个待复盘",
      healthTone: "warning"
    });
    expect(summary.rows.map((row) => [row.result, row.count, row.percent, row.tone])).toEqual([
      ["CONFIRMED", 1, 33, "success"],
      ["CONTINUING", 1, 33, "success"],
      ["REVERTED", 1, 33, "warning"]
    ]);
  });

  it("keeps the highest score event as the top signal for each outcome", () => {
    const summary = buildReviewOutcomeSummary([
      makeEvent({ id: "low", eventTitle: "Low score confirmed", status: "REVIEWED", reviewResult: "CONFIRMED", scoreTotal: 40 }),
      makeEvent({ id: "high", eventTitle: "High score confirmed", status: "REVIEWED", reviewResult: "CONFIRMED", scoreTotal: 90 })
    ], "2026-06-30");

    expect(summary.rows[0]).toMatchObject({
      result: "CONFIRMED",
      count: 2,
      percent: 100,
      topEventId: "high",
      topEventTitle: "High score confirmed",
      totalScore: 130
    });
    expect(summary.health).toMatchObject({
      topOutcomeLabel: insightReviewResultLabels.CONFIRMED,
      healthLabel: "复盘成立",
      healthTone: "success"
    });
  });

  it("returns an empty outcome list when nothing has been reviewed", () => {
    const summary = buildReviewOutcomeSummary([
      makeEvent({ id: "todo", status: "TODO" }),
      makeEvent({ id: "due", status: "REVIEW_PENDING", reviewDueDate: "2026-06-29" })
    ], "2026-06-30");

    expect(summary).toMatchObject({
      reviewedCount: 0,
      pendingReviewCount: 1,
      dueNowCount: 1,
      validatedCount: 0,
      validatedPercent: 0,
      health: {
        reviewedCount: 0,
        pendingReviewCount: 1,
        dueNowCount: 1,
        validatedPercent: 0,
        pendingPercent: 100,
        topOutcomeLabel: "-",
        healthLabel: "1 个待复盘",
        healthTone: "warning"
      },
      rows: []
    });
  });

  it("flags reviewed outcomes with low validation as needing action", () => {
    const summary = buildReviewOutcomeSummary([
      makeEvent({ id: "failed", status: "REVIEWED", reviewResult: "FAILED", scoreTotal: 90 }),
      makeEvent({ id: "unclear", status: "REVIEWED", reviewResult: "UNCLEAR", scoreTotal: 80 })
    ], "2026-06-30");

    expect(summary.health).toMatchObject({
      validatedPercent: 0,
      pendingPercent: 0,
      topOutcomeLabel: insightReviewResultLabels.FAILED,
      healthLabel: "需要处理",
      healthTone: "danger"
    });
  });
});
