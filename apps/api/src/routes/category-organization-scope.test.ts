import { DatabaseSync } from "node:sqlite";
import type { BestsellerRankSnapshot, CategorySignalLog } from "@amazon-monitor/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

describe("category organization scope", () => {
  it("isolates category evidence, reports, dashboard counts, and collection jobs", async () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const firstOrg = store.createOrganization({ name: "First category team" });
    const secondOrg = store.createOrganization({ name: "Second category team" });
    store.createUser({ orgId: firstOrg.id, username: "first-category", password: "password-1234", role: "operator" });
    store.createUser({ orgId: secondOrg.id, username: "second-category", password: "password-1234", role: "operator" });

    const app = createApiApp(store);
    const firstApi = request.agent(app);
    const secondApi = request.agent(app);
    await firstApi.post("/api/auth/login").send({ username: "first-category", password: "password-1234" }).expect(200);
    await secondApi.post("/api/auth/login").send({ username: "second-category", password: "password-1234" }).expect(200);
    const firstCategory = await createCategory(firstApi, "First Ice Makers");
    const secondCategory = await createCategory(secondApi, "Second Ice Makers");

    store.insertCategorySnapshots([
      snapshot(firstCategory.id, firstCategory.name, "FIRSTCAT01"),
      snapshot(secondCategory.id, secondCategory.name, "SECONDCAT1")
    ]);
    store.replaceCategorySignals(firstCategory.id, "2026-07-18", [signal(firstCategory.id, firstCategory.name, "FIRSTCAT01")]);
    store.replaceCategorySignals(secondCategory.id, "2026-07-18", [signal(secondCategory.id, secondCategory.name, "SECONDCAT1")]);
    store.saveCategoryReport("2026-07-18", firstCategory.id, "first category report");
    store.saveCategoryReport("2026-07-18", secondCategory.id, "second category report");

    expect((await firstApi.get("/api/categories").expect(200)).body.map((item: { name: string }) => item.name)).toEqual(["First Ice Makers"]);
    const firstDetail = await firstApi.get(`/api/categories/${firstCategory.id}/detail?date=2026-07-18`).expect(200);
    expect(firstDetail.body.snapshots.map((item: { asin: string }) => item.asin)).toEqual(["FIRSTCAT01"]);
    await firstApi.get(`/api/categories/${secondCategory.id}/detail?date=2026-07-18`).expect(404);
    await firstApi.get(`/api/categories/${secondCategory.id}/diff?date=2026-07-18&compareDate=2026-07-17`).expect(404);

    const signals = await firstApi.get("/api/category-signals?date=2026-07-18").expect(200);
    expect(signals.body.map((item: { asin: string }) => item.asin)).toEqual(["FIRSTCAT01"]);
    const report = await firstApi.get("/api/reports/category?date=2026-07-18").expect(200);
    expect(report.body.markdown).toBe("first category report");
    const dashboard = await firstApi.get("/api/dashboard/summary?date=2026-07-18").expect(200);
    expect(dashboard.body).toMatchObject({ categoryMonitorCount: 1, categorySnapshotCount: 1, categorySignalCount: 1 });

    await firstApi.post(`/api/categories/${secondCategory.id}/collect`).send({ date: "2026-07-18" }).expect(404);
    const firstJob = await firstApi.post(`/api/categories/${firstCategory.id}/collect`).send({ date: "2026-07-18" }).expect(202);
    expect(firstJob.body.orgId).toBe(firstOrg.id);
    expect((await firstApi.get("/api/collectors/jobs").expect(200)).body.map((item: { id: number }) => item.id)).toEqual([firstJob.body.id]);
  });
});

async function createCategory(api: ReturnType<typeof request.agent>, name: string) {
  const response = await api.post("/api/categories").send({
    name,
    marketplace: "amazon.com",
    categoryUrl: `https://www.amazon.com/Best-Sellers/${encodeURIComponent(name)}`,
    crawlTopN: 100
  }).expect(201);
  return response.body as { id: number; name: string };
}

function snapshot(categoryId: number, categoryName: string, asin: string): BestsellerRankSnapshot {
  return {
    categoryId, categoryName, marketplace: "amazon.com", snapshotDate: "2026-07-18", rank: 1, asin,
    title: `${categoryName} product`, brand: "Acme", imageUrl: "", productUrl: `https://www.amazon.com/dp/${asin}`,
    currentPrice: 99, originalPrice: null, couponText: null, couponValue: null, couponRate: null,
    finalEstimatedPrice: 99, currency: "$", rating: 4.5, reviewCount: 100, iceType: "bullet",
    isPrime: true, dealBadge: null, bsrRank: 1, bsrCategory: categoryName
  };
}

function signal(categoryId: number, categoryName: string, asin: string): CategorySignalLog {
  return {
    signalDate: "2026-07-18", sourceType: "category", categoryId, categoryName, marketplace: "amazon.com",
    signalType: "new_top_20", alertLevel: "high", asin, brand: "Acme", title: `${categoryName} product`,
    rank: 1, previousRank: null, price: 99, previousPrice: null, content: "New Top 20 entry"
  };
}
