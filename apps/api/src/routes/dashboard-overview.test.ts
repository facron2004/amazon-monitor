import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";
import { loadDashboardEffectiveMarketplaceMetricRows } from "../store/dashboard-effective-sql.js";

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
  token = login.headers["set-cookie"][0] as string;
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
      .set("Cookie", token)
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
    expect((await request(app).get("/api/dashboard/today-actions?date=2026-07-16").set("Cookie", token).expect(200)).body).toEqual([]);
    expect((await request(app).get("/api/dashboard/events-feed?date=2026-07-16").set("Cookie", token).expect(200)).body).toEqual([]);
  });

  it("prefers the SP-API store daily sales fact without double-counting legacy product metrics", async () => {
    const source = store.createDataSource({
      orgId: 1,
      name: "US SP-API",
      sourceType: "amazon_sp_api"
    });
    const commerceStore = store.createCommerceStore({
      orgId: 1,
      name: "US Seller",
      marketplace: "amazon.com",
      sellerId: "DASH-SELLER"
    });
    const product = store.createProduct({
      orgId: 1,
      storeId: commerceStore.id,
      marketplace: "US",
      sku: "SKU-SP-DASH",
      asin: "B0DASHSP01",
      title: "SP dashboard product"
    });
    addMetric(product.id, "2026-07-16", {
      salesAmount: 1000,
      orders: 10,
      adSpend: 100,
      adSales: 500,
      grossMargin: 0.3
    });
    const salesRun = store.createDataSourceSyncRun({
      orgId: 1,
      dataSourceId: source.id,
      operation: "sp_api_sales_traffic_daily_sync",
      domain: "sales_traffic",
      credentialVersion: 1,
      idempotencyKey: "dashboard-store-daily"
    });
    store.promoteSpApiSalesTrafficFacts([{
      orgId: 1,
      dataSourceId: source.id,
      syncRunId: salesRun.id,
      commerceStoreId: commerceStore.id,
      marketplace: "US",
      businessDate: "2026-07-16",
      scope: "store_daily",
      salesAmount: 1234,
      orders: 12,
      unitsSold: 14,
      currency: "USD"
    }]);

    const response = await request(app)
      .get("/api/dashboard/summary?date=2026-07-16")
      .set("Cookie", token)
      .expect(200);

    expect(response.body.operations).toMatchObject({
      activeProductCount: 1,
      productMetricCount: 1
    });
    expect(response.body.operations.marketplaces).toEqual([
      expect.objectContaining({
        marketplace: "US",
        currency: "USD",
        metricProductCount: 1,
        salesAmount: 1234,
        orders: 12,
        adSpend: 100,
        acos: 0.2,
        grossMargin: null
      })
    ]);
  });

  it("uses the effective SKU override in dashboard aggregation when no store-daily fact exists", async () => {
    const apiSource = store.createDataSource({ orgId: 1, name: "US SKU SP-API", sourceType: "amazon_sp_api" });
    const commerceStore = store.createCommerceStore({
      orgId: 1,
      name: "US SKU seller",
      marketplace: "amazon.com",
      sellerId: "DASH-SKU-SELLER"
    });
    const salesRun = store.createDataSourceSyncRun({
      orgId: 1,
      dataSourceId: apiSource.id,
      operation: "sp_api_sales_traffic_daily_sync",
      domain: "sales_traffic",
      credentialVersion: 1,
      idempotencyKey: "dashboard-sku-sales"
    });
    const product = store.createProduct({
      orgId: 1,
      storeId: commerceStore.id,
      marketplace: "US",
      sku: "SKU-DASH-OVERRIDE",
      asin: "B0DASHOVR01",
      title: "Dashboard override product"
    });
    store.promoteSpApiSalesTrafficFacts([{
      orgId: 1,
      dataSourceId: apiSource.id,
      syncRunId: salesRun.id,
      commerceStoreId: commerceStore.id,
      marketplace: "US",
      businessDate: "2026-07-16",
      scope: "sku_daily",
      sellerSku: product.sku,
      productId: product.id,
      sourceAsin: product.asin,
      sessions: 70,
      orders: 3,
      unitsSold: 4,
      salesAmount: 120,
      currency: "USD"
    }]);
    store.upsertProductDailyMetric({
      productId: product.id,
      date: "2026-07-16",
      salesAmount: 999,
      orders: 9,
      adSpend: 100,
      adSales: 500,
      grossMargin: 0.3,
      dataSource: "manual"
    });
    const fileSource = store.createDataSource({ orgId: 1, name: "Dashboard override CSV", sourceType: "csv_import" });
    const fileRun = store.createDataSourceSyncRun({
      orgId: 1,
      dataSourceId: fileSource.id,
      operation: "product_csv_import",
      credentialVersion: 0,
      idempotencyKey: "dashboard-sku-override"
    });
    store.createDataSourceOverrideAudit({
      orgId: 1,
      dataSourceId: fileSource.id,
      syncRunId: fileRun.id,
      productId: product.id,
      domain: "sales_traffic",
      effectiveDate: "2026-07-16",
      fieldName: "salesAmount",
      previousDataSourceId: apiSource.id,
      previousSyncRunId: salesRun.id,
      previousValue: 120,
      newValue: 999,
      overriddenById: 1,
      reason: "Dashboard reconciliation",
      restoreOnSpApiSuccess: false
    });
    store.createDataSourceOverrideAudit({
      orgId: 1,
      dataSourceId: fileSource.id,
      syncRunId: fileRun.id,
      productId: product.id,
      domain: "sales_traffic",
      effectiveDate: "2026-07-16",
      fieldName: "orders",
      previousDataSourceId: apiSource.id,
      previousSyncRunId: salesRun.id,
      previousValue: 3,
      newValue: 9,
      overriddenById: 1,
      reason: "Dashboard reconciliation",
      restoreOnSpApiSuccess: false
    });

    const response = await request(app)
      .get("/api/dashboard/summary?date=2026-07-16")
      .set("Cookie", token)
      .expect(200);

    expect(response.body.operations.marketplaces).toEqual([
      expect.objectContaining({
        marketplace: "US",
        currency: "USD",
        metricProductCount: 1,
        salesAmount: 999,
        orders: 9,
        adSpend: 100,
        acos: 0.2,
        grossMargin: 0.3
      })
    ]);
  });

  it("restores a SKU override after a newer SP-API fact arrives", async () => {
    const apiSource = store.createDataSource({ orgId: 1, name: "US SKU SP-API restore", sourceType: "amazon_sp_api" });
    const commerceStore = store.createCommerceStore({
      orgId: 1,
      name: "US SKU restore seller",
      marketplace: "amazon.com",
      sellerId: "DASH-SKU-RESTORE"
    });
    const salesRun = store.createDataSourceSyncRun({
      orgId: 1,
      dataSourceId: apiSource.id,
      operation: "sp_api_sales_traffic_daily_sync",
      domain: "sales_traffic",
      credentialVersion: 1,
      idempotencyKey: "dashboard-sku-restore-sales"
    });
    const product = store.createProduct({
      orgId: 1,
      storeId: commerceStore.id,
      marketplace: "US",
      sku: "SKU-DASH-RESTORE",
      asin: "B0DASHREST01",
      title: "Dashboard restore product"
    });
    store.upsertProductDailyMetric({
      productId: product.id,
      date: "2026-07-17",
      salesAmount: 999,
      orders: 9,
      adSpend: 100,
      adSales: 500,
      grossMargin: 0.3,
      dataSource: "manual"
    });
    const fileSource = store.createDataSource({ orgId: 1, name: "Dashboard restore CSV", sourceType: "csv_import" });
    const fileRun = store.createDataSourceSyncRun({
      orgId: 1,
      dataSourceId: fileSource.id,
      operation: "product_csv_import",
      credentialVersion: 0,
      idempotencyKey: "dashboard-sku-restore-override"
    });
    const audit = store.createDataSourceOverrideAudit({
      orgId: 1,
      dataSourceId: fileSource.id,
      syncRunId: fileRun.id,
      productId: product.id,
      domain: "sales_traffic",
      effectiveDate: "2026-07-17",
      fieldName: "salesAmount",
      previousDataSourceId: apiSource.id,
      previousSyncRunId: salesRun.id,
      previousValue: 120,
      newValue: 999,
      overriddenById: 1,
      reason: "Dashboard restore verification",
      restoreOnSpApiSuccess: true
    });
    store.createDataSourceOverrideAudit({
      orgId: 1,
      dataSourceId: fileSource.id,
      syncRunId: fileRun.id,
      productId: product.id,
      domain: "sales_traffic",
      effectiveDate: "2026-07-17",
      fieldName: "orders",
      previousDataSourceId: apiSource.id,
      previousSyncRunId: salesRun.id,
      previousValue: 3,
      newValue: 9,
      overriddenById: 1,
      reason: "Dashboard restore verification",
      restoreOnSpApiSuccess: true
    });
    store.promoteSpApiSalesTrafficFacts([{
      orgId: 1,
      dataSourceId: apiSource.id,
      syncRunId: salesRun.id,
      commerceStoreId: commerceStore.id,
      marketplace: "US",
      businessDate: "2026-07-17",
      scope: "sku_daily",
      sellerSku: product.sku,
      productId: product.id,
      sourceAsin: product.asin,
      orders: 3,
      unitsSold: 4,
      salesAmount: 120,
      currency: "USD"
    }]);
    const newerSyncedAt = new Date(new Date(audit.createdAt).getTime() + 1000).toISOString();
    db.prepare(`
      UPDATE sp_api_sales_traffic_daily
      SET synced_at = ?
      WHERE product_id = ? AND business_date = ? AND scope = 'sku_daily'
    `).run(newerSyncedAt, product.id, "2026-07-17");

    const response = await request(app)
      .get("/api/dashboard/summary?date=2026-07-17")
      .set("Cookie", token)
      .expect(200);

    expect(response.body.operations.marketplaces).toEqual([
      expect.objectContaining({
        marketplace: "US",
        currency: "USD",
        metricProductCount: 1,
        salesAmount: 120,
        orders: 3,
        adSpend: 100,
        acos: 0.2,
        grossMargin: 0.3
      })
    ]);
  });

  it("does not hide an SP-API fallback when an audited manual row is absent", () => {
    const apiSource = store.createDataSource({ orgId: 1, name: "US SKU SP-API fallback", sourceType: "amazon_sp_api" });
    const commerceStore = store.createCommerceStore({
      orgId: 1,
      name: "US SKU fallback seller",
      marketplace: "amazon.com",
      sellerId: "DASH-SKU-FALLBACK"
    });
    const salesRun = store.createDataSourceSyncRun({
      orgId: 1,
      dataSourceId: apiSource.id,
      operation: "sp_api_sales_traffic_daily_sync",
      domain: "sales_traffic",
      credentialVersion: 1,
      idempotencyKey: "dashboard-sku-fallback-sales"
    });
    const product = store.createProduct({
      orgId: 1,
      storeId: commerceStore.id,
      marketplace: "US",
      sku: "SKU-DASH-FALLBACK",
      asin: "B0DASHFALL01",
      title: "Dashboard fallback product"
    });
    const fileSource = store.createDataSource({ orgId: 1, name: "Dashboard fallback CSV", sourceType: "csv_import" });
    const fileRun = store.createDataSourceSyncRun({
      orgId: 1,
      dataSourceId: fileSource.id,
      operation: "product_csv_import",
      credentialVersion: 0,
      idempotencyKey: "dashboard-sku-fallback-override"
    });
    const audit = store.createDataSourceOverrideAudit({
      orgId: 1,
      dataSourceId: fileSource.id,
      syncRunId: fileRun.id,
      productId: product.id,
      domain: "sales_traffic",
      effectiveDate: "2026-07-18",
      fieldName: "salesAmount",
      previousDataSourceId: apiSource.id,
      previousSyncRunId: salesRun.id,
      previousValue: 120,
      newValue: 999,
      overriddenById: 1,
      reason: "Dashboard fallback verification",
      restoreOnSpApiSuccess: true
    });
    store.promoteSpApiSalesTrafficFacts([{
      orgId: 1,
      dataSourceId: apiSource.id,
      syncRunId: salesRun.id,
      commerceStoreId: commerceStore.id,
      marketplace: "US",
      businessDate: "2026-07-18",
      scope: "sku_daily",
      sellerSku: product.sku,
      productId: product.id,
      sourceAsin: product.asin,
      orders: 3,
      salesAmount: 120,
      currency: "USD"
    }]);
    db.prepare(`
      UPDATE sp_api_sales_traffic_daily
      SET synced_at = ?
      WHERE product_id = ? AND business_date = ? AND scope = 'sku_daily'
    `).run(new Date(new Date(audit.createdAt).getTime() + 1000).toISOString(), product.id, "2026-07-18");

    expect(loadDashboardEffectiveMarketplaceMetricRows(db, 1, "2026-07-18", "2026-07-18")).toEqual([
      expect.objectContaining({
        marketplace: "US",
        currency: "USD",
        metric_date: "2026-07-18",
        metric_product_count: 1,
        sales_amount: 120,
        orders: 3
      })
    ]);
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
