import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createStore, initSchema } from "../store.js";

describe("data source domain health", () => {
  it("keeps sales and inventory freshness independent by source, store, and marketplace", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const source = store.createDataSource({
      orgId: 1,
      name: "EU SP-API",
      sourceType: "amazon_sp_api"
    });
    const commerceStore = store.createCommerceStore({
      orgId: 1,
      name: "EU Seller",
      marketplace: "amazon.co.uk",
      sellerId: "EU-SELLER"
    });

    store.upsertDataSourceDomainHealth({
      orgId: 1,
      dataSourceId: source.id,
      commerceStoreId: commerceStore.id,
      marketplace: "UK",
      domain: "sales_traffic",
      status: "success",
      lastAttemptAt: "2026-07-28T01:00:00.000Z",
      lastSuccessAt: "2026-07-28T01:00:00.000Z",
      sourceTime: "2026-07-27"
    });
    store.upsertDataSourceDomainHealth({
      orgId: 1,
      dataSourceId: source.id,
      commerceStoreId: commerceStore.id,
      marketplace: "UK",
      domain: "fba_inventory",
      status: "failed",
      lastAttemptAt: "2026-07-28T01:05:00.000Z",
      errorCode: "QuotaExceeded",
      errorMessage: "Inventory request throttled"
    });

    const health = store.listDataSourceDomainHealth(source.id, 1);
    expect(health).toEqual([
      expect.objectContaining({
        domain: "fba_inventory",
        status: "failed",
        lastSuccessAt: null,
        errorCode: "QuotaExceeded"
      }),
      expect.objectContaining({
        domain: "sales_traffic",
        status: "success",
        lastSuccessAt: "2026-07-28T01:00:00.000Z",
        sourceTime: "2026-07-27"
      })
    ]);
  });

  it("preserves the last successful sales timestamp when a later sales attempt fails", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const source = store.createDataSource({ orgId: 1, name: "NA SP-API", sourceType: "amazon_sp_api" });
    const commerceStore = store.createCommerceStore({
      orgId: 1,
      name: "NA Seller",
      marketplace: "amazon.com",
      sellerId: "NA-SELLER"
    });
    const input = {
      orgId: 1,
      dataSourceId: source.id,
      commerceStoreId: commerceStore.id,
      marketplace: "US",
      domain: "sales_traffic" as const
    };

    store.upsertDataSourceDomainHealth({
      ...input,
      status: "success",
      lastSuccessAt: "2026-07-28T01:00:00.000Z"
    });
    const failed = store.upsertDataSourceDomainHealth({
      ...input,
      status: "failed",
      lastAttemptAt: "2026-07-28T02:00:00.000Z",
      errorMessage: "Report request failed"
    });

    expect(failed).toMatchObject({
      status: "failed",
      lastAttemptAt: "2026-07-28T02:00:00.000Z",
      lastSuccessAt: "2026-07-28T01:00:00.000Z",
      errorMessage: "Report request failed"
    });
  });

  it("rejects cross-organization source and store pairs", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createStore(db);
    const secondOrganization = store.createOrganization({ name: "Second organization" });
    const source = store.createDataSource({ orgId: 1, name: "First source", sourceType: "amazon_sp_api" });
    const secondStore = store.createCommerceStore({
      orgId: secondOrganization.id,
      name: "Second seller",
      marketplace: "amazon.de",
      sellerId: "SECOND-SELLER"
    });

    expect(() => store.upsertDataSourceDomainHealth({
      orgId: 1,
      dataSourceId: source.id,
      commerceStoreId: secondStore.id,
      marketplace: "DE",
      domain: "sales_traffic",
      status: "pending"
    })).toThrow("same organization");
  });
});
