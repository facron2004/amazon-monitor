import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { BestsellerRankSnapshot, CategoryMonitor } from "@amazon-monitor/shared";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

describe("insight routes", () => {
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
