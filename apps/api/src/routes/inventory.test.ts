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
    sku: "ICE-INV-001",
    asin: "B0INVICE01",
    brand: "Acme",
    title: "Acme Countertop Ice Maker",
    status: "active"
  });
  productId = product.id;
});

afterEach(() => {
  db.close();
});

describe("inventory routes", () => {
  it("saves replenishment settings and returns a critical reorder plan", async () => {
    await request(app)
      .post(`/api/products/${productId}/metrics`)
      .set("Cookie", token)
      .send({
        date: "2026-07-06",
        unitsSold: 15,
        inventoryAvailable: 150,
        inventoryDays: 10
      })
      .expect(201);

    await request(app)
      .post(`/api/products/${productId}/metrics`)
      .set("Cookie", token)
      .send({
        date: "2026-07-07",
        unitsSold: 15,
        inventoryAvailable: 135,
        inventoryDays: 9
      })
      .expect(201);

    await request(app)
      .post(`/api/products/${productId}/metrics`)
      .set("Cookie", token)
      .send({
        date: "2026-07-08",
        unitsSold: 15,
        inventoryAvailable: 120,
        inventoryDays: 8
      })
      .expect(201);

    const save = await request(app)
      .post(`/api/products/${productId}/inventory-setting`)
      .set("Cookie", token)
      .send({
        leadTimeDays: 20,
        safetyStockDays: 10,
        targetStockDays: 60,
        minOrderQuantity: 100,
        packSize: 20,
        supplierName: "Acme Supply"
      })
      .expect(201);

    expect(save.body.setting).toMatchObject({
      productId,
      leadTimeDays: 20,
      safetyStockDays: 10,
      targetStockDays: 60,
      minOrderQuantity: 100,
      packSize: 20,
      supplierName: "Acme Supply"
    });
    expect(save.body.plan).toMatchObject({
      productId,
      level: "critical",
      inventoryAvailable: 120,
      inventoryDays: 8,
      dailySalesVelocity: 15,
      reorderPointUnits: 450,
      recommendedOrderQuantity: 780,
      stockoutDate: "2026-07-16",
      reorderByDate: "2026-07-08"
    });

    const list = await request(app)
      .get("/api/inventory/plans?date=2026-07-08&level=critical")
      .set("Cookie", token)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      sku: "ICE-INV-001",
      level: "critical",
      issues: [{ type: "stockout_risk", priority: "P0" }]
    });

    const detail = await request(app)
      .get(`/api/products/${productId}/inventory-plan?date=2026-07-08`)
      .set("Cookie", token)
      .expect(200);
    expect(detail.body).toMatchObject({
      productId,
      setting: { supplierName: "Acme Supply" },
      recommendedOrderQuantity: 780
    });

    const taskResponse = await request(app)
      .post(`/api/products/${productId}/inventory-plan/task`)
      .set("Cookie", token)
      .send({ date: "2026-07-08" })
      .expect(201);

    expect(taskResponse.body).toMatchObject({
      created: true,
      task: {
        sourceType: "rule",
        sourceId: `inventory-plan:${productId}:2026-07-08:critical`,
        title: "补货确认：ICE-INV-001",
        taskType: "inventory",
        priority: "P0",
        dueDate: "2026-07-08",
        relatedAsin: "B0INVICE01",
        relatedBrand: "Acme"
      }
    });
    expect(taskResponse.body.task.description).toContain("建议数量：780 件");
    expect(taskResponse.body.task.description).toContain("供应商：Acme Supply");
    expect(taskResponse.body.task.aiRecommendation).toContain("所有采购、价格和广告动作必须人工确认");

    const repeated = await request(app)
      .post(`/api/products/${productId}/inventory-plan/task`)
      .set("Cookie", token)
      .send({ date: "2026-07-08" })
      .expect(200);
    expect(repeated.body).toMatchObject({
      created: false,
      task: { id: taskResponse.body.task.id }
    });

    const tasks = store.listTasks({
      orgId: store.listOrganizations()[0].id,
      sourceType: "rule",
      sourceId: `inventory-plan:${productId}:2026-07-08:critical`
    });
    expect(tasks).toHaveLength(1);
  });

  it("requires authentication for inventory plans", async () => {
    await request(app).get("/api/inventory/plans").expect(401);
  });

  it("does not create a task when the plan only contains data gaps", async () => {
    await request(app)
      .post(`/api/products/${productId}/inventory-plan/task`)
      .set("Cookie", token)
      .send({ date: "2026-07-08" })
      .expect(409, {
        message: "Inventory plan has no actionable replenishment or overstock signal"
      });
  });
});
