import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createStore, initSchema, type Store } from "../apps/api/src/store.js";
import { collectShadowEvidence } from "./sp-api-shadow-evidence-collector.js";
import type { ShadowEvidenceCollectorConfig } from "./sp-api-shadow-evidence-collector-types.js";
import { validateEvidenceBundle } from "./sp-api-shadow-evidence-validation.js";

const orgId = 1;
const marketplace = "US";
const currency = "USD";
const dates = [
  "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06",
  "2026-08-07", "2026-08-08", "2026-08-09",
];
const observedAt = "2026-08-10T08:00:00.000Z";

describe("SP-API shadow evidence collector", { timeout: 15_000 }, () => {
  it("builds a passing seven-day redacted manifest from store and SKU facts", () => {
    const fixture = createFixtureDatabase();
    try {
      const result = collectShadowEvidence(fixture.config);
      const validation = validateEvidenceBundle(result.bundle, { requireAllPass: true });
      expect(validation.ok).toBe(true);
      expect(result.validation.ok).toBe(true);
      expect(result.bundle).toMatchObject({
        evidenceMode: "real",
        organizationId: "org-redacted",
        commerceStoreId: "store-redacted",
        marketplace,
        currency,
      });
      const days = result.bundle.days as Array<Record<string, unknown>>;
      expect(days).toHaveLength(7);
      expect(days.every((day) => day.status === "pass")).toBe(true);
      expect(days[0]?.sales).toMatchObject({
        storeDailyAmountMinor: 12_050,
        skuAmountMinor: 12_050,
        unmappedAmountMinor: 0,
        orders: 3,
        units: 4,
        factRows: 2,
        replayCreatedRecords: 0,
        replayUpdatedRecords: 2,
      });
      expect(days[0]?.fba).toMatchObject({
        snapshotRows: 1,
        latestRows: 1,
        asOfRows: 1,
      });
      const serialized = JSON.stringify(result.bundle);
      expect(serialized).not.toContain("EVIDENCE-SKU-1");
      expect(serialized).not.toContain("EVIDENCE-SELLER");
      expect(serialized).not.toContain("refresh-token");
      expect(serialized).toContain("run-");
    } finally {
      fixture.close();
    }
  });

  it("marks a missing authoritative store fact as delayed instead of passing it", () => {
    const fixture = createFixtureDatabase();
    try {
      fixture.database.prepare(`
        DELETE FROM sp_api_sales_traffic_daily
        WHERE business_date = ? AND scope = 'store_daily'
      `).run(dates[0]);
      fixture.closeWriter();

      const result = collectShadowEvidence(fixture.config);
      const firstDay = (result.bundle.days as Array<Record<string, unknown>>)[0];
      expect(firstDay?.status).toBe("delayed");
      expect(firstDay?.mappingIssues).toContain("missing STORE_DAILY fact");
      expect(validateEvidenceBundle(result.bundle, { requireAllPass: false }).ok).toBe(true);
    } finally {
      fixture.close();
    }
  });

  it("marks unmapped SKU revenue as delayed and preserves the amount bucket", () => {
    const fixture = createFixtureDatabase();
    try {
      fixture.database.prepare(`
        UPDATE sp_api_sales_traffic_daily
        SET product_id = NULL
        WHERE business_date = ? AND scope = 'sku_daily'
      `).run(dates[0]);
      fixture.closeWriter();

      const result = collectShadowEvidence(fixture.config);
      const firstDay = (result.bundle.days as Array<Record<string, unknown>>)[0];
      expect(firstDay?.status).toBe("delayed");
      expect((firstDay?.sales as Record<string, unknown>).unmappedAmountMinor).toBe(12_050);
      expect(firstDay?.mappingIssues).toContain("unmapped sales amount");
    } finally {
      fixture.close();
    }
  });

  it("does not hide a latest failed sync behind the previous successful facts", () => {
    const fixture = createFixtureDatabase(true);
    try {
      const result = collectShadowEvidence(fixture.config);
      const firstDay = (result.bundle.days as Array<Record<string, unknown>>)[0];
      expect(firstDay?.status).toBe("delayed");
      expect(firstDay?.mappingIssues).toContain("sales latest run failed");
    } finally {
      fixture.close();
    }
  });

  it("uses the FBA source timestamp instead of ingestion time for freshness", () => {
    const fixture = createFixtureDatabase();
    try {
      fixture.database.prepare(`
        UPDATE sp_api_inventory_snapshots
        SET source_time = ?
        WHERE sync_run_id = (
          SELECT id
          FROM data_source_sync_runs
          WHERE data_source_id = ? AND domain = 'fba_inventory' AND requested_from_date = ?
          ORDER BY id DESC
          LIMIT 1
        )
      `).run("2026-08-10T05:00:00.000Z", fixture.config.dataSourceId, dates[0]);
      fixture.closeWriter();

      const result = collectShadowEvidence(fixture.config);
      const firstDay = (result.bundle.days as Array<Record<string, unknown>>)[0];
      expect(firstDay?.status).toBe("delayed");
      expect((firstDay?.fba as Record<string, unknown>).freshnessMinutes).toBe(180);
      expect(firstDay?.mappingIssues).toContain("fba freshness exceeds 60 minutes");
    } finally {
      fixture.close();
    }
  });

  it("does not pass a snapshot when its source timestamp is missing", () => {
    const fixture = createFixtureDatabase();
    try {
      fixture.database.prepare(`
        UPDATE sp_api_inventory_snapshots
        SET source_time = NULL
        WHERE sync_run_id = (
          SELECT id
          FROM data_source_sync_runs
          WHERE data_source_id = ? AND domain = 'fba_inventory' AND requested_from_date = ?
          ORDER BY id DESC
          LIMIT 1
        )
      `).run(fixture.config.dataSourceId, dates[0]);
      fixture.closeWriter();

      const result = collectShadowEvidence(fixture.config);
      const firstDay = (result.bundle.days as Array<Record<string, unknown>>)[0];
      expect(firstDay?.status).toBe("delayed");
      expect(firstDay?.mappingIssues).toContain("fba source time unavailable");
    } finally {
      fixture.close();
    }
  });

  it("does not pass an FBA run whose pagination checkpoint is incomplete", () => {
    const fixture = createFixtureDatabase();
    try {
      fixture.database.prepare(`
        UPDATE data_source_sync_runs
        SET checkpoint_summary = ?
        WHERE data_source_id = ? AND domain = 'fba_inventory' AND requested_from_date = ?
      `).run(JSON.stringify({
        version: 1,
        nextToken: "resume-token",
        pagesCompleted: 1,
        rowsSeen: 1,
        completed: false,
      }), fixture.config.dataSourceId, dates[0]);
      fixture.closeWriter();

      const result = collectShadowEvidence(fixture.config);
      const firstDay = (result.bundle.days as Array<Record<string, unknown>>)[0];
      expect(firstDay?.status).toBe("delayed");
      expect(firstDay?.mappingIssues).toContain("fba checkpoint incomplete");
    } finally {
      fixture.close();
    }
  });

  it("keeps historical asOfRows stable when a later run expands current latest rows", () => {
    const fixture = createFixtureDatabase();
    try {
      const laterRun = createRun(
        fixture.store,
        fixture.config.dataSourceId,
        "2026-08-10",
        "fba_inventory",
        "fba-later-current-state",
        "2026-08-10T07:40:00.000Z",
      );
      finishRun(
        fixture.store,
        laterRun.id,
        "2026-08-10T07:50:00.000Z",
        1,
        0,
        JSON.stringify({
          version: 1,
          startDateTime: "2026-08-10T07:30:00.000Z",
          nextToken: null,
          pagesCompleted: 1,
          rowsSeen: 1,
          importedRows: 1,
          createdRecords: 1,
          updatedRecords: 0,
          unmappedRows: 0,
          completed: true,
        }),
      );
      insertInventoryFacts(
        fixture.database,
        fixture.config.dataSourceId,
        laterRun.id,
        fixture.commerceStoreId,
        null,
        "EVIDENCE-SKU-2",
      );
      fixture.closeWriter();

      const result = collectShadowEvidence(fixture.config);
      const firstDay = (result.bundle.days as Array<Record<string, unknown>>)[0];
      expect(firstDay?.status).toBe("pass");
      expect(firstDay?.fba).toMatchObject({ snapshotRows: 1, asOfRows: 1, latestRows: 2 });
      expect(validateEvidenceBundle(result.bundle, { requireAllPass: true }).ok).toBe(true);
    } finally {
      fixture.close();
    }
  });
});

