import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { AsinWatchState, InsightEvent, InsightEventNote } from "@amazon-monitor/shared";
import { insightEventApi } from "../api-insight-events";
import {
  buildInsightEventListQuery,
  buildInsightEventReviewDueQuery,
  filterAndSortEvents,
  groupEventsByAsin,
  useInsightEventsStore,
  type InsightEventFilters
} from "../stores/insightEvents";

function buildEvent(overrides: Partial<InsightEvent> = {}): InsightEvent {
  return {
    id: overrides.id ?? "evt-1",
    eventDate: "2026-06-24",
    asin: overrides.asin ?? "B000TEST",
    brand: overrides.brand ?? "TestBrand",
    categoryId: 1,
    keywordId: null,
    eventType: overrides.eventType ?? "RANK_SURGE",
    eventLevel: overrides.eventLevel ?? "P1",
    eventTitle: overrides.eventTitle ?? "标题",
    eventSummary: "summary",
    attributionTags: overrides.attributionTags ?? ["PRICE_DRIVEN"],
    evidence: overrides.evidence ?? {
      sourceEventKey: "src",
      sourceEventType: "RANK_SURGE",
      marketplace: "US",
      productUrl: null,
      imageUrl: null,
      title: "title",
      currentRank: 10,
      previousRank: 50,
      rankChange: 40,
      priceBefore: null,
      priceAfter: null,
      priceChangeRate: null,
      reviewCountBefore: null,
      reviewCountAfter: null,
      reviewCountChange: null,
      couponBefore: null,
      couponAfter: null,
      dealType: null,
      brandRisingCount: null,
      brandNewEntryCount: null,
      brandTop100Count: null,
      priceLowWindow: null,
      isCoreCompetitor: false,
      strategyTags: ["COUPON_DEPENDENT"]
    },
    scoreTotal: overrides.scoreTotal ?? 70,
    scoreLevel: overrides.scoreLevel ?? "B",
    scoreBreakdown: { rankingScore: 30, productScore: 10, promoScore: 15, brandScore: 10, riskScore: 5, reasons: [] },
    suggestedAction: overrides.suggestedAction ?? "加入观察池",
    status: overrides.status ?? "TODO",
    reviewDueDate: null,
    reviewResult: null,
    userNote: null,
    createdAt: "2026-06-24T00:00:00Z",
    updatedAt: "2026-06-24T00:00:00Z",
    ...overrides
  } as InsightEvent;
}

function defaultFilters(overrides: Partial<InsightEventFilters> = {}): InsightEventFilters {
  return {
    date: "2026-06-24",
    status: "",
    level: "",
    eventType: "",
    reviewResult: "",
    brand: "",
    asin: "",
    assignee: "",
    attributionTag: "",
    evidenceMovement: "",
    reviewCadence: "",
    actionStage: "",
    scoreDriver: "",
    strategyTag: "",
    unassignedOnly: false,
    sortBy: "score",
    coreOnly: false,
    newBreakoutOnly: false,
    reviewDueOnly: false,
    ...overrides
  };
}

