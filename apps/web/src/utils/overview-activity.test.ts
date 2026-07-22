import { describe, expect, it } from "vitest";
import type { InsightEvent } from "@amazon-monitor/shared";
import {
  filterOverviewActivityEvents,
  overviewActivityDomainForEvent,
  prepareOverviewActivityEvents
} from "./overview-activity";

function event(id: string, eventType: InsightEvent["eventType"], overrides: Partial<InsightEvent> = {}): InsightEvent {
  return {
    id,
    eventDate: "2026-07-16",
    asin: "B0TEST0001",
    brand: "Acme",
    categoryId: 1,
    keywordId: null,
    eventType,
    eventLevel: "P1",
    eventTitle: id,
    eventSummary: "summary",
    attributionTags: [],
    evidence: { marketplace: "amazon.com", evidenceItems: [] },
    scoreTotal: 70,
    scoreLevel: "A",
    scoreBreakdown: {
      rankingScore: 20,
      productScore: 10,
      promoScore: 10,
      brandScore: 10,
      riskScore: 10,
      reasons: []
    },
    suggestedAction: "review",
    status: "TODO",
    assignee: null,
    reviewDueDate: null,
    reviewResult: null,
    userNote: null,
    createdAt: "2026-07-16T08:00:00.000Z",
    updatedAt: "2026-07-16T08:00:00.000Z",
    ...overrides,
    orgId: overrides.orgId ?? 1
  };
}

describe("overview activity", () => {
  it("classifies operational event families", () => {
    expect(overviewActivityDomainForEvent(event("price", "PRICE_DROP"))).toBe("pricing");
    expect(overviewActivityDomainForEvent(event("listing", "LISTING_CHANGED"))).toBe("listing");
    expect(overviewActivityDomainForEvent(event("review", "RATING_DROP"))).toBe("review");
    expect(overviewActivityDomainForEvent(event("owned-review", "OWNED_RATING_DROP"))).toBe("review");
    expect(overviewActivityDomainForEvent(event("keyword", "KEYWORD_PAGE_DROP"))).toBe("ranking");
    expect(overviewActivityDomainForEvent(event("rank", "RANK_SURGE"))).toBe("ranking");
  });

  it("keeps P0/P1 events, removes duplicates, and sorts newest first", () => {
    const prepared = prepareOverviewActivityEvents([
      event("older", "PRICE_DROP"),
      event("newer", "LISTING_CHANGED", { createdAt: "2026-07-16T10:00:00.000Z" }),
      event("older", "PRICE_DROP", { scoreTotal: 90 }),
      event("p2", "REVIEW_SPIKE", { eventLevel: "P2" })
    ]);

    expect(prepared.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(prepared[1].scoreTotal).toBe(90);
    expect(filterOverviewActivityEvents(prepared, "listing").map((item) => item.id)).toEqual(["newer"]);
  });
});