function createFixtureDatabase(includeLatestFailure = false) {
  const root = mkdtempSync(join(tmpdir(), "amazon-monitor-shadow-evidence-"));
  const databasePath = join(root, "shadow.sqlite");
  const database = new DatabaseSync(databasePath);
  initSchema(database);
  const store = createStore(database);
  const source = store.createDataSource({ orgId, name: "Evidence source", sourceType: "amazon_sp_api" });
  const commerceStore = store.createCommerceStore({
    orgId,
    name: "Evidence store",
    marketplace: "amazon.com",
    sellerId: "EVIDENCE-SELLER",
  });
  const product = store.createProduct({
    orgId,
    storeId: commerceStore.id,
    marketplace,
    sku: "EVIDENCE-SKU-1",
    asin: "B0EVIDENCE01",
    title: "Evidence product",
  });
  for (const date of dates) {
    const initialSalesRun = createRun(store, source.id, date, "sales_traffic", `sales-initial-${date}`, "2026-08-10T06:00:00.000Z");
    finishRun(store, initialSalesRun.id, "2026-08-10T06:05:00.000Z", 2, 0);
    const replaySalesRun = createRun(store, source.id, date, "sales_traffic", `sales-replay-${date}`, "2026-08-10T07:00:00.000Z");
    finishRun(store, replaySalesRun.id, "2026-08-10T07:05:00.000Z", 0, 2);
    insertSalesFacts(database, source.id, replaySalesRun.id, commerceStore.id, product.id, date);

    const fbaRun = createRun(store, source.id, date, "fba_inventory", `fba-${date}`, "2026-08-10T07:10:00.000Z");
    finishRun(
      store,
      fbaRun.id,
      "2026-08-10T07:30:00.000Z",
      1,
      0,
      JSON.stringify({
        version: 1,
        startDateTime: "2026-08-10T06:30:00.000Z",
        nextToken: null,
        pagesCompleted: 1,
        rowsSeen: 1,
        importedRows: 1,
        createdRecords: 1,
        updatedRecords: 0,
        unmappedRows: 0,
        completed: true,
      }),
    );
    insertInventoryFacts(database, source.id, fbaRun.id, commerceStore.id, product.id);
  }
  if (includeLatestFailure) {
    const failedSalesRun = createRun(store, source.id, dates[0], "sales_traffic", "sales-failed-latest", "2026-08-10T07:45:00.000Z");
    store.finishDataSourceSyncRun(failedSalesRun.id, {
      status: "failed",
      totalRows: 0,
      importedRows: 0,
      failedRows: 1,
      createdRecords: 0,
      updatedRecords: 0,
      errorCode: "rate_limited",
      errorSummary: "fixture latest failure",
      finishedAt: "2026-08-10T07:50:00.000Z",
    });
  }
  return {
    config: buildConfig(databasePath, source.id, commerceStore.id),
    database,
    store,
    commerceStoreId: commerceStore.id,
    closeWriter() {
      database.close();
    },
    close() {
      try { database.close(); } catch { /* already closed */ }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function buildConfig(databasePath: string, dataSourceId: number, commerceStoreId: number): ShadowEvidenceCollectorConfig {
  return {
    databasePath,
    orgId,
    dataSourceId,
    commerceStoreId,
    marketplace,
    currency,
    businessTimezone: "America/Los_Angeles",
    evidenceBundleId: "shadow-test-2026-08-03-us-001",
    organizationEvidenceId: "org-redacted",
    commerceStoreEvidenceId: "store-redacted",
    sourceEvidenceId: "source-redacted",
    windowStart: dates[0],
    windowEnd: dates[dates.length - 1],
    externalReferences: Object.fromEntries(dates.map((date) => [date, {
      reportId: `seller-report-${date}`,
      downloadedAt: `${date}T08:00:00.000Z`,
      sha256: "a".repeat(64),
    }])),
    observedAtByDate: Object.fromEntries(dates.map((date) => [date, observedAt])),
  };
}

function createRun(
  store: Store,
  dataSourceId: number,
  date: string,
  domain: "sales_traffic" | "fba_inventory",
  idempotencyKey: string,
  startedAt: string,
) {
  return store.createDataSourceSyncRun({
    orgId,
    dataSourceId,
    operation: domain === "sales_traffic" ? "sp_api_sales_traffic_daily_sync" : "sp_api_fba_inventory_incremental_sync",
    domain,
    trigger: "manual",
    mode: "incremental",
    idempotencyKey,
    credentialVersion: 1,
    marketplaces: [marketplace],
    requestedFromDate: date,
    requestedToDate: date,
    startedAt,
  });
}

function finishRun(
  store: Store,
  runId: number,
  finishedAt: string,
  createdRecords: number,
  updatedRecords: number,
  checkpointSummary?: string,
): void {
  store.finishDataSourceSyncRun(runId, {
    status: "success",
    totalRows: createdRecords || updatedRecords || 1,
    importedRows: createdRecords || updatedRecords || 1,
    failedRows: 0,
    createdRecords,
    updatedRecords,
    checkpointSummary,
    finishedAt,
  });
}

function insertSalesFacts(
  database: DatabaseSync,
  dataSourceId: number,
  syncRunId: number,
  commerceStoreId: number,
  productId: number,
  businessDate: string,
): void {
  const common = [orgId, dataSourceId, syncRunId, commerceStoreId, marketplace, businessDate];
  database.prepare(`
    INSERT INTO sp_api_sales_traffic_daily
      (org_id, data_source_id, sync_run_id, commerce_store_id, marketplace, business_date, seller_sku,
       product_id, scope, orders, units_sold, sales_amount, currency, synced_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'store_daily', ?, ?, ?, ?, ?, 'success')
  `).run(...common, "", null, 3, 4, 120.5, currency, "2026-08-10T07:05:00.000Z");
  database.prepare(`
    INSERT INTO sp_api_sales_traffic_daily
      (org_id, data_source_id, sync_run_id, commerce_store_id, marketplace, business_date, seller_sku,
       product_id, scope, orders, units_sold, sales_amount, currency, synced_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sku_daily', ?, ?, ?, ?, ?, 'success')
  `).run(...common, "EVIDENCE-SKU-1", productId, 3, 4, 120.5, currency, "2026-08-10T07:05:00.000Z");
}

function insertInventoryFacts(
  database: DatabaseSync,
  dataSourceId: number,
  syncRunId: number,
  commerceStoreId: number,
  productId: number | null,
  sellerSku = "EVIDENCE-SKU-1",
): void {
  const values = [orgId, dataSourceId, syncRunId, commerceStoreId, marketplace, sellerSku, productId, 10, 2, 1, 0, 0, 13, "2026-08-10T07:00:00.000Z", "2026-08-10T07:30:00.000Z"];
  database.prepare(`
    INSERT INTO sp_api_inventory_snapshots
      (org_id, data_source_id, sync_run_id, commerce_store_id, marketplace, seller_sku, product_id,
       fulfillable_quantity, reserved_quantity, inbound_working_quantity, inbound_shipped_quantity,
       inbound_receiving_quantity, total_quantity, source_time, synced_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')
  `).run(...values);
  database.prepare(`
    INSERT INTO sp_api_inventory_latest
      (org_id, data_source_id, sync_run_id, commerce_store_id, marketplace, seller_sku, product_id,
       fulfillable_quantity, reserved_quantity, inbound_working_quantity, inbound_shipped_quantity,
       inbound_receiving_quantity, total_quantity, source_time, synced_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')
    ON CONFLICT(commerce_store_id, marketplace, seller_sku) DO UPDATE SET
      data_source_id = excluded.data_source_id,
      sync_run_id = excluded.sync_run_id,
      product_id = excluded.product_id,
      fulfillable_quantity = excluded.fulfillable_quantity,
      reserved_quantity = excluded.reserved_quantity,
      inbound_working_quantity = excluded.inbound_working_quantity,
      inbound_shipped_quantity = excluded.inbound_shipped_quantity,
      inbound_receiving_quantity = excluded.inbound_receiving_quantity,
      total_quantity = excluded.total_quantity,
      source_time = excluded.source_time,
      synced_at = excluded.synced_at,
      status = excluded.status
  `).run(...values);
}
