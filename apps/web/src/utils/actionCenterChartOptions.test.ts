import { describe, expect, it } from "vitest";
import {
  attributionTagLabels,
  strategyTagLabels,
  type AttributionTag,
  type InsightEvent,
  type InsightEvidence,
  type InsightEventLevel,
  insightEventTypeLabels,
  insightReviewResultLabels,
  type InsightEventStatus,
  type StrategyTag
} from "@amazon-monitor/shared";
import {
  buildActionTrendChartOption,
  buildAttributionDriverChartOption,
  buildEvidenceMovementChartOption,
  buildEventTypeMixChartOption,
  buildPriorityMixChartOption,
  buildBrandActionPressureChartOption,
  buildReviewCadenceChartOption,
  buildReviewOutcomeMixChartOption,
  buildScoreCompositionChartOption,
  buildStrategyFocusChartOption,
  buildWorkflowFunnelChartOption,
  getActionChartCaptions,
  getActionChartPathSteps,
  getActionChartSummary,
  getActionChartTakeaways,
  getActionReviewQueueSummary,
  getAttributionDriverData,
  getBrandActionPressureRows,
  getEvidenceMovementData,
  getEventTypeMixData,
  getPriorityMixData,
  getReviewCadenceChartData,
  getReviewOutcomeMixData,
  getStrategyFocusData,
  getStrategyFocusRows,
  getWorkflowFunnelData,
  shouldPreferFollowUpChartGroup
} from "./actionCenterChartOptions";

interface ChartOption {
  xAxis?: { data?: string[]; axisLabel?: { formatter?: (value: number | string) => string } };
  yAxis?: { data?: string[] };
  series: Array<{ name?: string; data: unknown[] }>;
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
      { name: "待处理", value: 1 },
      { name: "处理中", value: 2 },
      { name: "已关闭", value: 1 }
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

  it("builds event-type mix bars for visible signals", () => {
    const typeEvents: InsightEvent[] = [
      makeEvent({ id: "core-1", eventType: "CORE_COMPETITOR_RISK" }),
      makeEvent({ id: "core-2", eventType: "CORE_COMPETITOR_RISK" }),
      makeEvent({ id: "coupon-1", eventType: "COUPON_ADDED" })
    ];

    expect(getEventTypeMixData(typeEvents)).toEqual([
      { name: insightEventTypeLabels.CORE_COMPETITOR_RISK, value: 2 },
      { name: insightEventTypeLabels.COUPON_ADDED, value: 1 }
    ]);
    expect(getEventTypeMixData([])).toEqual([{ name: "暂无事件类型", value: 0 }]);

    const option = buildEventTypeMixChartOption(typeEvents) as ChartOption;
    expect(option.yAxis?.data).toEqual([
      insightEventTypeLabels.COUPON_ADDED,
      insightEventTypeLabels.CORE_COMPETITOR_RISK
    ]);
    expect(option.series[0]?.data).toEqual([
      { name: insightEventTypeLabels.COUPON_ADDED, value: 1 },
      { name: insightEventTypeLabels.CORE_COMPETITOR_RISK, value: 2 }
    ]);
  });

  it("builds evidence-driver distribution from attribution tags", () => {
    const driverEvents: InsightEvent[] = [
      makeEvent({ id: "price", attributionTags: ["PRICE_DRIVEN"], scoreTotal: 70 }),
      makeEvent({ id: "price-coupon", attributionTags: ["PRICE_DRIVEN", "COUPON_DRIVEN"], scoreTotal: 80 }),
      makeEvent({ id: "unclear", attributionTags: [], scoreTotal: 60 })
    ];

    const rows = getAttributionDriverData(driverEvents);
    expect(rows).toEqual([
      { name: attributionTagLabels.PRICE_DRIVEN, value: 2 },
      { name: attributionTagLabels.COUPON_DRIVEN, value: 1 },
      { name: attributionTagLabels.NO_CLEAR_DRIVER, value: 1 }
    ]);

    const option = buildAttributionDriverChartOption(driverEvents) as ChartOption;
    expect(option.yAxis?.data).toEqual([
      attributionTagLabels.NO_CLEAR_DRIVER,
      attributionTagLabels.COUPON_DRIVEN,
      attributionTagLabels.PRICE_DRIVEN
    ]);
    expect(option.series[0]?.data).toEqual([
      { name: attributionTagLabels.NO_CLEAR_DRIVER, value: 1 },
      { name: attributionTagLabels.COUPON_DRIVEN, value: 1 },
      { name: attributionTagLabels.PRICE_DRIVEN, value: 2 }
    ]);
  });

