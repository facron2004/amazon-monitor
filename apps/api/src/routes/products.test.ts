import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";

let db: DatabaseSync;
let store: ReturnType<typeof createStore>;
let app: ReturnType<typeof createApiApp>;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
  app = createApiApp(store);
});

afterEach(() => {
  db.close();
});

async function login(): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "admin123" })
    .expect(200);
  return response.headers["set-cookie"][0] as string;
}

describe("products API", () => {
  it("creates an owned SKU, stores daily metrics, and returns deterministic scores", async () => {
    const token = await login();
    const created = await request(app)
      .post("/api/products")
      .set("Cookie", token)
      .send({
        marketplace: "US",
        sku: "ICE-100",
        asin: "B0OWNICE01",
        brand: "Acme",
        title: "Acme Nugget Ice Maker",
        category: "Ice Makers"
      })
      .expect(201);

    const productId = created.body.id as number;
    await request(app)
      .post(`/api/products/${productId}/metrics`)
      .set("Cookie", token)
      .send({
        date: "2026-07-05",
        salesAmount: 1000,
        inventoryDays: 38,
        acos: 0.2,
        rating: 4.4,
        bsrRank: 80,
        keywordRank: 8
      })
      .expect(201);
    await request(app)
      .post(`/api/products/${productId}/metrics`)
      .set("Cookie", token)
      .send({
        date: "2026-07-06",
        salesAmount: 980,
        inventoryDays: 35,
        acos: 0.22,
        rating: 4.3,
        bsrRank: 78,
        keywordRank: 9
      })
      .expect(201);
    await request(app)
      .post(`/api/products/${productId}/metrics`)
      .set("Cookie", token)
      .send({
        date: "2026-07-07",
        salesAmount: 420,
        inventoryDays: 12,
        acos: 0.52,
        rating: 4.0,
        bsrRank: 95,
        keywordRank: 21
      })
      .expect(201);

    const list = await request(app)
      .get("/api/products?date=2026-07-07")
      .set("Cookie", token)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      sku: "ICE-100",
      asin: "B0OWNICE01",
      latestMetric: { date: "2026-07-07", salesAmount: 420 },
      riskScore: { level: "high" }
    });
    expect(list.body[0].riskScore.score).toBeGreaterThanOrEqual(70);

    const detail = await request(app)
      .get(`/api/products/${productId}?date=2026-07-07`)
      .set("Cookie", token)
      .expect(200);
    expect(detail.body.metrics).toHaveLength(3);

    const risk = await request(app)
      .get(`/api/products/${productId}/risk-score?date=2026-07-07`)
      .set("Cookie", token)
      .expect(200);
    expect(risk.body.dimensions.map((item: { key: string }) => item.key)).toContain("inventory");

    const opportunity = await request(app)
      .get(`/api/products/${productId}/opportunity-score?date=2026-07-07`)
      .set("Cookie", token)
      .expect(200);
    expect(opportunity.body).toMatchObject({ productId, asin: "B0OWNICE01" });
  });

  it("requires authentication for owned product data", async () => {
    await request(app).get("/api/products").expect(401);
  });

  it("blocks direct manual replacement of fresh SP-API sales fields", async () => {
    const token = await login();
    const source = store.createDataSource({ orgId: 1, name: "Products SP-API", sourceType: "amazon_sp_api" });
    const commerceStore = store.createCommerceStore({
      orgId: 1,
      name: "Products seller",
      marketplace: "amazon.com",
      sellerId: "PRODUCTS-SELLER"
    });
    const run = store.createDataSourceSyncRun({
      orgId: 1,
      dataSourceId: source.id,
      operation: "sp_api_sales_traffic_daily_sync",
      domain: "sales_traffic",
      credentialVersion: 1,
      idempotencyKey: "products-sp-api-sales"
    });
    const product = store.createProduct({
      orgId: 1,
      storeId: commerceStore.id,
      marketplace: "US",
      sku: "PRODUCTS-SP-1",
      asin: "B0PRODUCTS01",
      title: "Products API authority"
    });
    store.promoteSpApiSalesTrafficFacts([{
      orgId: 1,
      dataSourceId: source.id,
      syncRunId: run.id,
      commerceStoreId: commerceStore.id,
      marketplace: "US",
      businessDate: "2026-07-20",
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

    await request(app)
      .post(`/api/products/${product.id}/metrics`)
      .set("Cookie", token)
      .send({ date: "2026-07-20", salesAmount: 999, inventoryDays: 30 })
      .expect(409);
    await request(app)
      .post(`/api/products/${product.id}/metrics`)
      .set("Cookie", token)
      .send({ date: "2026-07-20", inventoryDays: 30 })
      .expect(201);

    expect(db.prepare(
      "SELECT sales_amount, inventory_days FROM own_product_daily_metrics WHERE product_id = ? AND metric_date = ?"
    ).get(product.id, "2026-07-20")).toEqual({ sales_amount: null, inventory_days: 30 });
    expect(store.listProductDailyMetrics(product.id)[0]).toMatchObject({ salesAmount: 120, inventoryDays: 30 });
  });
});
