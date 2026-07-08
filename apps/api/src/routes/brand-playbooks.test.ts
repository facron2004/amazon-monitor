import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ActivityEventType, AlertLevel, BestsellerRankSnapshot, BrandMatrixSnapshot, CategoryMonitor, CompetitorActivityEvent } from "@amazon-monitor/shared";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

function product(
  category: CategoryMonitor,
  date: string,
  rank: number,
  asin: string,
  brand: string,
  price: number,
  couponText: string | null,
  couponValue: number | null,
  couponRate: number | null,
  dealBadge: string | null,
  reviewCount: number
): BestsellerRankSnapshot {
  const finalEstimatedPrice = couponValue !== null
    ? price - couponValue
    : couponRate !== null ? Math.round(price * (1 - couponRate) * 100) / 100 : price;
  return {
    categoryId: category.id,
    categoryName: category.name,
    marketplace: category.marketplace,
    snapshotDate: date,
    rank,
    asin,
    title: `${brand} Ice Maker ${asin}`,
    brand,
    imageUrl: `https://example.com/${asin}.jpg`,
    productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice: price,
    originalPrice: null,
    couponText,
    couponValue,
    couponRate,
    finalEstimatedPrice,
    currency: "$",
    rating: 4.5,
    reviewCount,
    iceType: null,
    isPrime: true,
    dealBadge,
    bsrRank: rank,
    bsrCategory: category.name
  };
}

function brandMatrix(
  category: CategoryMonitor,
  date: string,
  counts: { top100: number; top50: number; top20: number; newEntries: number; rankUp: number; rankDown: number; coupon: number; deal: number; topAsins: string[] }
): BrandMatrixSnapshot {
  return {
    categoryId: category.id,
    categoryName: category.name,
    marketplace: category.marketplace,
    snapshotDate: date,
    brand: "Acme",
    productCountTop100: counts.top100,
    productCountTop50: counts.top50,
    productCountTop20: counts.top20,
    bestRank: 5,
    averageRank: 20,
    newEntryCount: counts.newEntries,
    droppedCount: 0,
    rankUpCount: counts.rankUp,
    rankDownCount: counts.rankDown,
    priceDownCount: 1,
    couponCount: counts.coupon,
    dealCount: counts.deal,
    topAsins: counts.topAsins
  };
}

function activity(
  category: CategoryMonitor,
  date: string,
  eventType: ActivityEventType,
  asin: string | null,
  rankAfter: number | null,
  level: AlertLevel = "medium"
): CompetitorActivityEvent {
  return {
    eventKey: `${date}:${eventType}:${asin ?? "brand"}`,
    eventDate: date,
    eventType,
    eventLevel: level,
    categoryId: category.id,
    categoryName: category.name,
    marketplace: category.marketplace,
    asin,
    brand: "Acme",
    title: asin ? `Acme Ice Maker ${asin}` : null,
    priceBefore: null,
    priceAfter: null,
    priceChangeRate: null,
    reviewCountBefore: null,
    reviewCountAfter: null,
    reviewCountChange: null,
    couponBefore: null,
    couponAfter: eventType === "coupon_start" ? "Save $20" : null,
    dealType: eventType === "deal_start" ? "Limited Time Deal" : null,
    rankBefore: null,
    rankAfter,
    rankChange: null,
    keywordRankBefore: null,
    keywordRankAfter: null,
    eventSummary: eventType,
    possibleStrategy: eventType,
    suggestedAction: "review"
  };
}

