import { DatabaseSync } from "node:sqlite";
import type { SerpSnapshot } from "@amazon-monitor/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

describe("keyword rank matrix route", () => {
  it("uses the latest available date and isolates owned products by organization", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const organization = store.createOrganization({ name: "Matrix org" });
    const otherOrganization = store.createOrganization({ name: "Other org" });
    store.createUser({
      orgId: organization.id,
      username: "matrix-user",
      password: "password-1234",
      role: "operator"
    });
    const keyword = store.createKeyword({ orgId: organization.id, keyword: "ice maker", marketplace: "amazon.com", priority: "S" });
    store.createProduct(productInput(organization.id, "OWNED00001"));
    store.createProduct(productInput(otherOrganization.id, "OTHER00001"));
    store.createManualCompetitor({
      asin: "COMPETE001",
      marketplace: "amazon.com",
      title: "Competitor ice maker"
    }, organization.id);
    store.insertSnapshots([
      snapshot(keyword.id, "OWNED00001", "2026-07-05", 24),
      snapshot(keyword.id, "OWNED00001", "2026-07-11", 12),
      snapshot(keyword.id, "OWNED00001", "2026-07-12", 7, { couponText: "Save $10" }),
      snapshot(keyword.id, "COMPETE001", "2026-07-12", 3, { dealBadge: "Limited time deal" }),
      snapshot(keyword.id, "OTHER00001", "2026-07-12", 1)
    ]);

    const api = request.agent(createApiApp(store));
    await api.post("/api/auth/login").send({ username: "matrix-user", password: "password-1234" }).expect(200);
    const response = await api.get("/api/keywords/rank-matrix?date=2026-07-13").expect(200);

    expect(response.body).toMatchObject({
      requestedDate: "2026-07-13",
      date: "2026-07-12",
      previousDate: "2026-07-11",
      sevenDayDate: "2026-07-05",
      isFallback: true
    });
    expect(response.body.products.map((item: { asin: string }) => item.asin)).toEqual(["OWNED00001", "COMPETE001"]);
    expect(response.body.rows[0].priority).toBe("S");
    expect(response.body.rows[0].cells[0]).toMatchObject({
      currentOrganicRank: 7,
      previousOrganicRank: 12,
      sevenDayOrganicRank: 24,
      sevenDayRankChange: 17,
      hasCoupon: true
    });
    expect(response.body.rows[0].cells[1]).toMatchObject({ currentOrganicRank: 3, hasDeal: true });
  });

  it("validates the requested date", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const organization = store.createOrganization({ name: "Matrix validation" });
    store.createUser({
      orgId: organization.id,
      username: "matrix-validation-user",
      password: "password-1234",
      role: "product_researcher"
    });
    const api = request.agent(createApiApp(store));
    await api.post("/api/auth/login").send({ username: "matrix-validation-user", password: "password-1234" }).expect(200);
    await api.get("/api/keywords/rank-matrix?date=not-a-date").expect(400);
  });
});

function productInput(orgId: number, asin: string) {
  return {
    orgId,
    marketplace: "amazon.com",
    sku: `SKU-${asin}`,
    asin,
    title: `${asin} ice maker`
  };
}

function snapshot(
  keywordId: number,
  asin: string,
  snapshotDate: string,
  organicRank: number,
  overrides: Partial<SerpSnapshot> = {}
): SerpSnapshot {
  return {
    keywordId,
    keyword: "ice maker",
    marketplace: "amazon.com",
    snapshotDate,
    pageNo: 1,
    positionInPage: organicRank,
    absoluteRank: organicRank,
    organicRank,
    sponsoredRank: null,
    asin,
    title: `${asin} ice maker`,
    brand: "Acme",
    imageUrl: "https://example.com/product.jpg",
    productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice: 99,
    originalPrice: null,
    couponText: null,
    couponValue: null,
    couponRate: null,
    finalEstimatedPrice: 99,
    currency: "$",
    rating: 4.5,
    reviewCount: 100,
    isSponsored: false,
    isPrime: true,
    dealBadge: null,
    deliveryText: null,
    bsrRank: null,
    bsrCategory: null,
    bsrText: null,
    bestsellerRanks: [],
    detailCollectedAt: null,
    ...overrides
  };
}
