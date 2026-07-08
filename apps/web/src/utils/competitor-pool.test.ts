import type { AsinWatchState, CompetitorPoolItem } from "@amazon-monitor/shared";
import { describe, expect, it } from "vitest";
import {
  buildCompetitorInsightSuggestion,
  buildCompetitorKpis,
  filterVisibleCompetitors
} from "./competitor-pool";

function makeCompetitor(overrides: Partial<CompetitorPoolItem> = {}): CompetitorPoolItem {
  return {
    id: 1,
    asin: "B0TEST0001",
    marketplace: "amazon.com",
    title: "Test Ice Maker",
    brand: "Acme",
    imageUrl: "https://example.com/image.jpg",
    firstSeenKeyword: "ice maker",
    firstSeenDate: "2026-07-01",
    lastSeenDate: "2026-07-05",
    appearKeywordCount: 1,
    bestRank: 8,
    latestRank: 12,
    lowestPrice: 99,
    latestPrice: 109,
    latestReviewCount: 120,
    latestProductUrl: "https://www.amazon.com/dp/B0TEST0001",
    couponText: null,
    dealBadge: null,
    latestBsrRank: 12,
    latestBsrCategory: "Ice Makers",
    latestBsrText: "#12 in Ice Makers",
    latestBestsellerRanks: [],
    sourceType: "category",
    firstSeenSource: "category",
    latestCategoryName: "Ice Makers",
    latestCategoryRank: 12,
    iceType: null,
    competitorTier: "rising",
    competitorReasons: ["Top20 category competitor"],
    isKeyCompetitor: false,
    status: "active",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
    ...overrides
  };
}

function makeWatchState(overrides: Partial<AsinWatchState> = {}): AsinWatchState {
  return {
    asin: "B0TEST0001",
    watchLevel: "CORE",
    watchReason: "运营手动标为核心竞品",
    firstWatchDate: "2026-07-05",
    lastEventDate: "2026-07-05",
    note: null,
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
    ...overrides
  };
}

describe("competitor pool watch-state integration", () => {
  it("includes manually marked CORE watch states in core and watch filters", () => {
    const watchedCore = makeCompetitor({ asin: "B0WATCHCORE", competitorTier: "activity" });
    const tierCore = makeCompetitor({ id: 2, asin: "B0TIERCORE", competitorTier: "core" });
    const normal = makeCompetitor({ id: 3, asin: "B0NORMAL", competitorTier: "rising" });
    const watchStates = [makeWatchState({ asin: "B0WATCHCORE", watchLevel: "CORE" })];

    const coreRows = filterVisibleCompetitors({
      competitors: [watchedCore, tierCore, normal],
      competitorQuery: "",
      competitorSourceFilter: "all",
      competitorTierFilter: "core",
      watchStates
    });
    expect(coreRows.map((item) => item.asin)).toEqual(["B0WATCHCORE", "B0TIERCORE"]);

    const watchRows = filterVisibleCompetitors({
      competitors: [watchedCore, tierCore, normal],
      competitorQuery: "",
      competitorSourceFilter: "all",
      competitorTierFilter: "watch",
      watchStates
    });
    expect(watchRows.map((item) => item.asin)).toEqual(["B0WATCHCORE"]);
  });

  it("counts watched CORE ASINs in the competitor KPI cards", () => {
    const watchedCore = makeCompetitor({ asin: "B0WATCHCORE", competitorTier: "activity" });
    const tierCore = makeCompetitor({ id: 2, asin: "B0TIERCORE", competitorTier: "core" });
    const watchStates = [makeWatchState({ asin: "B0WATCHCORE", watchLevel: "CORE" })];

    const kpis = buildCompetitorKpis([watchedCore, tierCore], undefined, new Date("2026-07-05T00:00:00.000Z"), watchStates);
    expect(kpis.find((item) => item.key === "core")).toMatchObject({
      label: "核心竞品",
      value: 2
    });
  });

  it("prioritizes watched CORE ASINs with Coupon or Deal activity in the insight suggestion", () => {
    const watchedCoreWithCoupon = makeCompetitor({
      asin: "B0WATCHCORE",
      competitorTier: "activity",
      couponText: "Save $20"
    });
    const unmarkedPromo = makeCompetitor({
      id: 2,
      asin: "B0PROMOONLY",
      competitorTier: "activity",
      couponText: "Save $10"
    });
    const watchStates = [makeWatchState({ asin: "B0WATCHCORE", watchLevel: "CORE" })];

    const suggestion = buildCompetitorInsightSuggestion(
      [watchedCoreWithCoupon, unmarkedPromo],
      new Date("2026-07-05T00:00:00.000Z"),
      watchStates
    );

    expect(suggestion.topItems.map((item) => item.asin)).toEqual(["B0WATCHCORE"]);
    expect(suggestion.body).toContain("1 个核心竞品同时存在 Coupon/Deal 活动");
    expect(suggestion.stats.find((item) => item.label === "核心竞品")).toMatchObject({ value: 1 });
  });
});
