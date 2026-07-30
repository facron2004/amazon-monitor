import { DatabaseSync } from "node:sqlite";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiApp } from "../server.js";
import { buildWorkbookBuffer } from "../reports/excel-workbook.js";
import { createStore, initSchema } from "../store.js";
import type { Store } from "../store/types.js";

let db: DatabaseSync;
let store: Store;
let app: ReturnType<typeof createApiApp>;
let token: string;

function workbookPayload(rows: Array<Array<string | number>>): { format: "xlsx"; contentBase64: string; fileName: string } {
  return {
    format: "xlsx",
    contentBase64: buildWorkbookBuffer([{ name: "Import", rows }]).toString("base64"),
    fileName: "operations-import.xlsx"
  };
}

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
});

afterEach(() => {
  db.close();
});

describe("data source routes", () => {
  it("creates, filters, and updates data source sync state", async () => {
    const created = await request(app)
      .post("/api/data-sources")
      .set("Cookie", token)
      .send({
        name: "Amazon US SP-API",
        sourceType: "amazon_sp_api",
        marketplace: "US",
        status: "connected",
        syncStatus: "success",
        lastSyncedAt: "2026-07-09T01:00:00.000Z",
        lastSuccessAt: "2026-07-09T01:00:00.000Z",
        notes: "Daily orders and inventory source"
      })
      .expect(201);

    expect(created.body).toMatchObject({
      name: "Amazon US SP-API",
      sourceType: "amazon_sp_api",
      marketplace: "US",
      status: "connected",
      syncStatus: "success"
    });

    await request(app)
      .post("/api/data-sources")
      .set("Cookie", token)
      .send({
        name: "Amazon Ads CSV",
        sourceType: "csv_import",
        marketplace: "US",
        status: "attention",
        syncStatus: "failed",
        syncError: "Missing spend column"
      })
      .expect(201);

    const apiSources = await request(app)
      .get("/api/data-sources?sourceType=amazon_sp_api")
      .set("Cookie", token)
      .expect(200);
    expect(apiSources.body).toHaveLength(1);
    expect(apiSources.body[0].name).toBe("Amazon US SP-API");

    const updated = await request(app)
      .patch(`/api/data-sources/${created.body.id}`)
      .set("Cookie", token)
      .send({
        status: "attention",
        syncStatus: "partial",
        syncError: "Orders loaded, inventory file delayed"
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      status: "attention",
      syncStatus: "partial",
      syncError: "Orders loaded, inventory file delayed"
    });

    const attention = await request(app)
      .get("/api/data-sources?status=attention")
      .set("Cookie", token)
      .expect(200);
    expect(attention.body.map((item: { name: string }) => item.name)).toEqual([
      "Amazon US SP-API",
      "Amazon Ads CSV"
    ]);
  });

  it("requires authentication for data source access", async () => {
    await request(app).get("/api/data-sources").expect(401);
  });

  it("keeps data source management admin-only while allowing authenticated reads", async () => {
    store.createUser({
      orgId: 1,
      username: "data-operator",
      password: "Operator123!",
      role: "operator",
      displayName: "Data Operator"
    });
    const operatorToken = await loginAs("data-operator", "Operator123!");

    await request(app)
      .get("/api/data-sources")
      .set("Cookie", operatorToken)
      .expect(200);
    await request(app)
      .post("/api/data-sources")
      .set("Cookie", operatorToken)
      .send({ name: "Unauthorized source", sourceType: "csv_import" })
      .expect(403);
  });

  it("returns independent sales and inventory health for an SP-API source", async () => {
    const source = store.createDataSource({
      orgId: 1,
      name: "EU SP-API health",
      sourceType: "amazon_sp_api"
    });
    const commerceStore = store.createCommerceStore({
      orgId: 1,
      name: "EU health seller",
      marketplace: "amazon.co.uk",
      sellerId: "EU-HEALTH-SELLER"
    });
    store.upsertDataSourceDomainHealth({
      orgId: 1,
      dataSourceId: source.id,
      commerceStoreId: commerceStore.id,
      marketplace: "UK",
      domain: "sales_traffic",
      status: "success",
      lastSuccessAt: "2026-07-28T01:00:00.000Z"
    });
    store.upsertDataSourceDomainHealth({
      orgId: 1,
      dataSourceId: source.id,
      commerceStoreId: commerceStore.id,
      marketplace: "UK",
      domain: "fba_inventory",
      status: "failed",
      errorCode: "QuotaExceeded"
    });

    const health = await request(app)
      .get(`/api/data-sources/${source.id}/health`)
      .set("Cookie", token)
      .expect(200);

    expect(health.body).toMatchObject({
      dataSourceId: source.id,
      credentialsConfigured: false,
      status: "attention",
      linkedStoreIds: [commerceStore.id],
      domains: expect.arrayContaining([
        expect.objectContaining({ domain: "sales_traffic", status: "success" }),
        expect.objectContaining({ domain: "fba_inventory", status: "failed", errorCode: "QuotaExceeded" })
      ])
    });
  });

  it("stores SP-API credentials encrypted and exposes only connection metadata", async () => {
    const originalConnectorEnabled = process.env.SP_API_CONNECTOR_ENABLED;
    const originalCredentialsKey = process.env.DATA_SOURCE_CREDENTIALS_KEY;
    try {
      process.env.SP_API_CONNECTOR_ENABLED = "true";
      process.env.DATA_SOURCE_CREDENTIALS_KEY = Buffer.alloc(32, 3).toString("base64");
      const source = store.createDataSource({
        orgId: 1,
        name: "EU SP-API credentials",
        sourceType: "amazon_sp_api"
      });
      const commerceStore = store.createCommerceStore({
        orgId: 1,
        name: "EU credential seller",
        marketplace: "amazon.co.uk",
        sellerId: "EU-CREDENTIAL-SELLER"
      });
      const secret = "client-secret-not-to-return";
      const refreshToken = "Atzr|refresh-token-not-to-return";

      await request(app)
        .post(`/api/data-sources/${source.id}/sp-api/credentials`)
        .set("Cookie", token)
        .send({
          region: "EU",
          commerceStoreIds: [commerceStore.id],
          lwaClientId: "amzn1.application-oa2-client.test",
          lwaClientSecret: secret,
          lwaRefreshToken: refreshToken
        })
        .expect(204);

      const persisted = db.prepare(
        "SELECT credentials_ciphertext, credential_version FROM sp_api_connections WHERE data_source_id = ?"
      ).get(source.id) as { credentials_ciphertext: string; credential_version: number };
      expect(persisted).toMatchObject({ credential_version: 1 });
      expect(persisted.credentials_ciphertext).not.toContain(secret);
      expect(persisted.credentials_ciphertext).not.toContain(refreshToken);

      const health = await request(app)
        .get(`/api/data-sources/${source.id}/health`)
        .set("Cookie", token)
        .expect(200);
      expect(health.body).toMatchObject({
        dataSourceId: source.id,
        region: "EU",
        credentialsConfigured: true,
        linkedStoreIds: [commerceStore.id],
        lastTestedAt: null
      });
      expect(JSON.stringify(health.body)).not.toContain(secret);
      expect(JSON.stringify(health.body)).not.toContain(refreshToken);
    } finally {
      restoreEnv("SP_API_CONNECTOR_ENABLED", originalConnectorEnabled);
      restoreEnv("DATA_SOURCE_CREDENTIALS_KEY", originalCredentialsKey);
    }
  });

  it("queues an LWA connection test against the credential version that was saved", async () => {
    const originalConnectorEnabled = process.env.SP_API_CONNECTOR_ENABLED;
    const originalCredentialsKey = process.env.DATA_SOURCE_CREDENTIALS_KEY;
    try {
      process.env.SP_API_CONNECTOR_ENABLED = "true";
      process.env.DATA_SOURCE_CREDENTIALS_KEY = Buffer.alloc(32, 4).toString("base64");
      const source = store.createDataSource({
        orgId: 1,
        name: "NA SP-API connection test",
        sourceType: "amazon_sp_api"
      });
      const commerceStore = store.createCommerceStore({
        orgId: 1,
        name: "NA connection test seller",
        marketplace: "amazon.com",
        sellerId: "NA-CONNECTION-TEST-SELLER"
      });
      await request(app)
        .post(`/api/data-sources/${source.id}/sp-api/credentials`)
        .set("Cookie", token)
        .send({
          region: "NA",
          commerceStoreIds: [commerceStore.id],
          lwaClientId: "amzn1.application-oa2-client.test",
          lwaClientSecret: "client-secret-not-to-return",
          lwaRefreshToken: "Atzr|refresh-token-not-to-return"
        })
        .expect(204);

      const queued = await request(app)
        .post(`/api/data-sources/${source.id}/test-connection`)
        .set("Cookie", token)
        .expect(202);

      const run = store.getDataSourceSyncRun(queued.body.runId, 1);
      expect(run).toMatchObject({
        operation: "sp_api_connection_test",
        trigger: "manual",
        credentialVersion: 1,
        status: "pending"
      });
      expect(store.listJobs(10, 0, 1)).toEqual([
        expect.objectContaining({
          taskType: "data_source_sync",
          targetId: queued.body.runId,
          status: "pending"
        })
      ]);
    } finally {
      restoreEnv("SP_API_CONNECTOR_ENABLED", originalConnectorEnabled);
      restoreEnv("DATA_SOURCE_CREDENTIALS_KEY", originalCredentialsKey);
    }
  });

  it("allows a collection manager to queue idempotent Sales and FBA sync runs", async () => {
    const originalConnectorEnabled = process.env.SP_API_CONNECTOR_ENABLED;
    const originalCredentialsKey = process.env.DATA_SOURCE_CREDENTIALS_KEY;
    try {
      process.env.SP_API_CONNECTOR_ENABLED = "true";
      process.env.DATA_SOURCE_CREDENTIALS_KEY = Buffer.alloc(32, 6).toString("base64");
      const source = store.createDataSource({
        orgId: 1,
        name: "US SP-API manual sync",
        sourceType: "amazon_sp_api"
      });
      const commerceStore = store.createCommerceStore({
        orgId: 1,
        name: "US manual sync seller",
        marketplace: "amazon.com",
        sellerId: "US-MANUAL-SYNC-SELLER"
      });
      await request(app)
        .post(`/api/data-sources/${source.id}/sp-api/credentials`)
        .set("Cookie", token)
        .send({
          region: "NA",
          commerceStoreIds: [commerceStore.id],
          lwaClientId: "amzn1.application-oa2-client.test",
          lwaClientSecret: "client-secret-not-to-return",
          lwaRefreshToken: "Atzr|refresh-token-not-to-return"
        })
        .expect(204);
      store.createUser({
        orgId: 1,
        username: "sync-manager",
        password: "Manager123!",
        role: "manager",
        displayName: "Sync Manager"
      });
      const managerToken = await loginAs("sync-manager", "Manager123!");

      const queued = await request(app)
        .post(`/api/data-sources/${source.id}/sync`)
        .set("Cookie", managerToken)
        .send({ domains: ["sales_traffic", "fba_inventory"], mode: "incremental", marketplaces: ["US"] })
        .expect(202);
      expect(queued.body.runs).toEqual([
        expect.objectContaining({ domain: "sales_traffic", operation: "sp_api_sales_traffic_daily_sync", credentialVersion: 1 }),
        expect.objectContaining({ domain: "fba_inventory", operation: "sp_api_fba_inventory_incremental_sync", credentialVersion: 1 })
      ]);

      const repeated = await request(app)
        .post(`/api/data-sources/${source.id}/sync`)
        .set("Cookie", managerToken)
        .send({ domains: ["sales_traffic", "fba_inventory"], mode: "incremental", marketplaces: ["US"] })
        .expect(202);
      expect(repeated.body.runs.map((run: { id: number }) => run.id)).toEqual(queued.body.runs.map((run: { id: number }) => run.id));
      expect(store.listJobs(10, 0, 1)).toHaveLength(2);
    } finally {
      restoreEnv("SP_API_CONNECTOR_ENABLED", originalConnectorEnabled);
      restoreEnv("DATA_SOURCE_CREDENTIALS_KEY", originalCredentialsKey);
    }
  });

  it("rejects Sales backfills longer than 90 days", async () => {
    const originalConnectorEnabled = process.env.SP_API_CONNECTOR_ENABLED;
    const originalCredentialsKey = process.env.DATA_SOURCE_CREDENTIALS_KEY;
    try {
      process.env.SP_API_CONNECTOR_ENABLED = "true";
      process.env.DATA_SOURCE_CREDENTIALS_KEY = Buffer.alloc(32, 8).toString("base64");
      const source = store.createDataSource({ orgId: 1, name: "Backfill range", sourceType: "amazon_sp_api" });
      const commerceStore = store.createCommerceStore({
        orgId: 1,
        name: "Backfill seller",
        marketplace: "amazon.com",
        sellerId: "BACKFILL-SELLER"
      });
      await request(app)
        .post(`/api/data-sources/${source.id}/sp-api/credentials`)
        .set("Cookie", token)
        .send({
          region: "NA",
          commerceStoreIds: [commerceStore.id],
          lwaClientId: "amzn1.application-oa2-client.test",
          lwaClientSecret: "client-secret-not-to-return",
          lwaRefreshToken: "Atzr|refresh-token-not-to-return"
        })
        .expect(204);

      await request(app)
        .post(`/api/data-sources/${source.id}/sync`)
        .set("Cookie", token)
        .send({
          domains: ["sales_traffic"],
          mode: "backfill",
          marketplaces: ["US"],
          fromDate: "2026-01-01",
          toDate: "2026-04-01"
        })
        .expect(400);
    } finally {
      restoreEnv("SP_API_CONNECTOR_ENABLED", originalConnectorEnabled);
      restoreEnv("DATA_SOURCE_CREDENTIALS_KEY", originalCredentialsKey);
    }
  });

  it("rejects SP-API credential writes until the connector is explicitly enabled", async () => {
    const originalConnectorEnabled = process.env.SP_API_CONNECTOR_ENABLED;
    try {
      process.env.SP_API_CONNECTOR_ENABLED = "false";
      const source = store.createDataSource({
        orgId: 1,
        name: "Disabled SP-API connector",
        sourceType: "amazon_sp_api"
      });
      await request(app)
        .post(`/api/data-sources/${source.id}/sp-api/credentials`)
        .set("Cookie", token)
        .send({
          region: "NA",
          commerceStoreIds: [1],
          lwaClientId: "amzn1.application-oa2-client.test",
          lwaClientSecret: "client-secret-not-to-return",
          lwaRefreshToken: "Atzr|refresh-token-not-to-return"
        })
        .expect(409);
    } finally {
      restoreEnv("SP_API_CONNECTOR_ENABLED", originalConnectorEnabled);
    }
  });

  it("lists and resolves SP-API mapping issues without guessing a product identity", async () => {
    const source = store.createDataSource({
      orgId: 1,
      name: "EU SP-API mapping issues",
      sourceType: "amazon_sp_api"
    });
    const commerceStore = store.createCommerceStore({
      orgId: 1,
      name: "EU mapping seller",
      marketplace: "amazon.co.uk",
      sellerId: "EU-MAPPING-SELLER"
    });
    const product = store.createProduct({
      orgId: 1,
      storeId: commerceStore.id,
      marketplace: "UK",
      sku: "EU-SKU-1",
      asin: "B0EUMAP001",
      title: "Mapped EU product"
    });
    const issue = store.upsertDataSourceMappingIssue({
      orgId: 1,
      dataSourceId: source.id,
      commerceStoreId: commerceStore.id,
      marketplace: "UK",
      domain: "sales_traffic",
      issueType: "ambiguous_asin",
      sourceAsin: "B0EUMAP001",
      candidateProductIds: [product.id]
    });
    const repeated = store.upsertDataSourceMappingIssue({
      orgId: 1,
      dataSourceId: source.id,
      commerceStoreId: commerceStore.id,
      marketplace: "UK",
      domain: "sales_traffic",
      issueType: "ambiguous_asin",
      sourceAsin: "B0EUMAP001",
      candidateProductIds: [product.id]
    });
    expect(repeated).toMatchObject({ id: issue.id, occurrenceCount: 2, status: "open" });

    const listed = await request(app)
      .get(`/api/data-sources/${source.id}/mapping-issues?status=open&domain=sales_traffic`)
      .set("Cookie", token)
      .expect(200);
    expect(listed.body).toEqual([
      expect.objectContaining({
        id: issue.id,
        sourceAsin: "B0EUMAP001",
        candidateProductIds: [product.id],
        occurrenceCount: 2,
        status: "open"
      })
    ]);

    const resolved = await request(app)
      .patch(`/api/data-sources/${source.id}/mapping-issues/${issue.id}`)
      .set("Cookie", token)
      .send({ status: "resolved", productId: product.id, note: "Confirmed in Seller Central" })
      .expect(200);
    expect(resolved.body).toMatchObject({
      status: "resolved",
      resolvedProductId: product.id,
      resolutionNote: "Confirmed in Seller Central"
    });

    const health = await request(app)
      .get(`/api/data-sources/${source.id}/health`)
      .set("Cookie", token)
      .expect(200);
    expect(health.body).toMatchObject({ mappingIssueCount: 0 });
  });

  it("imports owned product metrics from a CSV source and reports partial rows", async () => {
    const source = await request(app)
      .post("/api/data-sources")
      .set("Cookie", token)
      .send({ name: "US operations CSV", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    const imported = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/products`)
      .set("Cookie", token)
      .send({
        csv: [
          "sku,asin,title,date,salesAmount,orders,inventoryAvailable",
          "SKU-1,B0TEST001,Hero product,2026-07-20,199.5,4,18",
          "SKU-2,B0TEST002,Broken product,2026-07-20,invalid,2,10"
        ].join("\n")
      })
      .expect(200);

    expect(imported.body).toMatchObject({
      totalRows: 2,
      importedRows: 1,
      failedRows: 1,
      createdProducts: 1,
      updatedProducts: 0,
      source: { status: "attention", syncStatus: "partial" }
    });
    expect(imported.body.errors[0]).toEqual({ row: 3, message: "salesAmount must be a number" });

    const product = store.getProductBySku(1, "US", "SKU-1");
    expect(product).toMatchObject({ asin: "B0TEST001", title: "Hero product", dataSource: "US operations CSV" });
    expect(store.listProductDailyMetrics(product!.id)).toEqual([
      expect.objectContaining({ date: "2026-07-20", salesAmount: 199.5, orders: 4, inventoryAvailable: 18 })
    ]);

    const updated = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/products`)
      .set("Cookie", token)
      .send({ csv: "sku,asin,title,date,salesAmount\nSKU-1,B0TEST001,Hero product,2026-07-20,249" })
      .expect(200);
    expect(updated.body).toMatchObject({ importedRows: 1, createdProducts: 0, updatedProducts: 1 });
    expect(store.listProductDailyMetrics(product!.id)[0]).toMatchObject({
      salesAmount: 249,
      orders: 4,
      inventoryAvailable: 18
    });

    const runs = await request(app)
      .get(`/api/data-sources/${source.body.id}/runs`)
      .set("Cookie", token)
      .expect(200);
    expect(runs.body).toEqual([
      expect.objectContaining({
        operation: "product_csv_import",
        status: "success",
        totalRows: 1,
        importedRows: 1,
        createdRecords: 0,
        updatedRecords: 1,
        initiatedByName: "Administrator"
      }),
      expect.objectContaining({
        operation: "product_csv_import",
        status: "partial",
        totalRows: 2,
        importedRows: 1,
        failedRows: 1,
        createdRecords: 1,
        updatedRecords: 0
      })
    ]);

    const partialRuns = await request(app)
      .get(`/api/data-sources/${source.body.id}/runs?status=partial`)
      .set("Cookie", token)
      .expect(200);
    expect(partialRuns.body).toHaveLength(1);
  });

  it("rejects malformed CSV and records the failed sync state", async () => {
    const source = await request(app)
      .post("/api/data-sources")
      .set("Cookie", token)
      .send({ name: "Malformed CSV", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    await request(app)
      .post(`/api/data-sources/${source.body.id}/import/products`)
      .set("Cookie", token)
      .send({ csv: "sku,date\nSKU-1,2026-07-20" })
      .expect(400);

    expect(store.getDataSource(source.body.id)).toMatchObject({
      status: "attention",
      syncStatus: "failed",
      syncError: "Missing required headers: asin, title"
    });
    const runs = await request(app)
      .get(`/api/data-sources/${source.body.id}/runs`)
      .set("Cookie", token)
      .expect(200);
    expect(runs.body).toEqual([
      expect.objectContaining({
        operation: "product_csv_import",
        status: "failed",
        totalRows: 0,
        errorSummary: "Missing required headers: asin, title"
      })
    ]);
  });

  it("imports product and Ads rows from Excel and records format-specific sync runs", async () => {
    const source = await request(app)
      .post("/api/data-sources")
      .set("Cookie", token)
      .send({ name: "US Excel operations", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    const products = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/products`)
      .set("Cookie", token)
      .send(workbookPayload([
        ["sku", "asin", "title", "date", "salesAmount", "orders"],
        ["XLSX-SKU-1", "B0XLSX0001", "Excel product", "2026-07-21", 320.5, 6],
        ["XLSX-SKU-2", "B0XLSX0002", "Broken product", "2026-07-21", "invalid", 1]
      ]))
      .expect(200);

    expect(products.body).toMatchObject({
      totalRows: 2,
      importedRows: 1,
      failedRows: 1,
      createdProducts: 1,
      source: { syncStatus: "partial" }
    });
    expect(products.body.errors).toEqual([{ row: 3, message: "salesAmount must be a number" }]);
    const product = store.getProductBySku(1, "US", "XLSX-SKU-1");
    expect(store.listProductDailyMetrics(product!.id)[0]).toMatchObject({ salesAmount: 320.5, orders: 6 });

    const ads = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/ads`)
      .set("Cookie", token)
      .send(workbookPayload([
        ["date", "campaignId", "campaignName", "sku", "impressions", "clicks", "spend", "sales"],
        ["2026-07-21", "XLSX-CAMP-1", "Excel campaign", "XLSX-SKU-1", 1200, 80, 42, 168]
      ]))
      .expect(200);

    expect(ads.body).toMatchObject({ importedRows: 1, failedRows: 0, createdMetrics: 1 });
    expect(store.listAdDailyMetrics({ orgId: 1 })[0]).toMatchObject({
      campaignId: "XLSX-CAMP-1",
      productId: product!.id,
      impressions: 1200,
      spend: 42,
      sales: 168
    });

    const runs = await request(app)
      .get(`/api/data-sources/${source.body.id}/runs`)
      .set("Cookie", token)
      .expect(200);
    expect(runs.body).toEqual([
      expect.objectContaining({ operation: "ads_excel_import", status: "success" }),
      expect.objectContaining({ operation: "product_excel_import", status: "partial", failedRows: 1 })
    ]);
  });

  it("imports cost settings from Excel and preserves omitted values on CSV updates", async () => {
    const product = store.createProduct({
      orgId: 1,
      marketplace: "US",
      sku: "COST-SKU-1",
      asin: "B0COST0001",
      title: "Cost import product"
    });
    const source = await request(app)
      .post("/api/data-sources")
      .set("Cookie", token)
      .send({ name: "US cost workbook", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    const imported = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/costs`)
      .set("Cookie", token)
      .send(workbookPayload([
        ["sku", "purchaseCost", "inboundFreight", "fbaFee", "referralFeeRate", "targetMarginRate"],
        ["COST-SKU-1", 28.5, 4.2, 7.1, "15%", "32%"],
        ["MISSING-SKU", 12, 2, 4, "15%", "30%"]
      ]))
      .expect(200);

    expect(imported.body).toMatchObject({
      totalRows: 2,
      importedRows: 1,
      failedRows: 1,
      createdSettings: 1,
      updatedSettings: 0,
      source: { syncStatus: "partial" }
    });
    expect(imported.body.errors).toEqual([
      { row: 3, message: "product not found for sku MISSING-SKU in US" }
    ]);
    expect(store.getProfitSetting(product.id)).toMatchObject({
      purchaseCost: 28.5,
      inboundFreight: 4.2,
      fbaFee: 7.1,
      referralFeeRate: 0.15,
      targetMarginRate: 0.32,
      dataSource: "US cost workbook",
      syncStatus: "success"
    });

    const updated = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/costs`)
      .set("Cookie", token)
      .send({ format: "csv", content: "sku,purchaseCost\nCOST-SKU-1,30" })
      .expect(200);
    expect(updated.body).toMatchObject({ importedRows: 1, createdSettings: 0, updatedSettings: 1 });
    expect(store.getProfitSetting(product.id)).toMatchObject({
      purchaseCost: 30,
      inboundFreight: 4.2,
      referralFeeRate: 0.15,
      targetMarginRate: 0.32
    });

    const runs = await request(app)
      .get(`/api/data-sources/${source.body.id}/runs`)
      .set("Cookie", token)
      .expect(200);
    expect(runs.body).toEqual([
      expect.objectContaining({ operation: "cost_csv_import", status: "success", updatedRecords: 1 }),
      expect.objectContaining({ operation: "cost_excel_import", status: "partial", createdRecords: 1, failedRows: 1 })
    ]);
  });

  it("imports inventory supply settings and uses supply position in replenishment plans", async () => {
    const product = store.createProduct({
      orgId: 1,
      marketplace: "US",
      sku: "INV-SKU-1",
      asin: "B0INV00001",
      title: "Inventory import product"
    });
    store.upsertProductDailyMetric({
      productId: product.id,
      date: "2026-07-21",
      unitsSold: 10,
      inventoryAvailable: 100,
      inventoryDays: 10
    });
    const source = await request(app)
      .post("/api/data-sources")
      .set("Cookie", token)
      .send({ name: "US inventory workbook", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    const imported = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/inventory`)
      .set("Cookie", token)
      .send(workbookPayload([
        [
          "sku", "productionLeadTimeDays", "inboundLeadTimeDays", "safetyStockDays",
          "targetStockDays", "inTransitUnits", "localWarehouseUnits", "minOrderQuantity",
          "packSize", "supplierName", "expectedArrivalDate"
        ],
        ["INV-SKU-1", 12, 8, 10, 60, 100, 50, 200, 50, "Supplier A", "2026-08-10"],
        ["MISSING-SKU", 10, 5, 10, 45, 20, 10, 100, 10, "Supplier B", "2026-08-12"]
      ]))
      .expect(200);

    expect(imported.body).toMatchObject({
      totalRows: 2,
      importedRows: 1,
      failedRows: 1,
      createdSettings: 1,
      updatedSettings: 0,
      source: { syncStatus: "partial" }
    });
    expect(imported.body.errors).toEqual([
      { row: 3, message: "product not found for sku MISSING-SKU in US" }
    ]);
    expect(store.getInventorySetting(product.id)).toMatchObject({
      productionLeadTimeDays: 12,
      inboundLeadTimeDays: 8,
      inTransitUnits: 100,
      localWarehouseUnits: 50,
      expectedArrivalDate: "2026-08-10",
      supplierName: "Supplier A",
      dataSource: "US inventory workbook"
    });
    expect(store.getInventoryPlan(product.id, { orgId: 1, date: "2026-07-21" })).toMatchObject({
      inventoryAvailable: 100,
      inTransitUnits: 100,
      localWarehouseUnits: 50,
      supplyPositionUnits: 250,
      leadTimeDays: 20,
      recommendedOrderQuantity: 350,
      expectedArrivalDate: "2026-08-10"
    });

    const updated = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/inventory`)
      .set("Cookie", token)
      .send({ format: "csv", content: "sku,supplierName\nINV-SKU-1,Supplier C" })
      .expect(200);
    expect(updated.body).toMatchObject({ importedRows: 1, createdSettings: 0, updatedSettings: 1 });
    expect(store.getInventorySetting(product.id)).toMatchObject({
      supplierName: "Supplier C",
      productionLeadTimeDays: 12,
      inboundLeadTimeDays: 8,
      inTransitUnits: 100,
      localWarehouseUnits: 50
    });

    const runs = await request(app)
      .get(`/api/data-sources/${source.body.id}/runs`)
      .set("Cookie", token)
      .expect(200);
    expect(runs.body).toEqual([
      expect.objectContaining({ operation: "inventory_csv_import", status: "success", updatedRecords: 1 }),
      expect.objectContaining({ operation: "inventory_excel_import", status: "partial", createdRecords: 1, failedRows: 1 })
    ]);
  });

  it("rejects inventory files without planning columns and records the failed run", async () => {
    const source = await request(app)
      .post("/api/data-sources")
      .set("Cookie", token)
      .send({ name: "Invalid inventory workbook", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    await request(app)
      .post(`/api/data-sources/${source.body.id}/import/inventory`)
      .set("Cookie", token)
      .send({ format: "csv", content: "sku,title\nINV-SKU-1,No planning values" })
      .expect(400);

    const runs = await request(app)
      .get(`/api/data-sources/${source.body.id}/runs`)
      .set("Cookie", token)
      .expect(200);
    expect(runs.body).toEqual([
      expect.objectContaining({
        operation: "inventory_csv_import",
        status: "failed",
        errorSummary: expect.stringContaining("Inventory import requires at least one planning header")
      })
    ]);
  });

  it("rejects cost files without cost columns and records the failed run", async () => {
    const source = await request(app)
      .post("/api/data-sources")
      .set("Cookie", token)
      .send({ name: "Invalid cost workbook", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    await request(app)
      .post(`/api/data-sources/${source.body.id}/import/costs`)
      .set("Cookie", token)
      .send({ format: "csv", content: "sku,title\nCOST-SKU-1,No costs" })
      .expect(400);

    const runs = await request(app)
      .get(`/api/data-sources/${source.body.id}/runs`)
      .set("Cookie", token)
      .expect(200);
    expect(runs.body).toEqual([
      expect.objectContaining({
        operation: "cost_csv_import",
        status: "failed",
        errorSummary: expect.stringContaining("Cost import requires at least one cost header")
      })
    ]);
  });

  it("rejects invalid calendar dates and marketplace drift as row errors", async () => {
    const source = await request(app)
      .post("/api/data-sources")
      .set("Cookie", token)
      .send({ name: "Bounded US CSV", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    const result = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/products`)
      .set("Cookie", token)
      .send({
        csv: [
          "sku,asin,title,date,marketplace",
          "SKU-DATE,B0DATE0001,Invalid date,2026-02-31,US",
          "SKU-MARKET,B0MARKET01,Wrong market,2026-07-21,JP"
        ].join("\n")
      })
      .expect(200);

    expect(result.body).toMatchObject({ importedRows: 0, failedRows: 2, source: { syncStatus: "failed" } });
    expect(result.body.errors).toEqual([
      { row: 2, message: "date must use YYYY-MM-DD" },
      { row: 3, message: "marketplace must match configured source US" }
    ]);
  });

  it("imports Ads report rows, links owned SKUs, and preserves omitted metrics on re-import", async () => {
    const product = store.createProduct({
      orgId: 1,
      marketplace: "US",
      sku: "ADS-SKU-1",
      asin: "B0ADS00001",
      title: "Ads product"
    });
    const source = await request(app)
      .post("/api/data-sources")
      .set("Cookie", token)
      .send({ name: "US Ads report", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    const imported = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/ads`)
      .set("Cookie", token)
      .send({
        csv: [
          "date,campaignId,campaignName,adGroupName,targetText,searchTerm,sku,impressions,clicks,spend,sales,orders,acos,ctr",
          "2026-07-21,CAMP-1,Core campaign,Exact group,coffee maker,quiet coffee maker,ADS-SKU-1,1000,100,25,100,8,25%,10%",
          "2026-07-21,CAMP-2,Broken campaign,,,,,100,1.5,10,20,1,50%,1.5%"
        ].join("\n")
      })
      .expect(200);

    expect(imported.body).toMatchObject({
      totalRows: 2,
      importedRows: 1,
      failedRows: 1,
      createdMetrics: 1,
      updatedMetrics: 0,
      source: { status: "attention", syncStatus: "partial" }
    });
    expect(imported.body.errors).toEqual([
      { row: 3, message: "clicks must be a non-negative integer" }
    ]);
    expect(store.listAdDailyMetrics({ orgId: 1 })).toEqual([
      expect.objectContaining({
        productId: product.id,
        campaignId: "CAMP-1",
        clicks: 100,
        spend: 25,
        sales: 100,
        acos: 0.25,
        ctr: 0.1,
        dataSource: "US Ads report",
        syncStatus: "success"
      })
    ]);

    const updated = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/ads`)
      .set("Cookie", token)
      .send({
        csv: [
          "date,campaignId,campaignName,adGroupName,targetText,searchTerm,spend",
          "2026-07-21,CAMP-1,Core campaign,Exact group,coffee maker,quiet coffee maker,30"
        ].join("\n")
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      importedRows: 1,
      createdMetrics: 0,
      updatedMetrics: 1,
      source: { status: "connected", syncStatus: "success" }
    });
    expect(store.listAdDailyMetrics({ orgId: 1 })[0]).toMatchObject({
      productId: product.id,
      clicks: 100,
      spend: 30,
      sales: 100
    });
    const runs = await request(app)
      .get(`/api/data-sources/${source.body.id}/runs`)
      .set("Cookie", token)
      .expect(200);
    expect(runs.body).toEqual([
      expect.objectContaining({ operation: "ads_csv_import", status: "success", updatedRecords: 1 }),
      expect.objectContaining({ operation: "ads_csv_import", status: "partial", createdRecords: 1, failedRows: 1 })
    ]);
  });

  it("records a failed Ads sync when the report headers are invalid", async () => {
    const source = await request(app)
      .post("/api/data-sources")
      .set("Cookie", token)
      .send({ name: "Invalid Ads report", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    await request(app)
      .post(`/api/data-sources/${source.body.id}/import/ads`)
      .set("Cookie", token)
      .send({ csv: "date,campaignId\n2026-07-21,CAMP-1" })
      .expect(400);

    expect(store.getDataSource(source.body.id)).toMatchObject({
      status: "attention",
      syncStatus: "failed",
      syncError: "Missing required headers: campaignName"
    });
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
