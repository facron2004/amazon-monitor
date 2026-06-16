import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import type { BestSellerProductInput, CategoryMonitor } from "@amazon-monitor/shared";

vi.mock("./page-guards.js", () => ({
  assertCategoryNotBlocked: vi.fn(async () => undefined)
}));

import { assertCategoryNotBlocked } from "./page-guards.js";
import { extractBestSellerCardsWithScroll, shouldRecoverCriticalMetrics } from "./bestseller-collector-support.js";

describe("bestseller collector support", () => {
  it("scrolls and retries extraction when the current page is still short", async () => {
    const shortProducts = [createBestSellerProduct({ rank: 1, asin: "B0SHORT001" })];
    const fullProducts = [createBestSellerProduct({ rank: 1, asin: "B0SHORT001" }), createBestSellerProduct({ rank: 2, asin: "B0SHORT002" })];
    const page = createMockBestSellerPage([shortProducts, fullProducts]);

    const result = await extractBestSellerCardsWithScroll(page as unknown as Page, createCategoryMonitor(), 1, "2026-06-14", 2);

    expect(result).toEqual(fullProducts);
    expect(page.waitForTimeout).toHaveBeenCalledTimes(1);
    expect(page.mouse.wheel).toHaveBeenCalledTimes(1);
    expect(vi.mocked(assertCategoryNotBlocked)).toHaveBeenCalledTimes(1);
  });

  it("only marks products with a URL and missing critical metrics for recovery", () => {
    expect(shouldRecoverCriticalMetrics(createBestSellerProduct({ productUrl: "https://www.amazon.com/dp/B0A", rating: null }))).toBe(true);
    expect(shouldRecoverCriticalMetrics(createBestSellerProduct({ productUrl: "https://www.amazon.com/dp/B0B", reviewCount: null }))).toBe(true);
    expect(shouldRecoverCriticalMetrics(createBestSellerProduct({ productUrl: null, rating: null, reviewCount: null }))).toBe(false);
    expect(shouldRecoverCriticalMetrics(createBestSellerProduct({ productUrl: "https://www.amazon.com/dp/B0C", rating: 4.5, reviewCount: 1200 }))).toBe(false);
  });
});

function createMockBestSellerPage(sequences: BestSellerProductInput[][]) {
  let sequenceIndex = 0;
  return {
    evaluate: vi.fn(async (_fn: unknown, arg?: Record<string, unknown>) => {
      if (arg && "categoryName" in arg) {
        const index = Math.min(sequenceIndex, sequences.length - 1);
        sequenceIndex += 1;
        return sequences[index];
      }
      return undefined;
    }),
    waitForTimeout: vi.fn(async () => undefined),
    mouse: {
      wheel: vi.fn(async () => undefined)
    }
  };
}

function createCategoryMonitor(): CategoryMonitor {
  return {
    id: 1,
    name: "Ice makers",
    marketplace: "amazon.com",
    categoryUrl: "https://www.amazon.com/Best-Sellers-Home-Kitchen-Ice-Makers/zgbs/home-garden/2399939011",
    categoryPath: null,
    crawlTopN: 100,
    status: "enabled",
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    lastCollectedAt: null,
    todayStatus: "pending"
  };
}

function createBestSellerProduct(overrides: Partial<BestSellerProductInput> = {}): BestSellerProductInput {
  return {
    rank: 1,
    asin: "B0TESTBEST1",
    title: "Acme Ice Maker",
    brand: "Acme",
    imageUrl: "",
    productUrl: "https://www.amazon.com/dp/B0TESTBEST1",
    currentPrice: 59.99,
    originalPrice: null,
    couponText: null,
    currency: "$",
    rating: 4.5,
    reviewCount: 1000,
    isPrime: true,
    dealBadge: null,
    bsrRank: 1,
    bsrCategory: "Ice Makers",
    ...overrides
  };
}