describe("groupEventsByAsin", () => {
  it("returns an empty array when there are no events", () => {
    expect(groupEventsByAsin([], [])).toEqual([]);
  });

  it("skips events without an ASIN (brand-level events)", () => {
    const events = [
      buildEvent({ id: "1", asin: null, eventType: "BRAND_MATRIX_SURGE" }),
      buildEvent({ id: "2", asin: "B001", eventType: "RANK_SURGE" })
    ];
    const result = groupEventsByAsin(events, []);
    expect(result).toHaveLength(1);
    expect(result[0].asin).toBe("B001");
  });

  it("groups multiple events for the same ASIN", () => {
    const events = [
      buildEvent({ id: "1", asin: "B001", scoreTotal: 80, attributionTags: ["PRICE_DRIVEN"] }),
      buildEvent({ id: "2", asin: "B001", scoreTotal: 90, attributionTags: ["COUPON_DRIVEN"], eventType: "COUPON_ADDED" }),
      buildEvent({ id: "3", asin: "B002", scoreTotal: 50 })
    ];
    const result = groupEventsByAsin(events, []);
    expect(result).toHaveLength(2);
    const group = result.find((entry) => entry.asin === "B001")!;
    expect(group.events).toHaveLength(2);
    expect(group.representative.id).toBe("2");
    expect(group.scoreTotal).toBe(90);
    expect(group.attributionTags).toEqual(expect.arrayContaining(["PRICE_DRIVEN", "COUPON_DRIVEN"]));
    expect(group.attributionTags).toHaveLength(2);
  });

  it("picks the highest level as topLevel", () => {
    const events = [
      buildEvent({ id: "1", asin: "B001", eventLevel: "P2", scoreTotal: 50 }),
      buildEvent({ id: "2", asin: "B001", eventLevel: "P0", scoreTotal: 80 }),
      buildEvent({ id: "3", asin: "B001", eventLevel: "P1", scoreTotal: 70 })
    ];
    const result = groupEventsByAsin(events, []);
    expect(result[0].topLevel).toBe("P0");
  });

  it("merges strategy tags from evidence across all events", () => {
    const events = [
      buildEvent({ id: "1", asin: "B001", evidence: { ...buildEvent().evidence, strategyTags: ["LOW_PRICE_RANKING"] } }),
      buildEvent({ id: "2", asin: "B001", evidence: { ...buildEvent().evidence, strategyTags: ["LOW_PRICE_RANKING", "DEAL_LIFT"] } })
    ];
    const result = groupEventsByAsin(events, []);
    expect(result[0].strategyTags).toEqual(expect.arrayContaining(["LOW_PRICE_RANKING", "DEAL_LIFT"]));
    expect(result[0].strategyTags).toHaveLength(2);
  });

  it("resolves watchLevel from the watch state map", () => {
    const events = [buildEvent({ asin: "B001" })];
    const watch: AsinWatchState[] = [
      { orgId: 1, asin: "B001", watchLevel: "CORE", watchReason: "test", firstWatchDate: "2026-06-01", lastEventDate: "2026-06-24", note: null, createdAt: "", updatedAt: "" }
    ];
    const result = groupEventsByAsin(events, watch);
    expect(result[0].watchLevel).toBe("CORE");
  });

  it("sorts groups by highest scoreTotal first", () => {
    const events = [
      buildEvent({ id: "1", asin: "B001", scoreTotal: 50 }),
      buildEvent({ id: "2", asin: "B002", scoreTotal: 90 }),
      buildEvent({ id: "3", asin: "B003", scoreTotal: 70 })
    ];
    const result = groupEventsByAsin(events, []);
    expect(result.map((group) => group.asin)).toEqual(["B002", "B003", "B001"]);
  });

  it("derives opportunity and risk scores from scoreBreakdown", () => {
    const events = [
      buildEvent({
        id: "1",
        asin: "B001",
        scoreBreakdown: {
          rankingScore: 35,
          productScore: 25,
          promoScore: 0,
          brandScore: 0,
          riskScore: 15,
          reasons: ["排名分 35", "商品机会分 25", "核心竞品风险分 15"]
        }
      })
    ];
    const result = groupEventsByAsin(events, []);
    expect(result[0].opportunityScore).toBe(75);
    expect(result[0].riskScore).toBe(50);
    expect(result[0].opportunityReasons.length).toBeGreaterThan(0);
    expect(result[0].riskReasons.length).toBeGreaterThan(0);
  });
});

