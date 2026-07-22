import { describe, expect, it } from "vitest";
import type {
  InsightEvent,
  InsightEventLevel,
  InsightEventStatus,
  InsightEventType
} from "@amazon-monitor/shared";
import { attributionTagLabels } from "@amazon-monitor/shared";
import {
  getActionSignalFlowRows,
  getActionSignalFlowStageRows,
  getActionSignalFlowSummary
} from "./actionCenterSignalFlow";

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
    ...overrides,
    orgId: overrides.orgId ?? 1
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
      brandLabel: "未知品牌",
      asinLabel: "无 ASIN",
      timestampLabel: "06-30 12:34",
      actionStageLabel: "待分配",
      nextActionLabel: "先分配负责人，再推进下一步。",
      scorePercent: 100
    });
  });

  it("adds an evidence driver and next action for the rendered signal flow", () => {
    const rows = getActionSignalFlowRows([
      makeEvent({
        id: "due",
        attributionTags: ["COUPON_DRIVEN"],
        assignee: "Ada",
        reviewDueDate: "2026-06-29",
        status: "REVIEW_PENDING",
        suggestedAction: "Check whether the coupon lift held."
      }),
      makeEvent({
        id: "assigned",
        attributionTags: [],
        assignee: "Lin",
        status: "TODO",
        suggestedAction: "Watch the ASIN for 3 days."
      })
    ], "2026-06-30");

    expect(rows[0]).toMatchObject({
      id: "due",
      actionStageLabel: "立即复盘",
      actionStageTone: "danger",
      driverLabel: "Coupon 驱动",
      nextActionLabel: "打开事件并核对复盘证据。"
    });
    expect(rows[1]).toMatchObject({
      id: "assigned",
      actionStageLabel: "可执行",
      actionStageTone: "warning",
      driverLabel: attributionTagLabels.NO_CLEAR_DRIVER,
      nextActionLabel: "Watch the ASIN for 3 days."
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

  it("summarizes the visible signal flow pressure", () => {
    const summary = getActionSignalFlowSummary([
      makeEvent({ id: "due", eventLevel: "P2", scoreTotal: 30, reviewDueDate: "2026-06-29" }),
      makeEvent({ id: "p0", eventLevel: "P0", scoreTotal: 90 }),
      makeEvent({ id: "p1", eventLevel: "P1", scoreTotal: 60 })
    ], "2026-06-30", 2);

    expect(summary).toEqual({
      totalCount: 3,
      renderedCount: 2,
      dueNowCount: 1,
      p0Count: 1,
      averageScore: 60,
      averageScorePercent: 60,
      pressureLabel: "1 个待复盘",
      pressureTone: "danger"
    });
  });

  it("builds stage rows for the visible operational flow", () => {
    const rows = getActionSignalFlowStageRows([
      makeEvent({ id: "due", status: "TODO", reviewDueDate: "2026-06-29" }),
      makeEvent({ id: "unassigned", status: "TODO" }),
      makeEvent({ id: "ready", status: "TODO", assignee: "Ada" }),
      makeEvent({ id: "watching", status: "WATCHING", assignee: "Ada" }),
      makeEvent({ id: "scheduled", status: "REVIEW_PENDING", assignee: "Ada", reviewDueDate: "2026-07-03" }),
      makeEvent({ id: "closed", status: "REVIEWED", assignee: "Ada" })
    ], "2026-06-30");

    expect(rows.map((row) => [row.key, row.count, row.percent, row.tone])).toEqual([
      ["reviewDue", 1, 17, "danger"],
      ["unassigned", 1, 17, "warning"],
      ["ready", 1, 17, "warning"],
      ["watching", 1, 17, "info"],
      ["scheduled", 1, 17, "info"],
      ["closed", 1, 17, "success"]
    ]);
  });

  it("reports high-score and empty flow states", () => {
    expect(getActionSignalFlowSummary([
      makeEvent({ id: "high", eventLevel: "P1", scoreTotal: 80 })
    ], "2026-06-30")).toMatchObject({
      pressureLabel: "高分信息流",
      pressureTone: "warning",
      averageScore: 80
    });

    expect(getActionSignalFlowSummary([], "2026-06-30")).toMatchObject({
      totalCount: 0,
      renderedCount: 0,
      pressureLabel: "暂无可见信息流",
      pressureTone: "info",
      averageScore: 0
    });
  });
});
