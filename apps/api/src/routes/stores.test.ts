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

describe("commerce store routes", () => {
  it("creates store accounts and scopes the list to the signed-in organization", async () => {
    const created = await createStoreAccount("US Main", "US", "SELLER-US-1");
    const otherOrg = store.createOrganization({ name: "Other Org", plan: "standard" });
    store.createCommerceStore({
      orgId: otherOrg.id,
      name: "Other Store",
      marketplace: "US",
      sellerId: "OTHER-SELLER"
    });

    const response = await request(app)
      .get("/api/stores?status=active")
      .set("x-amazon-monitor-session", token)
      .expect(200);

    expect(response.body).toEqual([expect.objectContaining({
      id: created.id,
      name: "US Main",
      marketplace: "US",
      sellerId: "SELLER-US-1",
      platform: "amazon"
    })]);
  });

  it("assigns and filters products by store while preserving unassigned legacy products", async () => {
    const account = await createStoreAccount("US Main", "US", "SELLER-US-1");
    const outlet = await createStoreAccount("US Outlet", "US", "SELLER-US-2");
    const assigned = await createProduct("SKU-ASSIGNED", "B0ASSIGNED1", account.id);
    await createProduct("SKU-LEGACY", "B0LEGACY001", null);

    expect(assigned.storeId).toBe(account.id);
    const filtered = await request(app)
      .get(`/api/products?storeId=${account.id}`)
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0]).toMatchObject({ sku: "SKU-ASSIGNED", storeId: account.id });

    const all = await request(app)
      .get("/api/products")
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(all.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ sku: "SKU-LEGACY", storeId: null })
    ]));

    const reassigned = await request(app)
      .patch(`/api/products/${assigned.id}`)
      .set("x-amazon-monitor-session", token)
      .send({ storeId: outlet.id })
      .expect(200);
    expect(reassigned.body.storeId).toBe(outlet.id);

    const unassigned = await request(app)
      .patch(`/api/products/${assigned.id}`)
      .set("x-amazon-monitor-session", token)
      .send({ storeId: null })
      .expect(200);
    expect(unassigned.body.storeId).toBeNull();
  });

  it("rejects cross-marketplace and paused-store assignments and protects assigned marketplaces", async () => {
    const account = await createStoreAccount("US Main", "US", "SELLER-US-1");
    const otherOrg = store.createOrganization({ name: "Other Org", plan: "standard" });
    const otherStore = store.createCommerceStore({
      orgId: otherOrg.id,
      name: "Other Store",
      marketplace: "US",
      sellerId: "OTHER-SELLER"
    });

    await request(app)
      .post("/api/products")
      .set("x-amazon-monitor-session", token)
      .send(productPayload("SKU-CROSS", "B0CROSSORG1", otherStore.id, "US"))
      .expect(404);

    await request(app)
      .post("/api/products")
      .set("x-amazon-monitor-session", token)
      .send(productPayload("SKU-JP", "B0JPMISMAT1", account.id, "JP"))
      .expect(400);

    await createProduct("SKU-US", "B0USMATCH01", account.id);
    await request(app)
      .patch(`/api/stores/${account.id}`)
      .set("x-amazon-monitor-session", token)
      .send({ marketplace: "JP" })
      .expect(409);

    await request(app)
      .patch(`/api/stores/${account.id}`)
      .set("x-amazon-monitor-session", token)
      .send({ status: "paused" })
      .expect(200);
    await request(app)
      .post("/api/products")
      .set("x-amazon-monitor-session", token)
      .send(productPayload("SKU-PAUSED", "B0PAUSED01", account.id, "US"))
      .expect(409);
  });

  it("allows operators to read stores but only admins can manage them", async () => {
    store.createUser({
      orgId: 1,
      username: "store-operator",
      password: "Operator123!",
      role: "operator",
      displayName: "Store Operator"
    });
    const operatorToken = await login("store-operator", "Operator123!");

    await request(app).get("/api/stores").set("x-amazon-monitor-session", operatorToken).expect(200);
    await request(app)
      .post("/api/stores")
      .set("x-amazon-monitor-session", operatorToken)
      .send({ name: "Blocked", marketplace: "US", sellerId: "BLOCKED" })
      .expect(403);
  });
});

async function login(username: string, password: string): Promise<string> {
  const response = await request(app).post("/api/auth/login").send({ username, password }).expect(200);
  return response.body.token as string;
}

async function createStoreAccount(name: string, marketplace: string, sellerId: string): Promise<{ id: number }> {
  const response = await request(app)
    .post("/api/stores")
    .set("x-amazon-monitor-session", token)
    .send({ name, marketplace, sellerId, authStatus: "connected" })
    .expect(201);
  return response.body as { id: number };
}

async function createProduct(sku: string, asin: string, storeId: number | null): Promise<{ id: number; storeId: number | null }> {
  const response = await request(app)
    .post("/api/products")
    .set("x-amazon-monitor-session", token)
    .send(productPayload(sku, asin, storeId, "US"))
    .expect(201);
  return response.body as { id: number; storeId: number | null };
}

function productPayload(sku: string, asin: string, storeId: number | null, marketplace: string) {
  return { storeId, marketplace, sku, asin, title: `${sku} product` };
}