describe("filterAndSortEvents", () => {
  it("includes sortBy in API query contracts before pagination happens server-side", () => {
    const filters = defaultFilters({ sortBy: "rankChange", reviewDueOnly: true, actionStage: "scheduled" });

    expect(buildInsightEventListQuery(filters)).toMatchObject({ sortBy: "rankChange", actionStage: "scheduled", reviewedOnDate: true, limit: 100 });
    expect(buildInsightEventReviewDueQuery(filters)).toMatchObject({ sortBy: "rankChange", actionStage: "scheduled", limit: 100 });
    expect(buildInsightEventReviewDueQuery(filters)).not.toHaveProperty("reviewedOnDate");
  });

  it("filters by inferred and stored strategy tags", () => {
    const events = [
      buildEvent({
        id: "stored-tag",
        scoreTotal: 70,
        evidence: { ...buildEvent().evidence, strategyTags: ["HIGH_THREAT_CORE"], isCoreCompetitor: true, currentRank: 8 }
      }),
      buildEvent({
        id: "inferred-coupon",
        eventType: "COUPON_ADDED",
        attributionTags: ["COUPON_DRIVEN"],
        scoreTotal: 90,
        evidence: { ...buildEvent().evidence, strategyTags: [], currentRank: 42 }
      }),
      buildEvent({
        id: "other",
        attributionTags: ["DEAL_DRIVEN"],
        scoreTotal: 80,
        evidence: { ...buildEvent().evidence, strategyTags: [], currentRank: 60 }
      })
    ];

    expect(filterAndSortEvents(events, [], defaultFilters({ strategyTag: "HIGH_THREAT_CORE" })).map((event) => event.id)).toEqual(["stored-tag"]);
    expect(filterAndSortEvents(events, [], defaultFilters({ strategyTag: "COUPON_DEPENDENT" })).map((event) => event.id)).toEqual(["inferred-coupon"]);
  });

  it("filters by review result for closed-loop outcome drilldown", () => {
    const events = [
      buildEvent({ id: "confirmed", status: "REVIEWED", reviewResult: "CONFIRMED", scoreTotal: 70 }),
      buildEvent({ id: "reverted", status: "REVIEWED", reviewResult: "REVERTED", scoreTotal: 90 }),
      buildEvent({ id: "pending", status: "REVIEW_PENDING", reviewResult: null, scoreTotal: 100 })
    ];

    expect(filterAndSortEvents(events, [], defaultFilters({ reviewResult: "REVERTED" })).map((event) => event.id)).toEqual(["reverted"]);
  });

  it("filters by attribution tag for evidence-driver chart drilldown", () => {
    const events = [
      buildEvent({ id: "price", attributionTags: ["PRICE_DRIVEN"], scoreTotal: 70 }),
      buildEvent({ id: "coupon", attributionTags: ["COUPON_DRIVEN"], scoreTotal: 90 }),
      buildEvent({ id: "combo", attributionTags: ["PRICE_DRIVEN", "DEAL_DRIVEN"], scoreTotal: 100 })
    ];

    expect(filterAndSortEvents(events, [], defaultFilters({ attributionTag: "PRICE_DRIVEN" })).map((event) => event.id)).toEqual([
      "combo",
      "price"
    ]);
  });

  it("filters by evidence movement for chart drilldown", () => {
    const baseEvidence = buildEvent().evidence;
    const events = [
      buildEvent({
        id: "rank",
        scoreTotal: 80,
        evidence: { ...baseEvidence, previousRank: 80, currentRank: 20, rankChange: 60 }
      }),
      buildEvent({
        id: "price",
        scoreTotal: 90,
        evidence: { ...baseEvidence, priceBefore: 29.99, priceAfter: 24.99, priceChangeRate: -0.167 }
      }),
      buildEvent({
        id: "review",
        scoreTotal: 70,
        evidence: { ...baseEvidence, reviewCountBefore: 10, reviewCountAfter: 32, reviewCountChange: 22 }
      }),
      buildEvent({
        id: "easing",
        scoreTotal: 100,
        evidence: {
          ...baseEvidence,
          previousRank: 20,
          currentRank: 80,
          rankChange: -60,
          priceBefore: 24.99,
          priceAfter: 29.99,
          priceChangeRate: 0.2,
          reviewCountBefore: 32,
          reviewCountAfter: 32,
          reviewCountChange: 0
        }
      })
    ];

    expect(filterAndSortEvents(events, [], defaultFilters({ evidenceMovement: "rankGain" })).map((event) => event.id)).toEqual([
      "price",
      "rank",
      "review"
    ]);
    expect(filterAndSortEvents(events, [], defaultFilters({ evidenceMovement: "priceCut" })).map((event) => event.id)).toEqual([
      "price"
    ]);
    expect(filterAndSortEvents(events, [], defaultFilters({ evidenceMovement: "reviewGrowth" })).map((event) => event.id)).toEqual([
      "review"
    ]);
  });

  it("filters by review cadence bucket for follow-up drilldown", () => {
    const events = [
      buildEvent({ id: "overdue", status: "TODO", reviewDueDate: "2026-06-22", scoreTotal: 70 }),
      buildEvent({ id: "today", status: "REVIEW_PENDING", reviewDueDate: "2026-06-24", scoreTotal: 90 }),
      buildEvent({ id: "upcoming", status: "TODO", reviewDueDate: "2026-06-27", scoreTotal: 80 }),
      buildEvent({ id: "watching", status: "WATCHING", reviewDueDate: "2026-06-24", scoreTotal: 100 }),
      buildEvent({ id: "closed", status: "REVIEWED", reviewDueDate: "2026-06-24", scoreTotal: 110 })
    ];

    expect(filterAndSortEvents(events, [], defaultFilters({ reviewCadence: "overdue" })).map((event) => event.id)).toEqual([
      "overdue"
    ]);
    expect(filterAndSortEvents(events, [], defaultFilters({ reviewCadence: "today" })).map((event) => event.id)).toEqual([
      "today"
    ]);
    expect(filterAndSortEvents(events, [], defaultFilters({ reviewCadence: "upcoming" })).map((event) => event.id)).toEqual([
      "upcoming"
    ]);
  });

  it("filters by action stage after API data is loaded", () => {
    const events = [
      buildEvent({ id: "due", status: "TODO", assignee: null, reviewDueDate: "2026-06-22", scoreTotal: 70 }),
      buildEvent({ id: "unassigned", status: "TODO", assignee: null, scoreTotal: 95 }),
      buildEvent({ id: "ready", status: "TODO", assignee: "Ada", scoreTotal: 90 }),
      buildEvent({ id: "watching", status: "WATCHING", assignee: "Ada", scoreTotal: 80 }),
      buildEvent({ id: "scheduled", status: "REVIEW_PENDING", assignee: "Ada", reviewDueDate: "2026-06-27", scoreTotal: 60 }),
      buildEvent({ id: "closed", status: "REVIEWED", assignee: "Ada", scoreTotal: 100 })
    ];

    expect(filterAndSortEvents(events, [], defaultFilters({ actionStage: "reviewDue" })).map((event) => event.id)).toEqual(["due"]);
    expect(filterAndSortEvents(events, [], defaultFilters({ actionStage: "unassigned" })).map((event) => event.id)).toEqual(["unassigned"]);
    expect(filterAndSortEvents(events, [], defaultFilters({ actionStage: "ready" })).map((event) => event.id)).toEqual(["ready"]);
    expect(filterAndSortEvents(events, [], defaultFilters({ actionStage: "watching" })).map((event) => event.id)).toEqual(["watching"]);
    expect(filterAndSortEvents(events, [], defaultFilters({ actionStage: "scheduled" })).map((event) => event.id)).toEqual(["scheduled"]);
    expect(filterAndSortEvents(events, [], defaultFilters({ actionStage: "closed" })).map((event) => event.id)).toEqual(["closed"]);
  });

  it("filters by dominant score driver for score-mix drilldown", () => {
    const events = [
      buildEvent({
        id: "ranking",
        scoreTotal: 70,
        scoreBreakdown: { rankingScore: 35, productScore: 10, promoScore: 5, brandScore: 5, riskScore: 0, reasons: [] }
      }),
      buildEvent({
        id: "promo",
        scoreTotal: 90,
        scoreBreakdown: { rankingScore: 10, productScore: 10, promoScore: 20, brandScore: 5, riskScore: 0, reasons: [] }
      }),
      buildEvent({
        id: "tie",
        scoreTotal: 80,
        scoreBreakdown: { rankingScore: 20, productScore: 5, promoScore: 20, brandScore: 0, riskScore: 0, reasons: [] }
      })
    ];

    expect(filterAndSortEvents(events, [], defaultFilters({ scoreDriver: "rankingScore" })).map((event) => event.id)).toEqual([
      "tie",
      "ranking"
    ]);
    expect(filterAndSortEvents(events, [], defaultFilters({ scoreDriver: "promoScore" })).map((event) => event.id)).toEqual([
      "promo",
      "tie"
    ]);
  });
});

