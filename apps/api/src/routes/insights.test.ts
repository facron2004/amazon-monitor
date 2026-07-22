import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { BestsellerRankSnapshot, CategoryMonitor } from "@amazon-monitor/shared";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

describe("insight routes", () => {
  it("exposes the PRD BSR center contract", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const app = createApiApp(store);
    const api = request.agent(app);
    await api.post("/api/auth/login").send({ username: "admin", password: "admin123" }).expect(200);
    const category = store.createCategoryMonitor({
      name: "Ice Makers",
      marketplace: "amazon.com",
      categoryUrl: "https://www.amazon.com/Best-Sellers-Ice-Makers/zgbs",
      crawlTopN: 100,
      status: "enabled"
    });
    store.insertCategorySnapshots([
      product(category, "2026-06-19", 30, "B0RISER001", 199, null, null, 100),
      product(category, "2026-06-20", 8, "B0RISER001", 189, null, null, 120)
    ]);
    store.replaceBrandMatrix(category.id, "2026-06-20", [{
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      snapshotDate: "2026-06-20",
      brand: "Acme",
      productCountTop100: 1,
      productCountTop50: 1,
      productCountTop20: 1,
      bestRank: 8,
      averageRank: 8,
      newEntryCount: 0,
      droppedCount: 0,
      rankUpCount: 1,
      rankDownCount: 0,
      priceDownCount: 1,
      couponCount: 0,
      dealCount: 0,
      topAsins: ["B0RISER001"]
    }]);
    store.replaceCategoryActivityEvents(category.id, "2026-06-20", [{
      eventKey: "riser-1",
      eventDate: "2026-06-20",
      eventType: "rank_surge",
      eventLevel: "P1",
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      asin: "B0RISER001",
      brand: "Acme",
      title: "Acme Ice Maker",
      priceBefore: 199,
      priceAfter: 189,
      priceChangeRate: -0.05,
      couponBefore: null,
      couponAfter: null,
      dealType: null,
      rankBefore: 30,
      rankAfter: 8,
      rankChange: 22,
      keywordRankBefore: null,
      keywordRankAfter: null,
      eventSummary: "Rank surged",
      possibleStrategy: "Promotion",
      suggestedAction: "Review competitor"
    }]);

    expect((await api.get("/api/bsr/categories").expect(200)).body).toHaveLength(1);
    expect((await api.get(`/api/bsr/snapshots?categoryId=${category.id}&date=2026-06-20`).expect(200)).body[0].rank).toBe(8);
    expect((await api.get(`/api/bsr/diff?categoryId=${category.id}&date=2026-06-20&compareDate=2026-06-19`).expect(200)).body.categoryId).toBe(category.id);
    expect((await api.get(`/api/bsr/brand-matrix?categoryId=${category.id}&date=2026-06-20`).expect(200)).body[0].brand).toBe("Acme");
    expect((await api.get(`/api/bsr/new-risers?categoryId=${category.id}&date=2026-06-20`).expect(200)).body[0].asin).toBe("B0RISER001");
  });

  it("returns product price history for an ASIN and validates query input", async () => {
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

    const first = product(category, "2026-06-19", 10, "B0PRICE001", 199, null, null, 420);
    const second = product(category, "2026-06-20", 8, "B0PRICE001", 179, "Save $20", null, 450);
    store.insertCategorySnapshots([first]);
    store.replaceProductPriceHistoryForDate(category.id, first.snapshotDate, [first]);
    store.insertCategorySnapshots([second]);
    store.replaceProductPriceHistoryForDate(category.id, second.snapshotDate, [second]);

    const response = await request(app)
      .get(`/api/product-price-history?categoryId=${category.id}&asin=B0PRICE001&limit=30`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toMatchObject({
      snapshotDate: "2026-06-20",
      asin: "B0PRICE001",
      currentPrice: 179,
      couponText: "Save $20",
      reviewCountChange: 30
    });

    await request(app).get(`/api/product-price-history?categoryId=${category.id}&asin=B0PRICE001&limit=5001`).expect(400);
  });
});

function product(
  category: CategoryMonitor,
  date: string,
  rank: number,
  asin: string,
  price: number,
  couponText: string | null,
  dealBadge: string | null,
  reviewCount: number
): BestsellerRankSnapshot {
  return {
    categoryId: category.id,
    categoryName: category.name,
    marketplace: category.marketplace,
    snapshotDate: date,
    rank,
    asin,
    title: `Acme Ice Maker ${asin}`,
    brand: "Acme",
    imageUrl: `https://example.com/${asin}.jpg`,
    productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice: price,
    originalPrice: null,
    couponText,
    couponValue: couponText ? 20 : null,
    couponRate: null,
    finalEstimatedPrice: couponText ? price - 20 : price,
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