  it("builds evidence movement bars from pressure-building deltas", () => {
    const movementEvents: InsightEvent[] = [
      makeEvent({
        id: "rank-price-review",
        evidence: {
          previousRank: 80,
          currentRank: 18,
          priceBefore: 29.99,
          priceAfter: 24.99,
          reviewCountBefore: 20,
          reviewCountAfter: 42
        }
      }),
      makeEvent({
        id: "rank-only",
        evidence: {
          previousRank: 70,
          currentRank: 40,
          priceBefore: 24.99,
          priceAfter: 26.99,
          reviewCountBefore: 42,
          reviewCountAfter: 42
        }
      })
    ];

    expect(getEvidenceMovementData(movementEvents)).toEqual([
      { name: "BSR 上升", value: 2 },
      { name: "价格下探", value: 1 },
      { name: "Review 增长", value: 1 }
    ]);

    const option = buildEvidenceMovementChartOption(movementEvents) as ChartOption;
    expect(option.yAxis?.data).toEqual(["Review 增长", "价格下探", "BSR 上升"]);
    expect(option.series[0]?.data).toEqual([
      expect.objectContaining({ name: "Review 增长", value: 1 }),
      expect.objectContaining({ name: "价格下探", value: 1 }),
      expect.objectContaining({ name: "BSR 上升", value: 2 })
    ]);
  });

  it("builds a stacked score composition chart from visible event scores", () => {
    const scoreEvents: InsightEvent[] = [
      makeEvent({
        scoreBreakdown: {
          rankingScore: 20,
          productScore: 10,
          promoScore: 5,
          brandScore: 5,
          riskScore: 0,
          reasons: []
        }
      }),
      makeEvent({
        scoreBreakdown: {
          rankingScore: 10,
          productScore: 15,
          promoScore: 0,
          brandScore: 5,
          riskScore: 5,
          reasons: []
        }
      })
    ];

    const option = buildScoreCompositionChartOption(scoreEvents) as ChartOption;
    expect(option.series.map((series) => series.data)).toEqual([[30], [25], [5], [10], [5]]);
    expect(option.xAxis?.axisLabel?.formatter?.(2500)).toBe("2.5k");
  });

