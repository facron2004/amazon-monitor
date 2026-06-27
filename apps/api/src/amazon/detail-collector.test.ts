import type { BestSellerProductInput, CategoryMonitor, KeywordMonitor, SerpProductInput } from "@amazon-monitor/shared";
import type { BrowserContext } from "playwright";
import { describe, expect, it, vi } from "vitest";
vi.mock("./browser.js", async () => {
  const actual = await vi.importActual<typeof import("./browser.js")>("./browser.js");
  return {
    ...actual,
    setDeliveryZipCode: vi.fn(async () => undefined)
  };
});
import { setDeliveryZipCode } from "./browser.js";
import { collectMissingBestSellerDetails, collectPageProductDetailRanks } from "./detail-collector.js";

describe("detail collector brand enrichment", () => {
  it("re-checks weak detail brands on the store page before saving", async () => {
    const page = createMockDetailPage(
      createDetailPayload({
        title: "Nugget Countertop Ice Maker",
        brand: "Nugget",
        storeUrl: "https://www.amazon.com/stores/AntarcticStar/page/123",
        currentPrice: 49.99,
        rating: 4.8,
        reviewCount: 3285,
        iceType: "nugget"
      }),
      "Antarctic Star"
    );
    const context = createMockContext([page]);
    const product = createBestSellerProduct({
      rank: 56,
      asin: "B0STORE001",
      title: "Nugget Countertop Ice Maker with Soft Chewable Ice",
      brand: "Nugget",
      productUrl: "https://www.amazon.com/dp/B0STORE001",
      currentPrice: 49.99,
      reviewCount: 3285
    });

    const result = await collectMissingBestSellerDetails(context, createCategoryMonitor(), [product], 2, "2026-06-11", new Map());

    expect(page.goto).toHaveBeenNthCalledWith(
      1,
      "https://www.amazon.com/dp/B0STORE001",
      expect.objectContaining({ waitUntil: "domcontentloaded", timeout: expect.any(Number) })
    );
    expect(page.goto).toHaveBeenNthCalledWith(
      2,
      "https://www.amazon.com/stores/AntarcticStar/page/123",
      expect.objectContaining({ waitUntil: "domcontentloaded", timeout: expect.any(Number) })
    );
    expect(result[0].brand).toBe("Antarctic Star");
  });

  it("collects bestseller details for weak brands outside the top detail ranks", async () => {
    const page = createMockDetailPage(
      createDetailPayload({
        title: "Antarctic Star Nugget Countertop Ice Maker",
        brand: "Antarctic Star",
        currentPrice: 49.99,
        originalPrice: 69.99,
        rating: 4.8,
        reviewCount: 3285,
        iceType: "nugget",
        dealBadge: "Limited time deal"
      })
    );
    const context = createMockContext([page]);
    const product = createBestSellerProduct({
      rank: 56,
      asin: "B0GZMVKJQ2",
      title: "Nugget Countertop Ice Maker with Soft Chewable Ice",
      brand: "Nugget",
      productUrl: "https://www.amazon.com/dp/B0GZMVKJQ2",
      currentPrice: 49.99,
      reviewCount: 3285
    });

    const result = await collectMissingBestSellerDetails(context, createCategoryMonitor(), [product], 2, "2026-06-11", new Map());

    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(page.goto).toHaveBeenCalledWith(
      "https://www.amazon.com/dp/B0GZMVKJQ2",
      expect.objectContaining({ waitUntil: "domcontentloaded", timeout: expect.any(Number) })
    );
    expect(result[0]).toMatchObject({
      asin: "B0GZMVKJQ2",
      title: "Antarctic Star Nugget Countertop Ice Maker",
      brand: "Antarctic Star",
      rating: 4.8,
      iceType: "nugget",
      dealBadge: "Limited time deal",
      originalPrice: 69.99
    });
  });

  it("collects bestseller details even for strong brands outside the old top-N threshold", async () => {
    const page = createMockDetailPage(
      createDetailPayload({
        title: "Acme Clear Ice Maker",
        brand: "Acme",
        rating: 4.7,
        reviewCount: 2420,
        iceType: "clear"
      })
    );
    const context = createMockContext([page]);
    const product = createBestSellerProduct({
      rank: 88,
      asin: "B0STRONG88",
      title: "Acme Ice Maker",
      brand: "Acme",
      productUrl: "https://www.amazon.com/dp/B0STRONG88",
      rating: 4.1,
      reviewCount: 100
    });

    const result = await collectMissingBestSellerDetails(context, createCategoryMonitor(), [product], 2, "2026-06-11", new Map());

    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(result[0]).toMatchObject({
      asin: "B0STRONG88",
      title: "Acme Clear Ice Maker",
      rating: 4.7,
      reviewCount: 2420,
      iceType: "clear"
    });
  });

  it("retries once when rating and review are not ready on the first detail parse", async () => {
    const page = createMockDetailPageSequence([
      createDetailPayload({
        title: "Silonn Nugget Ice Maker",
        brand: "Silonn",
        rating: null,
        reviewCount: null,
        iceType: "nugget"
      }),
      createDetailPayload({
        title: "Silonn Nugget Ice Maker",
        brand: "Silonn",
        rating: 4.3,
        reviewCount: 10,
        iceType: "nugget"
      })
    ]);
    const context = createMockContext([page]);
    const product = createBestSellerProduct({
      asin: "B0RETRY001",
      title: "Silonn Nugget Ice Maker",
      brand: "Silonn",
      productUrl: "https://www.amazon.com/dp/B0RETRY001",
      rating: null,
      reviewCount: null
    });

    const result = await collectMissingBestSellerDetails(context, createCategoryMonitor(), [product], 2, "2026-06-12", new Map());

    expect(page.evaluate).toHaveBeenCalledTimes(2);
    expect(result[0]).toMatchObject({
      rating: 4.3,
      reviewCount: 10
    });
  });

  it("uses the retried detail page promo state when a coupon or deal disappears", async () => {
    const page = createMockDetailPageSequence([
      createDetailPayload({
        title: "Silonn Nugget Ice Maker",
        brand: "Silonn",
        couponText: "Save $5.00 with coupon",
        dealBadge: "Prime Day Deal",
        rating: null,
        reviewCount: null,
        iceType: "nugget"
      }),
      createDetailPayload({
        title: "Silonn Nugget Ice Maker",
        brand: "Silonn",
        couponText: null,
        dealBadge: null,
        rating: 4.3,
        reviewCount: 10,
        iceType: "nugget"
      })
    ]);
    const context = createMockContext([page]);
    const product = createBestSellerProduct({
      asin: "B0PROMOEND",
      title: "Silonn Nugget Ice Maker",
      brand: "Silonn",
      productUrl: "https://www.amazon.com/dp/B0PROMOEND",
      couponText: "Save $5.00 with coupon",
      dealBadge: "Prime Day Deal",
      rating: null,
      reviewCount: null
    });

    const result = await collectMissingBestSellerDetails(context, createCategoryMonitor(), [product], 2, "2026-06-25", new Map());

    expect(page.evaluate).toHaveBeenCalledTimes(2);
    expect(result[0]).toMatchObject({
      couponText: null,
      dealBadge: null,
      rating: 4.3,
      reviewCount: 10
    });
  });

  it("reapplies the delivery zip and revisits the detail page when critical metrics are still missing", async () => {
    vi.mocked(setDeliveryZipCode).mockClear();
    const page = createMockDetailPageSequence([
      createDetailPayload({
        title: "Silonn Nugget Ice Maker",
        brand: "Silonn",
        rating: null,
        reviewCount: null,
        currentPrice: 279.96,
        dealBadge: "Limited time deal",
        iceType: "nugget"
      }),
      createDetailPayload({
        title: "Silonn Nugget Ice Maker",
        brand: "Silonn",
        rating: null,
        reviewCount: null,
        currentPrice: 279.96,
        dealBadge: "Limited time deal",
        iceType: "nugget"
      }),
      createDetailPayload({
        title: "Silonn Nugget Ice Maker",
        brand: "Silonn",
        rating: 4,
        reviewCount: 623,
        currentPrice: 279.96,
        originalPrice: 349.99,
        dealBadge: "Limited time deal",
        iceType: "nugget"
      })
    ]);
    const context = createMockContext([page]);
    const product = createBestSellerProduct({
      asin: "B0ZIPRETRY",
      title: "Silonn Nugget Ice Maker",
      brand: "Silonn",
      productUrl: "https://www.amazon.com/dp/B0ZIPRETRY",
      currentPrice: 279.96,
      rating: 4.3,
      reviewCount: null,
      dealBadge: "Limited time deal"
    });

    const result = await collectMissingBestSellerDetails(context, createCategoryMonitor(), [product], 2, "2026-06-12", new Map());

    expect(vi.mocked(setDeliveryZipCode)).toHaveBeenCalledWith(page, "amazon.com", undefined);
    expect(page.goto).toHaveBeenNthCalledWith(
      1,
      "https://www.amazon.com/dp/B0ZIPRETRY",
      expect.objectContaining({ waitUntil: "domcontentloaded", timeout: expect.any(Number) })
    );
    expect(page.goto).toHaveBeenNthCalledWith(
      2,
      "https://www.amazon.com/dp/B0ZIPRETRY",
      expect.objectContaining({ waitUntil: "domcontentloaded", timeout: expect.any(Number) })
    );
    expect(result[0]).toMatchObject({
      rating: 4,
      reviewCount: 623,
      originalPrice: 349.99
    });
  });

  it("drops invalid original prices that are not above the current price", async () => {
    const page = createMockDetailPage(
      createDetailPayload({
        title: "GoveeLife Smart Countertop Ice Maker",
        brand: "GoveeLife",
        currentPrice: 349.99,
        originalPrice: 209.99,
        iceType: "cube"
      })
    );
    const context = createMockContext([page]);
    const product = createBestSellerProduct({
      asin: "B0PRICE001",
      title: "GoveeLife Smart Countertop Ice Maker",
      brand: "GoveeLife",
      productUrl: "https://www.amazon.com/dp/B0PRICE001",
      currentPrice: 349.99,
      originalPrice: 209.99
    });

    const result = await collectMissingBestSellerDetails(context, createCategoryMonitor(), [product], 2, "2026-06-12", new Map());

    expect(result[0]).toMatchObject({
      currentPrice: 349.99,
      originalPrice: null
    });
  });

  it("prioritizes weak search brands when detail collection is limited", async () => {
    const page = createMockDetailPage(
      createDetailPayload({
        title: "Antarctic Star Bullet Ice Maker",
        brand: "Antarctic Star",
        currentPrice: 59.99,
        rating: 4.6,
        reviewCount: 3180,
        iceType: "bullet",
        bsrRank: 12,
        bsrCategory: "Ice Makers",
        bsrText: "Best Sellers Rank #12 in Ice Makers",
        bestsellerRanks: [{ rank: 12, category: "Ice Makers", url: null }]
      })
    );
    const context = createMockContext([page]);
    const strongBrandProduct = createSerpProduct({
      asin: "B0STRONG01",
      title: "Acme Countertop Ice Maker",
      brand: "Acme",
      productUrl: "https://www.amazon.com/dp/B0STRONG01"
    });
    const weakBrandProduct = createSerpProduct({
      asin: "B0WEAK0001",
      title: "Countertop Ice Maker Machine",
      brand: "Countertop",
      productUrl: "https://www.amazon.com/dp/B0WEAK0001"
    });

    const result = await collectPageProductDetailRanks(
      context,
      createKeywordMonitor(),
      [strongBrandProduct, weakBrandProduct],
      1,
      "2026-06-11",
      1,
      new Map()
    );

    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(page.goto).toHaveBeenCalledWith(
      "https://www.amazon.com/dp/B0WEAK0001",
      expect.objectContaining({ waitUntil: "domcontentloaded", timeout: expect.any(Number) })
    );
    expect(result.collectedCount).toBe(1);
    expect(result.products[0].brand).toBe("Acme");
    expect(result.products[1]).toMatchObject({
      asin: "B0WEAK0001",
      title: "Antarctic Star Bullet Ice Maker",
      brand: "Antarctic Star",
      rating: 4.6,
      iceType: "bullet",
      bsrRank: 12,
      bsrCategory: "Ice Makers"
    });
  });
});

