import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { CompetitorPoolItem } from "@amazon-monitor/shared";
import { competitorApi } from "../api-competitors";
import { insightEventApi } from "../api-insight-events";
import { useCompetitorStore } from "./competitor";

describe("competitor KPI comparison", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    vi.spyOn(competitorApi, "competitorFolders").mockResolvedValue([]);
    vi.spyOn(competitorApi, "competitors").mockResolvedValue([
      competitor({ asin: "B0CORE0001", competitorTier: "core" }),
      competitor({ id: 2, asin: "B0NEW00001", firstSeenDate: "2026-07-22" }),
    ]);
    vi.spyOn(insightEventApi, "fetchAsinWatchStates").mockResolvedValue([]);
  });

  it("uses the API delta for the global pool", async () => {
    vi.spyOn(competitorApi, "competitorKpis").mockResolvedValue({
      current: {
        date: "2026-07-22",
        total: 2,
        core: 1,
        new: 1,
        priceActive: 0,
        key: 0,
      },
      previous: {
        date: "2026-07-21",
        total: 1,
        core: 1,
        new: 0,
        priceActive: 0,
        key: 0,
      },
      delta: { total: 1, core: 0, new: 1, priceActive: 0, key: 0 },
    });
    const store = useCompetitorStore();

    await store.loadCompetitors(true);

    expect(store.competitorKpis.map((item) => [item.key, item.delta])).toEqual([
      ["total", 1],
      ["core", 0],
      ["new", 1],
      ["priceActive", 0],
      ["key", 0],
    ]);
  });

  it("does not apply a global baseline to a filtered pool", async () => {
    const kpis = vi.spyOn(competitorApi, "competitorKpis");
    const store = useCompetitorStore();
    store.competitorTierFilter = "core";

    await store.loadCompetitors(true);

    expect(kpis).not.toHaveBeenCalled();
    expect(store.competitorKpis.every((item) => item.delta === null)).toBe(
      true,
    );
  });
});

function competitor(
  overrides: Partial<CompetitorPoolItem> = {},
): CompetitorPoolItem {
  return {
    id: 1,
    orgId: 1,
    asin: "B0TEST0001",
    marketplace: "amazon.com",
    title: "Test competitor",
    brand: null,
    imageUrl: "",
    firstSeenKeyword: "ice maker",
    firstSeenDate: "2026-07-01",
    lastSeenDate: "2026-07-22",
    appearKeywordCount: 1,
    bestRank: null,
    latestRank: null,
    lowestPrice: null,
    latestPrice: null,
    latestProductUrl: "https://amazon.com/dp/B0TEST0001",
    couponText: null,
    dealBadge: null,
    latestBsrRank: null,
    latestBsrCategory: null,
    latestBsrText: null,
    latestBestsellerRanks: [],
    sourceType: "manual",
    firstSeenSource: "manual",
    latestCategoryName: null,
    latestCategoryRank: null,
    competitorTier: "watch",
    competitorReasons: [],
    isKeyCompetitor: false,
    status: "active",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    ...overrides,
  };
}