  it("summarizes the active chart scope for the chart board", () => {
    const summary = getActionChartSummary([
      makeEvent({
        id: "ranking",
        status: "TODO",
        reviewResult: null,
        evidence: { currentRank: 8, previousRank: 22, rankChange: 14, strategyTags: ["HIGH_THREAT_CORE"] },
        scoreBreakdown: {
          rankingScore: 35,
          productScore: 5,
          promoScore: 0,
          brandScore: 0,
          riskScore: 0,
          reasons: []
        }
      }),
      makeEvent({
        id: "reviewed",
        status: "REVIEWED",
        reviewResult: "CONFIRMED",
        evidence: { reviewCountBefore: 100, reviewCountAfter: 145 },
        scoreBreakdown: {
          rankingScore: 5,
          productScore: 8,
          promoScore: 0,
          brandScore: 0,
          riskScore: 0,
          reasons: []
        }
      })
    ], [
      { date: "2026-06-24", totalCount: 4, openCount: 3, closedCount: 1, p0Count: 1, reviewDueCount: 1, reviewedCount: 0, validatedCount: 0 },
      { date: "2026-06-30", totalCount: 7, openCount: 4, closedCount: 3, p0Count: 2, reviewDueCount: 2, reviewedCount: 1, validatedCount: 1 }
    ]);

    expect(summary.visibleCount).toBe(2);
    expect(summary.openCount).toBe(1);
    expect(summary.reviewedCount).toBe(1);
    expect(summary.topScoreDriver).toMatchObject({ key: "rankingScore", label: "排名动能", value: 40 });
    expect(summary.topEvidenceMovement).toMatchObject({ filter: "rankGain", label: "BSR 上升", value: 2 });
    expect(summary.topBrandPressure).toMatchObject({
      brand: "Acme",
      value: 88,
      eventCount: 1,
      p0Count: 0,
      matrixSurgeCount: 0,
      matrixDropCount: 0,
      brandTop100ShareChange: null,
      canFocus: true
    });
    expect(summary.topStrategyFocus).toMatchObject({
      tag: "HIGH_THREAT_CORE",
      label: strategyTagLabels.HIGH_THREAT_CORE,
      value: 1
    });
    expect(summary.latestTrend?.date).toBe("2026-06-30");
    expect(summary.trendDelta).toBe(3);
  });

  it("builds reader-facing captions for the chart board", () => {
    const chartEvents: InsightEvent[] = [
      makeEvent({
        id: "ranking",
        status: "TODO",
        eventLevel: "P0",
        attributionTags: ["PRICE_DRIVEN"],
        reviewDueDate: "2026-06-30",
        evidence: { currentRank: 8, previousRank: 22, rankChange: 14, strategyTags: ["HIGH_THREAT_CORE"] }
      }),
      makeEvent({
        id: "reviewed",
        status: "REVIEWED",
        eventLevel: "P1",
        reviewResult: "CONFIRMED",
        evidence: { reviewCountBefore: 100, reviewCountAfter: 145 }
      })
    ];

    const captions = getActionChartCaptions(chartEvents, [
      makeEvent({ id: "due", status: "TODO", eventLevel: "P0", reviewDueDate: "2026-06-28" })
    ], [
      { date: "2026-06-24", totalCount: 4, openCount: 3, closedCount: 1, p0Count: 1, reviewDueCount: 1, reviewedCount: 0, validatedCount: 0 },
      { date: "2026-06-30", totalCount: 7, openCount: 4, closedCount: 3, p0Count: 2, reviewDueCount: 2, reviewedCount: 1, validatedCount: 1 }
    ], "2026-06-30");

    expect(captions.workflow).toBe("1 个打开 / 1 个已复盘 / 2 条可见");
    expect(captions.priority).toBe("P0 1 / P1 1 / P2 0");
    expect(captions.brandPressure).toBe("Acme: 88 打开分 / 1 条事件");
    expect(captions.eventType).toBe(`${insightEventTypeLabels.CORE_COMPETITOR_RISK}: 2 条信号`);
    expect(captions.attribution).toBe(`${attributionTagLabels.PRICE_DRIVEN}: 1 条信号`);
    expect(captions.strategy).toBe(`${strategyTagLabels.LOW_PRICE_RANKING}: 1 条策略信号`);
    expect(captions.reviewCadence).toBe("1 个逾期 / 100% 需立即复盘 / 2 条排队");
    expect(captions.trend).toBe("最新 06-30: 7 条信号 / +3 条信号");
    expect(captions.reviewOutcome).toBe("1 个已复盘 / 100% 成立");
  });

