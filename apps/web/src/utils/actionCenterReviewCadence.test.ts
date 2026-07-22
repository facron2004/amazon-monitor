import { describe, expect, it } from "vitest";
import type {
  AttributionTag,
  InsightEvent,
  InsightEvidence,
  InsightEventLevel,
  InsightEventStatus
} from "@amazon-monitor/shared";
import {
  buildReviewCadenceSummary,
  isReviewCadenceBucketMatch
} from "./actionCenterReviewCadence";

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
    ...rest,
    orgId: rest.orgId ?? 1
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
      { key: "overdue", label: "已逾期", count: 1, p0Count: 1, p1Count: 0, p2Count: 0, totalScore: 90 },
      { key: "today", label: "今日到期", count: 1, p0Count: 0, p1Count: 1, p2Count: 0, totalScore: 70 },
      { key: "upcoming", label: "待到期", count: 1, p0Count: 0, p1Count: 0, p2Count: 1, totalScore: 50 }
    ]);
    expect(summary.health).toEqual({
      totalCount: 3,
      dueNowCount: 2,
      overdueCount: 1,
      todayCount: 1,
      upcomingCount: 1,
      p0DueCount: 1,
      totalScore: 210,
      dueNowPercent: 67,
      nextDueLabel: "07-02",
      healthLabel: "1 个逾期",
      healthTone: "danger"
    });
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

  it("summarizes scheduled and empty review queue health", () => {
    const scheduled = buildReviewCadenceSummary([
      makeEvent({ id: "future", status: "TODO", eventLevel: "P0", reviewDueDate: "2026-07-06", scoreTotal: 90 })
    ], [], "2026-06-29");

    expect(scheduled.health).toMatchObject({
      totalCount: 1,
      dueNowCount: 0,
      upcomingCount: 1,
      p0DueCount: 0,
      nextDueLabel: "07-06",
      healthLabel: "已排期",
      healthTone: "success"
    });

    expect(buildReviewCadenceSummary([], [], "2026-06-29").health).toMatchObject({
      totalCount: 0,
      dueNowCount: 0,
      dueNowPercent: 0,
      nextDueLabel: "-",
      healthLabel: "无复盘队列",
      healthTone: "info"
    });
  });

  it("matches individual events against a cadence bucket", () => {
    expect(isReviewCadenceBucketMatch(
      makeEvent({ id: "overdue", status: "TODO", reviewDueDate: "2026-06-27" }),
      "overdue",
      "2026-06-29"
    )).toBe(true);
    expect(isReviewCadenceBucketMatch(
      makeEvent({ id: "today", status: "REVIEW_PENDING", reviewDueDate: "2026-06-29" }),
      "today",
      "2026-06-29"
    )).toBe(true);
    expect(isReviewCadenceBucketMatch(
      makeEvent({ id: "upcoming", status: "TODO", reviewDueDate: "2026-07-02" }),
      "upcoming",
      "2026-06-29"
    )).toBe(true);
    expect(isReviewCadenceBucketMatch(
      makeEvent({ id: "watching", status: "WATCHING", reviewDueDate: "2026-06-29" }),
      "today",
      "2026-06-29"
    )).toBe(false);
  });
});
