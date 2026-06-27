import { describe, expect, it } from "vitest";
import type { AsinWatchState, InsightEvent } from "@amazon-monitor/shared";
import { groupEventsByAsin } from "../stores/insightEvents";

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
      { asin: "B001", watchLevel: "CORE", watchReason: "test", firstWatchDate: "2026-06-01", lastEventDate: "2026-06-24", note: null, createdAt: "", updatedAt: "" }
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
});