function createMockContext(pages: Array<ReturnType<typeof createMockDetailPage>>): BrowserContext {
  let index = 0;
  return {
    newPage: vi.fn(async () => pages[index++] ?? pages[pages.length - 1])
  } as unknown as BrowserContext;
}

function createMockDetailPage(detailPayload: ReturnType<typeof createDetailPayload>, storeBrand: string | null = null) {
  return {
    route: vi.fn(async () => undefined),
    goto: vi.fn(async () => undefined),
    waitForSelector: vi.fn(async () => undefined),
    waitForLoadState: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    evaluate: vi.fn(async (fn: { name?: string }) => (fn?.name === "extractStorePageBrand" ? storeBrand : detailPayload)),
    locator: vi.fn(() => ({
      first: vi.fn().mockReturnThis(),
      waitFor: vi.fn(async () => undefined),
      innerText: vi.fn(async () => "Amazon product detail page")
    })),
    title: vi.fn(async () => "Amazon.com"),
    close: vi.fn(async () => undefined)
  };
}

function createMockDetailPageSequence(detailPayloads: Array<ReturnType<typeof createDetailPayload>>, storeBrand: string | null = null) {
  let index = 0;
  return {
    route: vi.fn(async () => undefined),
    goto: vi.fn(async () => undefined),
    waitForSelector: vi.fn(async () => undefined),
    waitForLoadState: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    evaluate: vi.fn(async (fn: { name?: string }) => {
      if (fn?.name === "extractStorePageBrand") {
        return storeBrand;
      }
      const payload = detailPayloads[Math.min(index, detailPayloads.length - 1)];
      index += 1;
      return payload;
    }),
    locator: vi.fn(() => ({
      first: vi.fn().mockReturnThis(),
      waitFor: vi.fn(async () => undefined),
      innerText: vi.fn(async () => "Amazon product detail page")
    })),
    title: vi.fn(async () => "Amazon.com"),
    close: vi.fn(async () => undefined)
  };
}

