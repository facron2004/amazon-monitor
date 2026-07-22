import { DatabaseSync } from "node:sqlite";
import type { BestsellerRankSnapshot, SerpSnapshot } from "@amazon-monitor/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

describe("competitor organization scope", () => {
  it("lets organizations manage the same ASIN without sharing pool state or evidence", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const firstOrg = store.createOrganization({ name: "First competitor team" });
    const secondOrg = store.createOrganization({ name: "Second competitor team" });
    store.createUser({ orgId: firstOrg.id, username: "first-competitor", password: "password-1234", role: "product_researcher" });
    store.createUser({ orgId: secondOrg.id, username: "second-competitor", password: "password-1234", role: "product_researcher" });

    const app = createApiApp(store);
    const firstApi = request.agent(app);
    const secondApi = request.agent(app);
    await firstApi.post("/api/auth/login").send({ username: "first-competitor", password: "password-1234" }).expect(200);
    await secondApi.post("/api/auth/login").send({ username: "second-competitor", password: "password-1234" }).expect(200);

    const first = await addCompetitor(firstApi, "First team title");
    const second = await addCompetitor(secondApi, "Second team title");
    expect(first).toMatchObject({ orgId: firstOrg.id, asin: "B0SHARED01" });
    expect(second).toMatchObject({ orgId: secondOrg.id, asin: "B0SHARED01" });
    expect(second.id).not.toBe(first.id);

    expect(await listedTitles(firstApi)).toEqual(["First team title"]);
    expect(await listedTitles(secondApi)).toEqual(["Second team title"]);
    await firstApi.patch("/api/competitors/B0SHARED01/key").send({ isKeyCompetitor: true }).expect(200);
    expect((await firstApi.get("/api/competitors").expect(200)).body[0].isKeyCompetitor).toBe(true);
    expect((await secondApi.get("/api/competitors").expect(200)).body[0].isKeyCompetitor).toBe(false);

    db.prepare("UPDATE amazon_competitor_pool SET latest_product_url = ? WHERE org_id = ? AND asin = ?")
      .run("https://www.amazon.com/dp/B0SHARED01?team=first", firstOrg.id, "B0SHARED01");
    db.prepare("UPDATE amazon_competitor_pool SET latest_product_url = ? WHERE org_id = ? AND asin = ?")
      .run("https://www.amazon.com/dp/B0SHARED01?team=second", secondOrg.id, "B0SHARED01");
    expect((await firstApi.get("/api/competitors/B0SHARED01/link").expect(200)).body.url).toContain("team=first");
    expect((await secondApi.get("/api/competitors/B0SHARED01/link").expect(200)).body.url).toContain("team=second");

    const firstCategory = store.createCategoryMonitor(categoryInput(firstOrg.id, "First category"));
    const secondCategory = store.createCategoryMonitor(categoryInput(secondOrg.id, "Second category"));
    store.insertCategorySnapshots([
      snapshot(firstCategory.id, firstCategory.name, "First evidence title"),
      snapshot(secondCategory.id, secondCategory.name, "Second evidence title")
    ]);
    const firstKeyword = store.createKeyword({ orgId: firstOrg.id, keyword: "first keyword", marketplace: "amazon.com" });
    const secondKeyword = store.createKeyword({ orgId: secondOrg.id, keyword: "second keyword", marketplace: "amazon.com" });
    store.insertSnapshots([
      keywordSnapshot(firstKeyword.id, firstKeyword.keyword, "First keyword evidence"),
      keywordSnapshot(secondKeyword.id, secondKeyword.keyword, "Second keyword evidence")
    ]);

    expect((await firstApi.get(`/api/competitors/${first.id}`).expect(200)).body.title).toBe("First team title");
    await firstApi.get(`/api/competitors/${second.id}`).expect(404);
    const firstSnapshots = await firstApi.get(`/api/competitors/${first.id}/snapshots?date=2026-07-18`).expect(200);
    expect(firstSnapshots.body.map((item: { sourceType: string }) => item.sourceType).sort()).toEqual(["category", "keyword"]);
    expect(firstSnapshots.body.map((item: { title: string }) => item.title).sort()).toEqual(["First evidence title", "First keyword evidence"]);
    const firstPage = await firstApi.get(`/api/competitors/${first.id}/snapshots?date=2026-07-18&limit=1`).expect(200);
    const secondPage = await firstApi.get(`/api/competitors/${first.id}/snapshots?date=2026-07-18&limit=1&offset=1`).expect(200);
    expect(firstPage.body).toHaveLength(1);
    expect(secondPage.body).toHaveLength(1);
    expect(secondPage.body[0].id).not.toBe(firstPage.body[0].id);
    await firstApi.get(`/api/competitors/${second.id}/snapshots`).expect(404);

    const firstTimeline = await firstApi.get(`/api/competitors/${first.id}/timeline?date=2026-07-18&limitDays=30`).expect(200);
    expect(firstTimeline.body).toMatchObject({ asin: "B0SHARED01", marketplace: "amazon.com" });
    expect(firstTimeline.body.days[0].categoryRanks).toHaveLength(1);
    expect(firstTimeline.body.days[0].keywordRanks).toHaveLength(1);
    await firstApi.get(`/api/competitors/${second.id}/timeline`).expect(404);

    expect((await firstApi.get("/api/products/B0SHARED01/activity-calendar?date=2026-07-18").expect(200)).body.title)
      .toBe("First evidence title");
    expect((await secondApi.get("/api/products/B0SHARED01/activity-calendar?date=2026-07-18").expect(200)).body.title)
      .toBe("Second evidence title");

    expect((await firstApi.get("/api/dashboard/summary?date=2026-07-18").expect(200)).body.competitorCount).toBe(1);
    expect((await secondApi.get("/api/dashboard/summary?date=2026-07-18").expect(200)).body.competitorCount).toBe(1);
  });
});