  it("builds action takeaways from chart data", () => {
    const chartEvents: InsightEvent[] = [
      makeEvent({
        id: "ranking",
        status: "TODO",
        eventLevel: "P0",
        reviewDueDate: "2026-06-30",
        evidence: { currentRank: 8, previousRank: 22, rankChange: 14, strategyTags: ["HIGH_THREAT_CORE"] }
      }),
      makeEvent({
        id: "reviewed",
        status: "REVIEWED",
        eventLevel: "P1",
        reviewResult: "CONFIRMED",
        evidence: { reviewCountBefore: 100, reviewCountAfter: 145 }
      })
    ];

    expect(getActionChartTakeaways(chartEvents, [
      makeEvent({ id: "due", status: "TODO", eventLevel: "P0", reviewDueDate: "2026-06-28" })
    ], [
      { date: "2026-06-24", totalCount: 4, openCount: 3, closedCount: 1, p0Count: 1, reviewDueCount: 1, reviewedCount: 0, validatedCount: 0 },
      { date: "2026-06-30", totalCount: 7, openCount: 4, closedCount: 3, p0Count: 2, reviewDueCount: 2, reviewedCount: 1, validatedCount: 1 }
    ], "2026-06-30")).toEqual([
      {
        key: "pressure",
        label: "压力",
        title: "Acme 打开压力最高",
        detail: "88 打开分 / 1 条事件 / 1 P0",
        tone: "error",
        actionLabel: "筛选品牌"
      },
      {
        key: "driver",
        label: "驱动",
        title: "排名动能 + BSR 上升",
        detail: "34% 分数占比 / 2 条匹配信号",
        tone: "info",
        actionLabel: "筛选驱动"
      },
      {
        key: "followUp",
        label: "复盘",
        title: "1 个逾期复盘",
        detail: "2 个需立即复盘 / 2 个 P0",
        tone: "error",
        actionLabel: "打开复盘队列"
      }
    ]);
  });

  it("builds the chart action path from chart data", () => {
    const chartEvents: InsightEvent[] = [
      makeEvent({
        id: "ranking",
        status: "TODO",
        eventLevel: "P0",
        reviewDueDate: "2026-06-30",
        evidence: { currentRank: 8, previousRank: 22, rankChange: 14, strategyTags: ["HIGH_THREAT_CORE"] }
      }),
      makeEvent({
        id: "reviewed",
        status: "REVIEWED",
        eventLevel: "P1",
        reviewResult: "CONFIRMED",
        evidence: { reviewCountBefore: 100, reviewCountAfter: 145 }
      })
    ];

    expect(getActionChartPathSteps(chartEvents, [
      makeEvent({ id: "due", status: "TODO", eventLevel: "P0", reviewDueDate: "2026-06-28" })
    ], [
      { date: "2026-06-24", totalCount: 4, openCount: 3, closedCount: 1, p0Count: 1, reviewDueCount: 1, reviewedCount: 0, validatedCount: 0 },
      { date: "2026-06-30", totalCount: 7, openCount: 4, closedCount: 3, p0Count: 2, reviewDueCount: 2, reviewedCount: 1, validatedCount: 1 }
    ], "2026-06-30")).toEqual([
      {
        key: "scope",
        label: "范围",
        title: "2 条可见信号",
        detail: "1 个打开 / 1 个已复盘",
        status: "finish",
        actionLabel: "查看总览"
      },
      {
        key: "pressure",
        label: "压力",
        title: "Acme 打开压力最高",
        detail: "88 打开分 / 1 条事件 / 1 P0",
        status: "error",
        actionLabel: "筛选品牌"
      },
      {
        key: "driver",
        label: "驱动",
        title: "排名动能 + BSR 上升",
        detail: "34% 分数占比 / 2 条匹配信号",
        status: "process",
        actionLabel: "筛选驱动"
      },
      {
        key: "followUp",
        label: "复盘",
        title: "1 个逾期复盘",
        detail: "2 个需立即复盘 / 2 个 P0",
        status: "error",
        actionLabel: "打开复盘队列"
      }
    ]);
  });

