import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

let db: DatabaseSync;
let store: ReturnType<typeof createStore>;
let app: ReturnType<typeof createApiApp>;
let token: string;

beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
  app = createApiApp(store);
  const login = await request(app).post("/api/auth/login").send({ username: "admin", password: "admin123" }).expect(200);
  token = login.body.token as string;
});

afterEach(() => db.close());

describe("dashboard operations overview", () => {
  it("aggregates exact-date marketplace metrics and organization-scoped workflow counts", async () => {
    const usProduct = createProduct(1, "US", "SKU-US", "B0DASHUS01");
    const deProduct = createProduct(1, "DE", "SKU-DE", "B0DASHDE01");
    addMetric(usProduct.id, "2026-07-15", { salesAmount: 1000, orders: 10 });
    addMetric(usProduct.id, "2026-07-16", {
      salesAmount: 1200,
      orders: 12,
      adSpend: 120,
      adSales: 600,
      acos: 0.99,
      grossMargin: 0.3,
      inventoryDays: 10
    });
    addMetric(deProduct.id, "2026-07-16", {
      salesAmount: 800,
      orders: 8,
      adSpend: 80,
      adSales: 200,
      grossMargin: 0.25,
      inventoryDays: 60
    });
    store.createTask(taskInput(1, "Open task"));
    const closedTask = store.createTask(taskInput(1, "Closed task"));
    store.updateTask(closedTask.id, { status: "reviewed" });

    const otherOrg = store.createOrganization({ name: "Other", plan: "standard" });
    const otherProduct = createProduct(otherOrg.id, "US", "SKU-OTHER", "B0DASHOTH1");
    addMetric(otherProduct.id, "2026-07-16", { salesAmount: 9999, orders: 99, inventoryDays: 1 });
    store.createTask(taskInput(otherOrg.id, "Other task"));

    const response = await request(app)
      .get("/api/dashboard/summary?date=2026-07-16")
      .set("x-amazon-monitor-session", token)
      .expect(200);

    expect(response.body.operations).toMatchObject({
      date: "2026-07-16",
      activeProductCount: 2,
      productMetricCount: 2,
      inventoryRiskSkuCount: 1,
      openTaskCount: 1
    });
    expect(response.body.operations.marketplaces).toHaveLength(2);
    expect(response.body.operations.marketplaces[0]).toMatchObject({
      marketplace: "DE",
      salesAmount: 800,
      previousSalesAmount: null,
      orders: 8,
      adSpend: 80,
      acos: 0.4,
      grossMargin: 0.25
    });
    expect(response.body.operations.marketplaces[1]).toMatchObject({
      marketplace: "US",
      metricProductCount: 1,
      salesAmount: 1200,
      previousSalesAmount: 1000,
      orders: 12,
      adSpend: 120,
      acos: 0.2,
      grossMargin: 0.3
    });
    expect(response.body.operations.marketplaces[1].sevenDaySales).toHaveLength(7);
    expect(response.body.operations.marketplaces[1].sevenDaySales.at(-1)).toEqual({
      date: "2026-07-16",
      salesAmount: 1200
    });
    expect((await request(app).get("/api/dashboard/today-actions?date=2026-07-16").set("x-amazon-monitor-session", token).expect(200)).body).toEqual([]);
    expect((await request(app).get("/api/dashboard/events-feed?date=2026-07-16").set("x-amazon-monitor-session", token).expect(200)).body).toEqual([]);
  });

  it("requires a signed-in organization", async () => {
    await request(app).get("/api/dashboard/summary?date=2026-07-16").expect(401);
    await request(app).get("/api/dashboard/today-actions?date=2026-07-16").expect(401);
    await request(app).get("/api/dashboard/events-feed?date=2026-07-16").expect(401);
  });
});

function createProduct(orgId: number, marketplace: string, sku: string, asin: string) {
  return store.createProduct({ orgId, marketplace, sku, asin, title: `${sku} product` });
}

function addMetric(productId: number, date: string, values: {
  salesAmount: number;
  orders: number;
  adSpend?: number;
  adSales?: number;
  acos?: number;
  grossMargin?: number;
  inventoryDays?: number;
}) {
  store.upsertProductDailyMetric({ productId, date, ...values, lastSyncedAt: `${date}T08:00:00.000Z` });
}

function taskInput(orgId: number, title: string) {
  return {
    orgId,
    sourceType: "manual" as const,
    title,
    taskType: "other" as const,
    priority: "P2" as const,
    createdBy: 1
  };
}
