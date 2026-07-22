import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { InsightEvent } from "@amazon-monitor/shared";
import { insightEventApi } from "../api-insight-events";
import { useOverviewActivityStore } from "./overviewActivity";

const baseEvent = {
  orgId: 1,
  eventDate: "2026-07-16",
  asin: "B0TEST0001",
  brand: "Acme",
  categoryId: 1,
  keywordId: null,
  eventType: "RANK_SURGE",
  eventTitle: "Rank surge",
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
  updatedAt: "2026-07-16T08:00:00.000Z"
} satisfies Omit<InsightEvent, "id" | "eventLevel" | "createdAt">;

describe("overview activity store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it("loads P0 and P1 streams independently and merges them chronologically", async () => {
    const p0 = {
      ...baseEvent,
      id: "p0",
      eventLevel: "P0",
      createdAt: "2026-07-16T08:00:00.000Z"
    } satisfies InsightEvent;
    const p1 = {
      ...baseEvent,
      id: "p1",
      eventLevel: "P1",
      createdAt: "2026-07-16T10:00:00.000Z"
    } satisfies InsightEvent;
    const fetch = vi.spyOn(insightEventApi, "fetchInsightEvents")
      .mockResolvedValueOnce([p0])
      .mockResolvedValueOnce([p1]);
    const store = useOverviewActivityStore();

    await store.load("2026-07-16");

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      { date: "2026-07-16", level: "P0", sortBy: "createdAt", limit: 50 },
      expect.any(Object)
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      { date: "2026-07-16", level: "P1", sortBy: "createdAt", limit: 50 },
      expect.any(Object)
    );
    expect(store.events.map((event) => event.id)).toEqual(["p1", "p0"]);
  });
});
