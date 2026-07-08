import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { createStore, initSchema } from "../store.js";
import type { Store } from "../store/types.js";

let db: DatabaseSync;
let store: Store;
let app: ReturnType<typeof createApiApp>;
let token: string;
let productId: number;

async function loginAsAdmin(): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "admin123" })
    .expect(200);
  return response.body.token as string;
}

beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  initSchema(db);
  store = createStore(db);
  app = createApiApp(store);
  token = await loginAsAdmin();
  const org = store.listOrganizations()[0];
  const product = store.createProduct({
    orgId: org.id,
    marketplace: "US",
    sku: "ICE-PROFIT-001",
    asin: "B0PROFIT01",
    brand: "Acme",
    title: "Acme Countertop Ice Maker",
    status: "active"
  });
  productId = product.id;
});

afterEach(() => {
  db.close();
});

describe("profit routes", () => {
  it("saves cost assumptions and returns price safety scenarios", async () => {
    await request(app)
      .post(`/api/products/${productId}/metrics`)
      .set("x-amazon-monitor-session", token)
      .send({
        date: "2026-07-08",
        salesAmount: 2200,
        unitsSold: 10,
        adSpend: 100,
        tacos: 0.045,
        grossMargin: 0.36
      })
      .expect(201);

    const save = await request(app)
      .post(`/api/products/${productId}/profit-setting`)
      .set("x-amazon-monitor-session", token)
      .send({
        purchaseCost: 80,
        inboundFreight: 10,
        fbaFee: 20,
        referralFeeRate: 0.15,
        storageFee: 2,
        returnLossRate: 0.03,
        targetMarginRate: 0.3,
        minimumMarginRate: 0.2,
        dealFee: 5
      })
      .expect(201);

    expect(save.body.setting).toMatchObject({
      productId,
      purchaseCost: 80,
      fbaFee: 20,
      minimumMarginRate: 0.2
    });
    expect(save.body.plan).toMatchObject({
      productId,
      level: "watch",
      averageSellingPrice: 220,
      adCostPerUnit: 10,
      minimumSafePrice: 196.77,
      targetMarginPrice: 234.62
    });
    expect(save.body.plan.scenarios).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "current", price: 220, marginRate: 0.2655 }),
      expect.objectContaining({ kind: "coupon_15", price: 187, marginRate: 0.1676 }),
      expect.objectContaining({ kind: "deal", price: 176, marginRate: 0.0984 })
    ]));
    expect(save.body.plan.issues[0]).toMatchObject({
      type: "below_min_margin",
      priority: "P1"
    });

    const list = await request(app)
      .get("/api/profit/plans?date=2026-07-08&level=watch")
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      sku: "ICE-PROFIT-001",
      minimumSafePrice: 196.77
    });

    const detail = await request(app)
      .get(`/api/products/${productId}/profit-plan?date=2026-07-08`)
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(detail.body.scenarios).toHaveLength(4);
  });

  it("requires authentication for profit plans", async () => {
    await request(app).get("/api/profit/plans").expect(401);
  });
});
