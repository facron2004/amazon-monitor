import { DatabaseSync } from "node:sqlite";
import type { BestsellerRankSnapshot, CategoryMonitor } from "@amazon-monitor/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

describe("category diff route", () => {
  it("compares the requested category snapshot dates", async () => {
    const { api, store, orgId } = await setupAuthenticatedApi();
    const category = createCategory(store, orgId);
    store.insertCategorySnapshots([
      snapshot(category, "KEEP", "2026-07-06", 45, 129, null, 100),
      snapshot(category, "DROP", "2026-07-06", 20, 89, null, 70),
      snapshot(category, "KEEP", "2026-07-13", 10, 109, "Save $20", 130),
      snapshot(category, "NEW", "2026-07-13", 16, 79, null, 12)
    ]);

    const response = await api
      .get(`/api/categories/${category.id}/diff?date=2026-07-13&compareDate=2026-07-06`)
      .expect(200);

    expect(response.body).toMatchObject({
      categoryId: category.id,
      date: "2026-07-13",
      compareDate: "2026-07-06",
      currentCount: 2,
      compareCount: 2
    });
    expect(response.body.items.map((item: { asin: string }) => item.asin)).toEqual(["NEW", "DROP", "KEEP"]);
    expect(response.body.items.find((item: { asin: string }) => item.asin === "KEEP")).toMatchObject({
      currentRank: 10,
      previousRank: 45,
      rankChange: 35,
      priceChange: -20,
      reviewCountChange: 30
    });
  });

  it("rejects missing or non-historical comparison dates", async () => {
    const { api, store, orgId } = await setupAuthenticatedApi();
    const category = createCategory(store, orgId);
    await api.get(`/api/categories/${category.id}/diff?date=2026-07-13`).expect(400);
    await api
      .get(`/api/categories/${category.id}/diff?date=2026-07-13&compareDate=2026-07-13`)
      .expect(400, { message: "compareDate must be earlier than date" });
  });
});

async function setupAuthenticatedApi() {
  const db = new DatabaseSync(":memory:");
  initSchema(db);
  const store = createStore(db);
  const organization = store.createOrganization({ name: "Category diff" });
  store.createUser({
    orgId: organization.id,
    username: "category-diff-user",
    password: "password-1234",
    role: "product_researcher"
  });
  const api = request.agent(createApiApp(store));
  await api.post("/api/auth/login").send({ username: "category-diff-user", password: "password-1234" }).expect(200);
  return { api, store, orgId: organization.id };
}

function createCategory(store: ReturnType<typeof createStore>, orgId: number): CategoryMonitor {
  return store.createCategoryMonitor({
    orgId,
    name: "Ice Makers",
    marketplace: "amazon.com",
    categoryUrl: "https://www.amazon.com/Best-Sellers-Appliances-Ice-Makers/zgbs/appliances/2399939011",
    categoryPath: "Appliances > Ice Makers",
    crawlTopN: 100,
    status: "enabled"
  });
}

function snapshot(
  category: CategoryMonitor,
  asin: string,
  snapshotDate: string,
  rank: number,
  currentPrice: number,
  couponText: string | null,
  reviewCount: number
): BestsellerRankSnapshot {
  return {
    categoryId: category.id,
    categoryName: category.name,
    marketplace: category.marketplace,
    snapshotDate,
    rank,
    asin,
    title: `${asin} ice maker`,
    brand: "Acme",
    imageUrl: "https://example.com/product.jpg",
    productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice,
    originalPrice: null,
    couponText,
    couponValue: null,
    couponRate: null,
    finalEstimatedPrice: currentPrice,
    currency: "$",
    rating: 4.5,
    reviewCount,
    iceType: "bullet",
    isPrime: true,
    dealBadge: null,
    bsrRank: rank,
    bsrCategory: category.name
  };
}
