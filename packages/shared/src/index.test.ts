import { describe, expect, it } from "vitest";
import {
  analyzeCategorySignals,
  buildBrandMatrixSnapshots,
  buildCategoryActivityEvents,
  buildCompetitorActionInsights,
  buildCategoryReportMarkdown,
  decorateBestsellerSnapshots,
  inferIceType,
  trustedPreviousReviewCount,
  type BestSellerProductInput,
  type BsrRankChange,
  type CategoryMonitor
} from "./index";

describe("Amazon category intelligence business rules", () => {
  it("builds category activity events and a readable category report", () => {
    const category: CategoryMonitor = {
      id: 1,
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Ice-Makers/zgbs/kitchen/289935",
      categoryPath: "Kitchen > Ice Makers",
      crawlTopN: 100,
      status: "enabled",
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T00:00:00.000Z",
      lastCollectedAt: null,
      todayStatus: "pending"
    };
    const baseProduct = (partial: Partial<BestSellerProductInput> & Pick<BestSellerProductInput, "rank" | "asin" | "title" | "brand" | "currentPrice">): BestSellerProductInput => ({
      imageUrl: `https://example.com/${partial.asin}.jpg`,
      productUrl: `https://amazon.com/dp/${partial.asin}`,
      originalPrice: null,
      couponText: null,
      currency: "$",
      rating: 4.5,
      reviewCount: 1000,
      isPrime: true,
      dealBadge: null,
      ...partial
    });
    const yesterday = decorateBestsellerSnapshots({
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      snapshotDate: "2026-05-22",
      products: [
        baseProduct({ rank: 60, asin: "B0COOLICE1", title: "Cool Ice Maker", brand: "CoolCo", currentPrice: 129.99 }),
        baseProduct({ rank: 18, asin: "B0OLDICE01", title: "Old Ice Maker", brand: "OldCo", currentPrice: 79.99 })
      ]
    });
    const today = decorateBestsellerSnapshots({
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      snapshotDate: "2026-05-23",
      products: [
        baseProduct({ rank: 12, asin: "B0NEWICE01", title: "New Ice Maker", brand: "NewCo", currentPrice: 89.99, dealBadge: "Limited Time Deal" }),
        baseProduct({ rank: 25, asin: "B0COOLICE1", title: "Cool Ice Maker", brand: "CoolCo", currentPrice: 99.99, couponText: "Save $20 with coupon", reviewCount: 1044 })
      ]
    });
    const brandMatrix = buildBrandMatrixSnapshots({ category, date: "2026-05-23", today, yesterday });
    const signals = analyzeCategorySignals({ category, date: "2026-05-23", today, yesterday });
    const events = buildCategoryActivityEvents({ category, date: "2026-05-23", today, yesterday, brandMatrix });
    const insights = buildCompetitorActionInsights({
      date: "2026-05-23",
      bsrChanges: [
        {
          snapshotDate: "2026-05-23",
          previousDate: "2026-05-22",
          sourceType: "category_bestseller",
          sourceId: category.id,
          sourceName: category.name,
          marketplace: category.marketplace,
          category: category.name,
          asin: "B0NEWICE01",
          title: "New Ice Maker",
          brand: "NewCo",
          currentRank: 12,
          previousRank: null,
          rankChange: null,
          changeType: "new_entry",
          productUrl: "https://amazon.com/dp/B0NEWICE01",
          currentPrice: 89.99
        },
        {
          snapshotDate: "2026-05-23",
          previousDate: "2026-05-22",
          sourceType: "category_bestseller",
          sourceId: category.id,
          sourceName: category.name,
          marketplace: category.marketplace,
          category: category.name,
          asin: "B0COOLICE1",
          title: "Cool Ice Maker",
          brand: "CoolCo",
          currentRank: 25,
          previousRank: 60,
          rankChange: 35,
          changeType: "rank_up",
          productUrl: "https://amazon.com/dp/B0COOLICE1",
          currentPrice: 99.99
        }
      ],
      activityEvents: events
    });
    const report = buildCategoryReportMarkdown({ date: "2026-05-23", category, snapshots: today, brandMatrix, signals, activityEvents: events });

    expect(events.map((event) => event.eventType)).toEqual(expect.arrayContaining(["new_entry_top50", "rank_surge", "price_drop", "coupon_start", "review_growth"]));
    expect(events.find((event) => event.eventType === "review_growth" && event.asin === "B0COOLICE1")).toMatchObject({
      eventLevel: "medium",
      reviewCountBefore: 1000,
      reviewCountAfter: 1044,
      reviewCountChange: 44
    });
    expect(insights.map((insight) => insight.insightType)).toEqual(
      expect.arrayContaining(["bsr_new_entry", "bsr_fast_rise", "price_drop_rank_lift", "coupon_rank_lift"])
    );
    expect(insights.find((insight) => insight.asin === "B0COOLICE1" && insight.insightType === "bsr_fast_rise")).toMatchObject({
      previousDate: "2026-05-22"
    });
    expect(insights.find((insight) => insight.asin === "B0COOLICE1" && insight.insightType === "bsr_fast_rise")?.evidence).toContain(
      "Evidence dates: 2026-05-22 -> 2026-05-23"
    );
    expect(insights.find((insight) => insight.asin === "B0COOLICE1" && insight.insightType === "price_drop_rank_lift")?.evidence).toContain(
      "Source event: price_drop; event date: 2026-05-23; BSR path: #60 -> #25; price: $129.99 -> $99.99"
    );
    expect(report).toContain("# Amazon 类目竞品情报日报");
    expect(report).toContain("活动事件");
    expect(report).toContain("B0NEWICE01");
    expect(report).toContain("reviews grew from 1000 to 1044, up 44");
  });

  it("ignores obviously bad previous review counts for daily growth", () => {
    const category: CategoryMonitor = {
      id: 9,
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Ice-Makers/zgbs/kitchen/289935",
      categoryPath: null,
      crawlTopN: 100,
      status: "enabled",
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T00:00:00.000Z",
      lastCollectedAt: null,
      todayStatus: "pending"
    };
    const baseProduct = (reviewCount: number): BestSellerProductInput => ({
      rank: 22,
      asin: "B0BADREV22",
      title: "ORFLROA Nugget Ice Maker",
      brand: "ORFLROA",
      imageUrl: "https://example.com/B0BADREV22.jpg",
      productUrl: "https://amazon.com/dp/B0BADREV22",
      currentPrice: 129.99,
      originalPrice: null,
      couponText: null,
      currency: "$",
      rating: 4.5,
      reviewCount,
      isPrime: true,
      dealBadge: null,
      bsrRank: 22,
      bsrCategory: "Ice Makers"
    });
    const yesterday = decorateBestsellerSnapshots({
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      snapshotDate: "2026-05-22",
      products: [baseProduct(22)]
    });
    const today = decorateBestsellerSnapshots({
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      snapshotDate: "2026-05-23",
      products: [baseProduct(12221)]
    });
    const brandMatrix = buildBrandMatrixSnapshots({ category, date: "2026-05-23", today, yesterday });
    const events = buildCategoryActivityEvents({ category, date: "2026-05-23", today, yesterday, brandMatrix });

    expect(trustedPreviousReviewCount(12221, 22)).toBeNull();
    expect(trustedPreviousReviewCount(1244, 1200)).toBe(1200);
    expect(events.find((event) => event.eventType === "review_growth")).toBeUndefined();
  });

  it("keeps small review-count changes out of activity events", () => {
    const category: CategoryMonitor = {
      id: 10,
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Ice-Makers/zgbs/kitchen/289935",
      categoryPath: null,
      crawlTopN: 100,
      status: "enabled",
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T00:00:00.000Z",
      lastCollectedAt: null,
      todayStatus: "pending"
    };
    const product = (reviewCount: number, date: string) =>
      decorateBestsellerSnapshots({
        categoryId: category.id,
        categoryName: category.name,
        marketplace: category.marketplace,
        snapshotDate: date,
        products: [
          {
            rank: 10,
            asin: "B0SMALLREV1",
            title: "Small Review Change Ice Maker",
            brand: "Acme",
            imageUrl: "https://example.com/B0SMALLREV1.jpg",
            productUrl: "https://amazon.com/dp/B0SMALLREV1",
            currentPrice: 99.99,
            originalPrice: null,
            couponText: null,
            currency: "$",
            rating: 4.5,
            reviewCount,
            isPrime: true,
            dealBadge: null
          }
        ]
      });

    const yesterday = product(1000, "2026-05-22");
    const today = product(1001, "2026-05-23");
    const brandMatrix = buildBrandMatrixSnapshots({ category, date: "2026-05-23", today, yesterday });
    const events = buildCategoryActivityEvents({ category, date: "2026-05-23", today, yesterday, brandMatrix });

    expect(events.find((event) => event.eventType === "review_growth")).toBeUndefined();
  });

  it("does not infer a BSR new-entry action when no previous BSR baseline exists", () => {
    const newEntryWithoutBaseline: BsrRankChange = {
      snapshotDate: "2026-05-23",
      previousDate: null,
      sourceType: "category_bestseller",
      sourceId: 7,
      sourceName: "Ice Makers",
      marketplace: "amazon.com",
      category: "Ice Makers",
      asin: "B0FIRSTDAY1",
      title: "First Day Ice Maker",
      brand: "FreshCo",
      currentRank: 12,
      previousRank: null,
      rankChange: null,
      changeType: "new_entry",
      productUrl: "https://amazon.com/dp/B0FIRSTDAY1",
      currentPrice: 89.99
    };

    const insights = buildCompetitorActionInsights({
      date: "2026-05-23",
      bsrChanges: [newEntryWithoutBaseline]
    });

    expect(insights).toEqual([]);
  });

  it("adds representative ASIN rank evidence to brand matrix push events", () => {
    const category: CategoryMonitor = {
      id: 7,
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://amazon.com/bestsellers/ice-makers",
      categoryPath: null,
      crawlTopN: 100,
      status: "enabled",
      createdAt: "2026-05-22",
      updatedAt: "2026-05-22",
      lastCollectedAt: null,
      todayStatus: "pending"
    };
    const baseProduct = (partial: Partial<BestSellerProductInput> & { rank: number; asin: string }): BestSellerProductInput => ({
      title: "Traceable Ice Maker",
      brand: "TraceCo",
      imageUrl: `https://example.com/${partial.asin}.jpg`,
      productUrl: `https://amazon.com/dp/${partial.asin}`,
      currentPrice: 109.99,
      originalPrice: null,
      couponText: null,
      currency: "$",
      rating: 4.5,
      reviewCount: 1000,
      isPrime: true,
      dealBadge: null,
      ...partial
    });
    const yesterday = decorateBestsellerSnapshots({
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      snapshotDate: "2026-05-22",
      products: [
        baseProduct({ rank: 60, asin: "B0TRACE001", currentPrice: 129.99 }),
        baseProduct({ rank: 70, asin: "B0TRACE002", currentPrice: 119.99 })
      ]
    });
    const today = decorateBestsellerSnapshots({
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      snapshotDate: "2026-05-23",
      products: [
        baseProduct({ rank: 8, asin: "B0TRACE001", currentPrice: 99.99, couponText: "Save $20 with coupon" }),
        baseProduct({ rank: 14, asin: "B0TRACE002", currentPrice: 99.99, dealBadge: "Limited Time Deal" }),
        baseProduct({ rank: 31, asin: "B0TRACE003", currentPrice: 89.99, couponText: "Save 10% with coupon" })
      ]
    });
    const brandMatrix = buildBrandMatrixSnapshots({ category, date: "2026-05-23", today, yesterday });
    const events = buildCategoryActivityEvents({ category, date: "2026-05-23", today, yesterday, brandMatrix });

    const brandEvent = events.find((event) => event.eventType === "brand_matrix_push");

    expect(brandEvent?.eventSummary).toContain("Top ASINs: B0TRACE001 (#8), B0TRACE002 (#14), B0TRACE003 (#31).");
  });

  it("infers bullet ice makers from strong countertop portable 9-cube timing patterns", () => {
    expect(
      inferIceType(
        "Portable Ice Maker Countertop, 26Lbs Per Day, 9 Cubes Ready in 6 Mins, Self-Cleaning Ice Maker for Kitchen"
      )
    ).toBe("bullet");
    expect(
      inferIceType(
        "Portable countertop ice maker with handle, 8 ice cubes ready in 6 mins for home kitchen bar party"
      )
    ).toBe("bullet");
    expect(
      inferIceType(
        "Compact countertop ice maker where each 5-6 minute cycle produces 9 ice cubes"
      )
    ).toBe("bullet");
    expect(inferIceType("Ice Maker Cleaner & Descaler for Countertop Machines")).toBe("unknown");
  });
});