  it("summarizes the review queue for the chart board", () => {
    const summary = getActionReviewQueueSummary([
      makeEvent({ id: "today", status: "REVIEW_PENDING", reviewDueDate: "2026-06-30", scoreTotal: 80 }),
      makeEvent({ id: "upcoming", status: "TODO", reviewDueDate: "2026-07-03", scoreTotal: 50 })
    ], [
      makeEvent({ id: "overdue", status: "TODO", eventLevel: "P0", reviewDueDate: "2026-06-28", scoreTotal: 90 }),
      makeEvent({ id: "today", status: "REVIEW_PENDING", reviewDueDate: "2026-06-30", scoreTotal: 80 })
    ], "2026-06-30");

    expect(summary).toEqual({
      totalCount: 3,
      dueNowCount: 2,
      overdueCount: 1,
      todayCount: 1,
      p0DueCount: 1,
      dueNowPercent: 67,
      healthLabel: "1 个逾期",
      healthTone: "danger"
    });
  });

  it("prefers the follow-up chart group only for review-queue-only data", () => {
    expect(shouldPreferFollowUpChartGroup([], [makeEvent({ reviewDueDate: "2026-07-03" })])).toBe(true);
    expect(shouldPreferFollowUpChartGroup([], [])).toBe(false);
    expect(shouldPreferFollowUpChartGroup([makeEvent()], [makeEvent({ reviewDueDate: "2026-07-03" })])).toBe(false);
  });

