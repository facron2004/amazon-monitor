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
  token = await login("admin", "admin123");
});

afterEach(() => db.close());

describe("promotion plan routes", () => {
  it("creates plans and derives preparation monitoring state", async () => {
    const { storeId, productId } = seedStoreAndProduct();
    const created = await createPlan(storeId, productId);
    expect(created).toMatchObject({
      storeName: "US Main",
      sku: "ICE-PROMO-1"
    });

    const preparation = await request(app)
      .get("/api/promotions?asOf=2026-07-10")
      .set("Cookie", token)
      .expect(200);
    expect(preparation.body[0]).toMatchObject({ monitorState: "preparation_due", daysUntilStart: 5 });

    const active = await request(app)
      .get("/api/promotions?asOf=2026-07-16")
      .set("Cookie", token)
      .expect(200);
    expect(active.body[0]).toMatchObject({ id: created.id, monitorState: "active" });

    const reviewDue = await request(app)
      .get("/api/promotions?asOf=2026-07-21")
      .set("Cookie", token)
      .expect(200);
    expect(reviewDue.body[0].monitorState).toBe("review_due");
  });

  it("creates preparation and review tasks idempotently", async () => {
    const { storeId, productId } = seedStoreAndProduct();
    const plan = await createPlan(storeId, productId);
    const first = await createPlanTask(plan.id, "preparation", 201);
    const repeated = await createPlanTask(plan.id, "preparation", 200);
    const review = await createPlanTask(plan.id, "review", 201);

    expect(first.body).toMatchObject({ created: true, task: { taskType: "other", relatedAsin: "B0PROMO0001" } });
    expect(repeated.body).toMatchObject({ created: false, task: { id: first.body.task.id } });
    expect(review.body).toMatchObject({ created: true, task: { taskType: "campaign_recap", dueDate: "2026-07-21" } });
    expect(store.listTasks({ orgId: 1 })).toHaveLength(2);
  });

  it("rejects cross-marketplace, cross-store, and cross-organization relations", async () => {
    const { storeId, productId } = seedStoreAndProduct();
    await request(app)
      .post("/api/promotions")
      .set("Cookie", token)
      .send(planPayload(storeId, productId, "JP"))
      .expect(400);

    const outlet = store.createCommerceStore({ orgId: 1, name: "US Outlet", marketplace: "US", sellerId: "OUTLET" });
    await request(app)
      .post("/api/promotions")
      .set("Cookie", token)
      .send(planPayload(outlet.id, productId, "US"))
      .expect(409);

    const otherOrg = store.createOrganization({ name: "Other", plan: "standard" });
    const otherStore = store.createCommerceStore({ orgId: otherOrg.id, name: "Other", marketplace: "US", sellerId: "OTHER" });
    await request(app)
      .post("/api/promotions")
      .set("Cookie", token)
      .send(planPayload(otherStore.id, null, "US"))
      .expect(404);
  });

  it("allows read-only users to view plans but not mutate them", async () => {
    const { storeId, productId } = seedStoreAndProduct();
    await createPlan(storeId, productId);
    store.createUser({ orgId: 1, username: "promo-viewer", password: "Viewer123!", role: "viewer", displayName: "Viewer" });
    const viewerToken = await login("promo-viewer", "Viewer123!");

    await request(app).get("/api/promotions").set("Cookie", viewerToken).expect(200);
    await request(app)
      .post("/api/promotions")
      .set("Cookie", viewerToken)
      .send(planPayload(storeId, productId, "US"))
      .expect(403);
  });
});

async function login(username: string, password: string): Promise<string> {
  const response = await request(app).post("/api/auth/login").send({ username, password }).expect(200);
  return response.headers["set-cookie"][0] as string;
}

function seedStoreAndProduct(): { storeId: number; productId: number } {
  const account = store.createCommerceStore({ orgId: 1, name: "US Main", marketplace: "US", sellerId: "SELLER-PROMO" });
  const product = store.createProduct({
    orgId: 1,
    storeId: account.id,
    marketplace: "US",
    sku: "ICE-PROMO-1",
    asin: "B0PROMO0001",
    brand: "Northstar",
    title: "Promo Ice Maker"
  });
  return { storeId: account.id, productId: product.id };
}

async function createPlan(storeId: number, productId: number) {
  const response = await request(app)
    .post("/api/promotions")
    .set("Cookie", token)
    .send(planPayload(storeId, productId, "US"))
    .expect(201);
  return response.body as { id: number; monitorState: string; daysUntilStart: number };
}

function createPlanTask(id: number, kind: "preparation" | "review", status: number) {
  return request(app)
    .post(`/api/promotions/${id}/tasks`)
    .set("Cookie", token)
    .send({ kind })
    .expect(status);
}

function planPayload(storeId: number, productId: number | null, marketplace: string) {
  return {
    storeId,
    productId,
    name: "Prime Day Ice Maker",
    type: "prime_day",
    marketplace,
    startDate: "2026-07-15",
    endDate: "2026-07-20",
    targetPrice: 149.99,
    budget: 2500,
    inventoryTarget: 600
  };
}