async function addCompetitor(api: ReturnType<typeof request.agent>, title: string) {
  const response = await api.post("/api/competitors").send({
    asin: "B0SHARED01",
    marketplace: "US",
    title
  }).expect(201);
  return response.body as { id: number; orgId: number; asin: string };
}

async function listedTitles(api: ReturnType<typeof request.agent>): Promise<string[]> {
  const response = await api.get("/api/competitors").expect(200);
  return response.body.map((item: { title: string }) => item.title) as string[];
}

function categoryInput(orgId: number, name: string) {
  return {
    orgId,
    name,
    marketplace: "amazon.com",
    categoryUrl: `https://www.amazon.com/Best-Sellers/${encodeURIComponent(name)}`,
    crawlTopN: 100,
    status: "enabled" as const
  };
}

function snapshot(categoryId: number, categoryName: string, title: string): BestsellerRankSnapshot {
  return {
    categoryId, categoryName, marketplace: "amazon.com", snapshotDate: "2026-07-18", rank: 1,
    asin: "B0SHARED01", title, brand: "Acme", imageUrl: "", productUrl: "https://www.amazon.com/dp/B0SHARED01",
    currentPrice: 99, originalPrice: null, couponText: null, couponValue: null, couponRate: null,
    finalEstimatedPrice: 99, currency: "$", rating: 4.5, reviewCount: 100, iceType: "bullet",
    isPrime: true, dealBadge: null, bsrRank: 1, bsrCategory: categoryName
  };
}

function keywordSnapshot(keywordId: number, keyword: string, title: string): SerpSnapshot {
  return {
    keywordId, keyword, marketplace: "amazon.com", snapshotDate: "2026-07-18", pageNo: 1,
    positionInPage: 1, absoluteRank: 2, organicRank: 2, sponsoredRank: null,
    asin: "B0SHARED01", title, brand: "Acme", imageUrl: "", productUrl: "https://www.amazon.com/dp/B0SHARED01",
    currentPrice: 98, originalPrice: null, couponText: "Save 5%", couponValue: null, couponRate: 0.05,
    finalEstimatedPrice: 93.1, currency: "$", rating: 4.6, reviewCount: 110, iceType: "bullet",
    isSponsored: false, isPrime: true, dealBadge: null, deliveryText: null, bsrRank: 2,
    bsrCategory: "Ice Makers", bsrText: "#2 in Ice Makers", bestsellerRanks: [], detailCollectedAt: null
  };
}