function createDetailPayload(
  overrides: Partial<{
    title: string | null;
    brand: string | null;
    storeUrl: string | null;
    couponText: string | null;
    dealBadge: string | null;
    currentPrice: number | null;
    originalPrice: number | null;
    currency: string | null;
    rating: number | null;
    reviewCount: number | null;
    iceType: BestSellerProductInput["iceType"];
    bsrRank: number | null;
    bsrCategory: string | null;
    bsrText: string | null;
    bestsellerRanks: Array<{ rank: number; category: string; url: string | null }>;
  }> = {}
) {
  return {
    title: null,
    brand: null,
    storeUrl: null,
    couponText: null,
    dealBadge: null,
    currentPrice: 59.99,
    originalPrice: null,
    currency: "$",
    rating: 4.5,
    reviewCount: 1200,
    iceType: "unknown",
    bsrRank: null,
    bsrCategory: null,
    bsrText: null,
    bestsellerRanks: [],
    ...overrides
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
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
    lastCollectedAt: null,
    todayStatus: "pending"
  };
}

function createKeywordMonitor(): KeywordMonitor {
  return {
    id: 1,
    keyword: "ice maker",
    marketplace: "amazon.com",
    zipCode: "97201",
    language: "en_US",
    categoryTag: null,
    crawlPages: 1,
    status: "enabled",
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
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

function createSerpProduct(overrides: Partial<SerpProductInput> = {}): SerpProductInput {
  return {
    asin: "B0TESTSERP1",
    title: "Acme Ice Maker",
    brand: "Acme",
    imageUrl: "",
    productUrl: "https://www.amazon.com/dp/B0TESTSERP1",
    currentPrice: 59.99,
    originalPrice: null,
    couponText: null,
    currency: "$",
    rating: 4.5,
    reviewCount: 1000,
    isSponsored: false,
    isPrime: true,
    dealBadge: null,
    deliveryText: null,
    ...overrides
  };
}
