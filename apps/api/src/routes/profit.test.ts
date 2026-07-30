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
  return response.headers["set-cookie"][0] as string;
}

async function loginAs(username: string, password: string): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ username, password })
    .expect(200);
  return response.headers["set-cookie"][0] as string;
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
      .set("Cookie", token)
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
      .set("Cookie", token)
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
      .set("Cookie", token)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      sku: "ICE-PROFIT-001",
      minimumSafePrice: 196.77
    });

    const detail = await request(app)
      .get(`/api/products/${productId}/profit-plan?date=2026-07-08`)
      .set("Cookie", token)
      .expect(200);
    expect(detail.body.scenarios).toHaveLength(4);

    const taskResponse = await request(app)
      .post(`/api/products/${productId}/profit-plan/task`)
      .set("Cookie", token)
      .send({ date: "2026-07-08", actionKind: "target_margin" })
      .expect(201);
    expect(taskResponse.body).toMatchObject({
      created: true,
      option: {
        kind: "target_margin",
        price: 234.62,
        marginRate: 0.3,
        safe: true
      },
      task: {
        sourceType: "rule",
        sourceId: `profit-plan:${productId}:2026-07-08:target_margin`,
        title: "价格调整评审：ICE-PROFIT-001 · 目标毛利价",
        taskType: "price",
        priority: "P1",
        dueDate: "2026-07-08"
      }
    });
    expect(taskResponse.body.task.description).toContain("竞品证据缺口");
    expect(taskResponse.body.task.description).toContain("不会自动改价");

    const repeated = await request(app)
      .post(`/api/products/${productId}/profit-plan/task`)
      .set("Cookie", token)
      .send({ date: "2026-07-08", actionKind: "target_margin" })
      .expect(200);
    expect(repeated.body).toMatchObject({
      created: false,
      task: { id: taskResponse.body.task.id }
    });

    await request(app)
      .post(`/api/products/${productId}/profit-plan/task`)
      .set("Cookie", token)
      .send({ date: "2026-07-08", actionKind: "coupon_15" })
      .expect(409);
  });

  it("requires authentication for profit plans", async () => {
    await request(app).get("/api/profit/plans").expect(401);
  });

  it("returns summary profit data to partial roles and reserves costs for managers", async () => {
    await request(app)
      .post(`/api/products/${productId}/metrics`)
      .set("Cookie", token)
      .send({ date: "2026-07-08", salesAmount: 2200, unitsSold: 10, adSpend: 100, tacos: 0.045 })
      .expect(201);
    await request(app)
      .post(`/api/products/${productId}/profit-setting`)
      .set("Cookie", token)
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

    store.createUser({ orgId: 1, username: "profit-operator", password: "Operator123!", role: "operator" });
    store.createUser({ orgId: 1, username: "profit-manager", password: "Manager123!", role: "manager" });
    store.createUser({ orgId: 1, username: "profit-ads", password: "AdsOperator123!", role: "ads_operator" });
    const operatorToken = await loginAs("profit-operator", "Operator123!");
    const managerToken = await loginAs("profit-manager", "Manager123!");
    const adsToken = await loginAs("profit-ads", "AdsOperator123!");

    const summary = await request(app)
      .get("/api/profit/plans?date=2026-07-08")
      .set("Cookie", operatorToken)
      .expect(200);
    expect(summary.body[0]).toMatchObject({
      setting: null,
      latestMetric: null,
      salesAmount: null,
      unitsSold: null,
      adSpend: null,
      adCostPerUnit: null,
      tacos: null,
      minimumSafePrice: 196.77
    });
    expect(summary.body[0].scenarios[0]).toMatchObject({
      marginRate: 0.2655,
      productCost: null,
      platformFees: null,
      adCost: null,
      netProfit: null,
      profitPerUnit: null
    });
    await request(app)
      .post(`/api/products/${productId}/profit-plan/task`)
      .set("Cookie", operatorToken)
      .send({ date: "2026-07-08", actionKind: "target_margin" })
      .expect(201);
    await request(app)
      .post(`/api/products/${productId}/profit-setting`)
      .set("Cookie", operatorToken)
      .send({ minimumMarginRate: 0.18 })
      .expect(403);

    const full = await request(app)
      .get(`/api/products/${productId}/profit-plan?date=2026-07-08`)
      .set("Cookie", managerToken)
      .expect(200);
    expect(full.body.setting).toMatchObject({ purchaseCost: 80, fbaFee: 20 });
    expect(full.body.scenarios[0]).toMatchObject({ productCost: 112, adCost: 10 });
    await request(app)
      .post(`/api/products/${productId}/profit-setting`)
      .set("Cookie", managerToken)
      .send({
        purchaseCost: 80,
        inboundFreight: 10,
        fbaFee: 20,
        referralFeeRate: 0.15,
        storageFee: 2,
        returnLossRate: 0.03,
        targetMarginRate: 0.3,
        minimumMarginRate: 0.18,
        dealFee: 5
      })
      .expect(201);

    await request(app)
      .get("/api/profit/plans")
      .set("Cookie", adsToken)
      .expect(403);
  });
});