  it("infers and counts strategy tags before building the strategy chart", () => {
    const keyedRows = getStrategyFocusRows(events);
    const rows = getStrategyFocusData(events);
    const highThreat = rows.find((row) => row.name === strategyTagLabels.HIGH_THREAT_CORE);
    const lowPrice = rows.find((row) => row.name === strategyTagLabels.LOW_PRICE_RANKING);
    const expectedTags: StrategyTag[] = ["COUPON_DEPENDENT", "SHORT_SURGE_REVERSION"];

    expect(keyedRows.find((row) => row.tag === "HIGH_THREAT_CORE")).toMatchObject({
      name: strategyTagLabels.HIGH_THREAT_CORE,
      value: 1
    });
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
      makeEvent({
        id: "acme-1",
        brand: "Acme",
        eventType: "BRAND_MATRIX_DROP",
        status: "TODO",
        eventLevel: "P1",
        scoreTotal: 90,
        evidence: { brandTop100ShareChange: -0.4 }
      }),
      makeEvent({
        id: "acme-2",
        brand: "Acme",
        eventType: "CORE_COMPETITOR_RISK",
        attributionTags: ["BRAND_MATRIX_PUSH"],
        status: "WATCHING",
        eventLevel: "P0",
        scoreTotal: 70,
        evidence: { brandNewEntryCount: 2, brandTop100ShareChange: 0.2 }
      }),
      makeEvent({
        id: "beta-1",
        brand: "Beta",
        eventType: "BRAND_MATRIX_DROP",
        status: "REVIEW_PENDING",
        eventLevel: "P0",
        scoreTotal: 120,
        evidence: { brandTop100ShareChange: -0.1 }
      }),
      makeEvent({ id: "closed-1", brand: "Closed", status: "REVIEWED", eventLevel: "P0", scoreTotal: 999 })
    ];

    const rows = getBrandActionPressureRows(brandEvents);
    expect(rows).toEqual([
      {
        brand: "Acme",
        value: 160,
        eventCount: 2,
        p0Count: 1,
        matrixSurgeCount: 1,
        matrixDropCount: 1,
        brandTop100ShareChange: -0.4,
        topEventId: "acme-1",
        topEventTitle: "Acme gained rank",
        canFocus: true
      },
      {
        brand: "Beta",
        value: 120,
        eventCount: 1,
        p0Count: 1,
        matrixSurgeCount: 0,
        matrixDropCount: 1,
        brandTop100ShareChange: -0.1,
        topEventId: "beta-1",
        topEventTitle: "Acme gained rank",
        canFocus: true
      }
    ]);

    const option = buildBrandActionPressureChartOption(brandEvents) as ChartOption;
    expect(option.yAxis?.data).toEqual(["Beta", "Acme"]);
    expect(option.series[0]?.data).toEqual([
      {
        name: "Beta",
        value: 120,
        matrixSurgeCount: 0,
        matrixDropCount: 1,
        brandTop100ShareChange: -0.1,
        itemStyle: { color: "#dc2626" }
      },
      {
        name: "Acme",
        value: 160,
        matrixSurgeCount: 1,
        matrixDropCount: 1,
        brandTop100ShareChange: -0.4,
        itemStyle: { color: "#dc2626" }
      }
    ]);
  });

  it("builds review cadence buckets from visible and due-review events", () => {
    const visibleEvents: InsightEvent[] = [
      makeEvent({ id: "today", status: "TODO", reviewDueDate: "2026-06-30" }),
      makeEvent({ id: "upcoming", status: "REVIEW_PENDING", eventLevel: "P2", reviewDueDate: "2026-07-03" })
    ];
    const reviewDueEvents: InsightEvent[] = [
      makeEvent({ id: "overdue", status: "TODO", eventLevel: "P0", reviewDueDate: "2026-06-28" }),
      makeEvent({ id: "today", status: "TODO", reviewDueDate: "2026-06-30" })
    ];

    expect(getReviewCadenceChartData(visibleEvents, reviewDueEvents, "2026-06-30")).toEqual([
      { name: "已逾期", total: 1, P0: 1, P1: 0, P2: 0 },
      { name: "今日到期", total: 1, P0: 0, P1: 1, P2: 0 },
      { name: "待到期", total: 1, P0: 0, P1: 0, P2: 1 }
    ]);

    const option = buildReviewCadenceChartOption(visibleEvents, reviewDueEvents, "2026-06-30") as ChartOption;
    expect(option.series.map((series) => series.data)).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ]);
  });

  it("builds a closed-loop outcome mix from reviewed events", () => {
    const reviewedEvents: InsightEvent[] = [
      makeEvent({ id: "confirmed", status: "REVIEWED", reviewResult: "CONFIRMED" }),
      makeEvent({ id: "continuing", status: "REVIEWED", reviewResult: "CONTINUING" }),
      makeEvent({ id: "pending", status: "REVIEW_PENDING", reviewResult: null })
    ];

    expect(getReviewOutcomeMixData(reviewedEvents)).toEqual([
      { name: insightReviewResultLabels.CONFIRMED, value: 1 },
      { name: insightReviewResultLabels.CONTINUING, value: 1 }
    ]);

    const option = buildReviewOutcomeMixChartOption(reviewedEvents) as ChartOption;
    expect(option.series[0]?.data).toEqual([
      { name: insightReviewResultLabels.CONFIRMED, value: 1 },
      { name: insightReviewResultLabels.CONTINUING, value: 1 }
    ]);
  });

  it("returns an explicit empty outcome bucket when no events were reviewed", () => {
    expect(getReviewOutcomeMixData([makeEvent({ status: "TODO" })])).toEqual([
      { name: "暂无复盘结果", value: 0 }
    ]);
  });

  it("builds a multi-series action trend chart from daily trend points", () => {
    const option = buildActionTrendChartOption([
      { date: "2026-06-28", totalCount: 3, openCount: 2, closedCount: 1, reviewDueCount: 0, p0Count: 1, reviewedCount: 1, validatedCount: 1 },
      { date: "2026-06-29", totalCount: 5, openCount: 4, closedCount: 1, reviewDueCount: 2, p0Count: 2, reviewedCount: 0, validatedCount: 0 },
      { date: "2026-06-30", totalCount: 4, openCount: 1, closedCount: 3, reviewDueCount: 1, p0Count: 0, reviewedCount: 2, validatedCount: 1 }
    ]) as ChartOption;

    expect(option.xAxis?.data).toEqual(["06-28", "06-29", "06-30"]);
    expect(option.series.map((series) => [series.name, series.data])).toEqual([
      ["总信号", [3, 5, 4]],
      ["打开", [2, 4, 1]],
      ["待复盘", [0, 2, 1]],
      ["已复盘", [1, 0, 2]]
    ]);
  });
});
