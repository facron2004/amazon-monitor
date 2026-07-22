import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type {
  BestsellerRankSnapshot,
  CompetitorPoolItem,
} from "@amazon-monitor/shared";
import { competitorApi } from "../api-competitors";
import { useCategoryStore } from "./category";

describe("category competitor workflow", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it("adds an Agent-recommended category ASIN and updates the visible pool status", async () => {
    const add = vi
      .spyOn(competitorApi, "addCategoryCompetitor")
      .mockResolvedValue({ asin: "B0AGENT001" } as CompetitorPoolItem);
    const store = useCategoryStore();
    const snapshot = categorySnapshot();
    store.selectedCategoryId = 7;
    store.categoryDetail = {
      category: null,
      snapshots: [snapshot],
      brandMatrix: [],
      signals: [],
      report: "",
      yesterdayKpiSnapshot: null,
    };

    await store.addCategoryCompetitor("B0AGENT001");

    expect(add).toHaveBeenCalledWith("B0AGENT001", 7);
    expect(snapshot.competitorPoolStatus).toBe("active");
    expect(store.competitorPoolUpdatingAsin).toBeNull();
  });
});

function categorySnapshot(): BestsellerRankSnapshot {
  return {
    categoryId: 7,
    categoryName: "Ice Makers",
    marketplace: "amazon.com",
    snapshotDate: "2026-07-16",
    rank: 18,
    asin: "B0AGENT001",
    title: "Agent candidate",
    brand: "Northstar",
    imageUrl: "https://example.com/candidate.jpg",
    productUrl: "https://www.amazon.com/dp/B0AGENT001",
    currentPrice: 129.99,
    originalPrice: null,
    couponText: null,
    couponValue: null,
    couponRate: null,
    finalEstimatedPrice: 129.99,
    currency: "USD",
    rating: 4.5,
    reviewCount: 96,
    isPrime: true,
    dealBadge: null,
    bsrRank: 18,
    bsrCategory: "Ice Makers",
    competitorPoolStatus: "missing",
  };
}
