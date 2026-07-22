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
  return response.body.token as string;
}

async function loginAs(username: string, password: string): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ username, password })
    .expect(200);
  return response.body.token as string;
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
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(apiSources.body).toHaveLength(1);
    expect(apiSources.body[0].name).toBe("Amazon US SP-API");

    const updated = await request(app)
      .patch(`/api/data-sources/${created.body.id}`)
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", operatorToken)
      .expect(200);
    await request(app)
      .post("/api/data-sources")
      .set("x-amazon-monitor-session", operatorToken)
      .send({ name: "Unauthorized source", sourceType: "csv_import" })
      .expect(403);
  });

  it("imports owned product metrics from a CSV source and reports partial rows", async () => {
    const source = await request(app)
      .post("/api/data-sources")
      .set("x-amazon-monitor-session", token)
      .send({ name: "US operations CSV", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    const imported = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/products`)
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(partialRuns.body).toHaveLength(1);
  });

  it("rejects malformed CSV and records the failed sync state", async () => {
    const source = await request(app)
      .post("/api/data-sources")
      .set("x-amazon-monitor-session", token)
      .send({ name: "Malformed CSV", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    await request(app)
      .post(`/api/data-sources/${source.body.id}/import/products`)
      .set("x-amazon-monitor-session", token)
      .send({ csv: "sku,date\nSKU-1,2026-07-20" })
      .expect(400);

    expect(store.getDataSource(source.body.id)).toMatchObject({
      status: "attention",
      syncStatus: "failed",
      syncError: "Missing required headers: asin, title"
    });
    const runs = await request(app)
      .get(`/api/data-sources/${source.body.id}/runs`)
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
      .send({ name: "US Excel operations", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    const products = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/products`)
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
      .send({ name: "US cost workbook", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    const imported = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/costs`)
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
      .send({ name: "US inventory workbook", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    const imported = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/inventory`)
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(runs.body).toEqual([
      expect.objectContaining({ operation: "inventory_csv_import", status: "success", updatedRecords: 1 }),
      expect.objectContaining({ operation: "inventory_excel_import", status: "partial", createdRecords: 1, failedRows: 1 })
    ]);
  });

  it("rejects inventory files without planning columns and records the failed run", async () => {
    const source = await request(app)
      .post("/api/data-sources")
      .set("x-amazon-monitor-session", token)
      .send({ name: "Invalid inventory workbook", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    await request(app)
      .post(`/api/data-sources/${source.body.id}/import/inventory`)
      .set("x-amazon-monitor-session", token)
      .send({ format: "csv", content: "sku,title\nINV-SKU-1,No planning values" })
      .expect(400);

    const runs = await request(app)
      .get(`/api/data-sources/${source.body.id}/runs`)
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
      .send({ name: "Invalid cost workbook", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    await request(app)
      .post(`/api/data-sources/${source.body.id}/import/costs`)
      .set("x-amazon-monitor-session", token)
      .send({ format: "csv", content: "sku,title\nCOST-SKU-1,No costs" })
      .expect(400);

    const runs = await request(app)
      .get(`/api/data-sources/${source.body.id}/runs`)
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
      .send({ name: "Bounded US CSV", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    const result = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/products`)
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
      .send({ name: "US Ads report", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    const imported = await request(app)
      .post(`/api/data-sources/${source.body.id}/import/ads`)
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
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
      .set("x-amazon-monitor-session", token)
      .expect(200);
    expect(runs.body).toEqual([
      expect.objectContaining({ operation: "ads_csv_import", status: "success", updatedRecords: 1 }),
      expect.objectContaining({ operation: "ads_csv_import", status: "partial", createdRecords: 1, failedRows: 1 })
    ]);
  });

  it("records a failed Ads sync when the report headers are invalid", async () => {
    const source = await request(app)
      .post("/api/data-sources")
      .set("x-amazon-monitor-session", token)
      .send({ name: "Invalid Ads report", sourceType: "csv_import", marketplace: "US" })
      .expect(201);

    await request(app)
      .post(`/api/data-sources/${source.body.id}/import/ads`)
      .set("x-amazon-monitor-session", token)
      .send({ csv: "date,campaignId\n2026-07-21,CAMP-1" })
      .expect(400);

    expect(store.getDataSource(source.body.id)).toMatchObject({
      status: "attention",
      syncStatus: "failed",
      syncError: "Missing required headers: campaignName"
    });
  });
});