describe("useInsightEventsStore actions", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it("reloads Today 5 with server-side filters and complete filter options", async () => {
    const filteredEvent = buildEvent({ id: "filtered", brand: "Breezo" });
    const fetchTopInsights = vi.spyOn(insightEventApi, "fetchTopInsights").mockResolvedValue([filteredEvent]);
    const fetchFilterOptions = vi.spyOn(insightEventApi, "fetchTopInsightFilterOptions").mockResolvedValue({
      marketplaces: ["amazon.com", "amazon.de"],
      categoryNames: ["Fans", "Ice Makers"],
      brands: ["Acme", "Breezo"],
      assignees: ["Leo", "Mia"]
    });
    const store = useInsightEventsStore();

    await store.loadTopSummary("2026-06-25");
    await store.setTopSummaryFilter("brand", "Breezo");

    expect(fetchTopInsights).toHaveBeenLastCalledWith(
      "2026-06-25",
      expect.objectContaining({ brand: "Breezo" }),
      5,
      expect.any(Object)
    );
    expect(fetchFilterOptions).toHaveBeenCalledTimes(2);
    expect(store.topSummary).toEqual([filteredEvent]);
    expect(store.topSummaryFilterOptions.brands).toEqual(["Acme", "Breezo"]);
  });

  it("keeps Action Center workspace state in Pinia across panel remounts", () => {
    const selected = buildEvent({ id: "selected" });
    const store = useInsightEventsStore();
    store.$patch({
      selectedEvent: selected,
      activeColumn: "mid",
      drawerOpen: true,
      workView: "cases"
    });

    const remountedStore = useInsightEventsStore();

    expect(remountedStore.selectedEvent?.id).toBe("selected");
    expect(remountedStore.activeColumn).toBe("mid");
    expect(remountedStore.drawerOpen).toBe(true);
    expect(remountedStore.workView).toBe("cases");
  });

  it("loads note history with the selected event detail", async () => {
    const selected = buildEvent({ id: "detail", asin: null, brand: null, categoryId: null });
    const notes: InsightEventNote[] = [
      { id: "note-1", eventId: "detail", note: "复盘观察", createdAt: "2026-06-25T08:00:00Z", updatedAt: "2026-06-25T08:00:00Z" }
    ];
    const fetchInsightEvent = vi.spyOn(insightEventApi, "fetchInsightEvent").mockResolvedValue(selected);
    const fetchInsightEventNotes = vi.spyOn(insightEventApi, "fetchInsightEventNotes").mockResolvedValue(notes);
    const store = useInsightEventsStore();

    await store.loadEventDetail("detail");

    expect(fetchInsightEvent).toHaveBeenCalledWith("detail");
    expect(fetchInsightEventNotes).toHaveBeenCalledWith("detail", expect.any(Object));
    expect(store.selectedEvent).toEqual(selected);
    expect(store.selectedEventNotes).toEqual(notes);
  });

  it("refreshes note history after saving a note on the selected event", async () => {
    const selected = buildEvent({ id: "note-target", userNote: "旧备注" });
    const updated = buildEvent({ id: "note-target", userNote: "新备注" });
    const notes: InsightEventNote[] = [
      { id: "note-2", eventId: "note-target", note: "新备注", createdAt: "2026-06-25T09:00:00Z", updatedAt: "2026-06-25T09:00:00Z" }
    ];
    vi.spyOn(insightEventApi, "updateInsightEventNote").mockResolvedValue(updated);
    const fetchInsightEventNotes = vi.spyOn(insightEventApi, "fetchInsightEventNotes").mockResolvedValue(notes);
    const store = useInsightEventsStore();
    store.$patch({ selectedEvent: selected, events: [selected] });

    await store.setNote("note-target", "新备注");

    expect(fetchInsightEventNotes).toHaveBeenCalledWith("note-target", expect.any(Object));
    expect(store.selectedEvent?.userNote).toBe("新备注");
    expect(store.selectedEventNotes).toEqual(notes);
  });

  it("loads the review queue with the active Action Center filters", async () => {
    const dueEvent = buildEvent({ id: "due", brand: "Acme", assignee: "Alice" });
    const fetchReviewDueEvents = vi.spyOn(insightEventApi, "fetchReviewDueEvents").mockResolvedValue([dueEvent]);
    const store = useInsightEventsStore();
    store.$patch({
      filters: defaultFilters({
        brand: "Acme",
        assignee: "Alice",
        attributionTag: "COUPON_DRIVEN",
        strategyTag: "COUPON_DEPENDENT",
        reviewCadence: "today",
        actionStage: "reviewDue",
        scoreDriver: "promoScore",
        sortBy: "reviewChange",
        coreOnly: true
      })
    });

    await store.loadReviewDueEvents("2026-06-25");

    expect(fetchReviewDueEvents).toHaveBeenCalledWith(
      "2026-06-25",
      expect.objectContaining({
        brand: "Acme",
        assignee: "Alice",
        attributionTag: "COUPON_DRIVEN",
        strategyTag: "COUPON_DEPENDENT",
        reviewCadence: "today",
        actionStage: "reviewDue",
        scoreDriver: "promoScore",
        sortBy: "reviewChange",
        coreOnly: true,
        limit: 100
      }),
      expect.any(Object)
    );
    expect(store.reviewDueEvents).toEqual([dueEvent]);
  });

  it("loads the main Action Center list with same-day reviewed historical events", async () => {
    const event = buildEvent({ id: "reviewed-old", eventDate: "2026-06-19", reviewResult: "CONFIRMED" });
    const fetchInsightEvents = vi.spyOn(insightEventApi, "fetchInsightEvents").mockResolvedValue([event]);
    const store = useInsightEventsStore();
    store.$patch({
      filters: defaultFilters({
        brand: "Acme",
        reviewResult: "CONFIRMED",
        actionStage: "closed"
      })
    });

    await store.loadEvents("2026-06-25");

    expect(fetchInsightEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        date: "2026-06-25",
        brand: "Acme",
        reviewResult: "CONFIRMED",
        actionStage: "closed",
        reviewedOnDate: true,
        limit: 100
      }),
      expect.any(Object)
    );
    expect(store.events).toEqual([event]);
  });

  it("requests trend data with same-day reviewed historical events included", async () => {
    const fetchInsightEventTrend = vi.spyOn(insightEventApi, "fetchInsightEventTrend").mockResolvedValue([]);
    const store = useInsightEventsStore();
    store.$patch({
      filters: defaultFilters({
        attributionTag: "PRICE_DRIVEN",
        actionStage: "ready"
      })
    });

    await store.loadTrend("2026-06-25");

    expect(fetchInsightEventTrend).toHaveBeenCalledWith(
      expect.objectContaining({
        endDate: "2026-06-25",
        days: 7,
        attributionTag: "PRICE_DRIVEN",
        actionStage: "ready",
        reviewedOnDate: true
      }),
      expect.any(Object)
    );
  });
});