describe("brand playbook routes", () => {
  it("builds an evidence-backed brand playbook from existing category evidence", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const app = createApiApp(store);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Ice-Makers/zgbs",
      crawlTopN: 100,
      status: "enabled"
    });

    const day18 = [
      product(category, "2026-06-18", 8, "B0ACMEA001", "Acme", 200, null, null, null, null, 500),
      product(category, "2026-06-18", 35, "B0ACMEB002", "Acme", 250, null, null, null, null, 800)
    ];
    const day19 = [
      product(category, "2026-06-19", 5, "B0ACMEA001", "Acme", 180, "Save $20", 20, null, null, 520),
      product(category, "2026-06-19", 45, "B0ACMEC003", "Acme", 120, "Save 10%", null, 0.1, null, 30)
    ];
    const day20 = [
      product(category, "2026-06-20", 9, "B0ACMEA001", "Acme", 190, null, null, null, null, 530),
      product(category, "2026-06-20", 18, "B0ACMEC003", "Acme", 110, null, null, null, "Limited Time Deal", 45)
    ];

    for (const items of [day18, day19, day20]) {
      store.insertCategorySnapshots(items);
      store.replaceProductPriceHistoryForDate(category.id, items[0].snapshotDate, items);
    }
    store.replaceBrandMatrix(category.id, "2026-06-18", [brandMatrix(category, "2026-06-18", { top100: 2, top50: 2, top20: 1, newEntries: 0, rankUp: 0, rankDown: 0, coupon: 0, deal: 0, topAsins: ["B0ACMEA001", "B0ACMEB002"] })]);
    store.replaceBrandMatrix(category.id, "2026-06-19", [brandMatrix(category, "2026-06-19", { top100: 2, top50: 2, top20: 1, newEntries: 1, rankUp: 2, rankDown: 0, coupon: 2, deal: 0, topAsins: ["B0ACMEA001", "B0ACMEC003"] })]);
    store.replaceBrandMatrix(category.id, "2026-06-20", [brandMatrix(category, "2026-06-20", { top100: 2, top50: 2, top20: 2, newEntries: 0, rankUp: 1, rankDown: 1, coupon: 0, deal: 1, topAsins: ["B0ACMEA001", "B0ACMEC003"] })]);
    store.replaceCategoryActivityEvents(category.id, "2026-06-19", [
      activity(category, "2026-06-19", "coupon_start", "B0ACMEA001", 5),
      activity(category, "2026-06-19", "price_drop", "B0ACMEA001", 5),
      activity(category, "2026-06-19", "new_entry_top50", "B0ACMEC003", 45),
      activity(category, "2026-06-19", "brand_matrix_push", null, null, "high")
    ]);
    store.replaceCategoryActivityEvents(category.id, "2026-06-20", [
      activity(category, "2026-06-20", "deal_start", "B0ACMEC003", 18),
      activity(category, "2026-06-20", "rank_surge", "B0ACMEC003", 18, "high")
    ]);

    const response = await request(app)
      .get(`/api/brand-playbooks?categoryId=${category.id}&brand=Acme&date=2026-06-20&windowDays=3`)
      .expect(200);

    expect(response.body).toMatchObject({
      categoryId: category.id,
      brand: "Acme",
      windowDays: 3,
      observedDays: 3,
      commonPriceBand: { sampleSize: 6, minPrice: 108, maxPrice: 250 },
      couponIntensity: { sampleSize: 6, activeAsinDays: 2, activeRate: 0.3333, couponEventCount: 1 },
      activityFrequency: { totalEvents: 6, dailyAverage: 2, dealEventCount: 1, brandMatrixPushCount: 1 },
      asinCountChanges: { firstTop100Count: 2, latestTop100Count: 2, top100Change: 0, latestTop20Count: 2 },
      newProductLaunchFrequency: { newEntryCount: 1, newEntryDays: 1 },
      surgeCycle: { surgeDays: 2, lastSurgeDate: "2026-06-20" }
    });
    expect(response.body.historicalStrongAsins[0]).toMatchObject({ asin: "B0ACMEA001", bestRank: 5, daysInTop20: 3 });
    expect(response.body.evidenceItems).toEqual(expect.arrayContaining(["6 条价格历史 ASIN-天记录"]));
  });

  it("returns 400 for invalid query input and 404 for missing category", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const app = createApiApp(store);

    await request(app).get("/api/brand-playbooks?categoryId=abc&brand=Acme").expect(400);
    await request(app).get("/api/brand-playbooks?categoryId=999&brand=Acme&date=2026-06-20").expect(404);
  });
});
