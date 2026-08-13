import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createStore, configureDatabase, initSchema } from "../apps/api/src/store.js";
import { backupSqliteDatabaseFile } from "../apps/api/src/store/db-backup.js";
import type { ShadowEvidenceCollectorConfig } from "./sp-api-shadow-evidence-collector-types.js";
import { runShadowPreflight } from "./verify-sp-api-shadow-preflight.js";

const dates = [
  "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06",
  "2026-08-07", "2026-08-08", "2026-08-09",
];

describe("SP-API shadow preflight", () => {
  it("passes for an isolated WAL database with scoped source, store, and connection", async () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-shadow-preflight-"));
    const databasePath = join(root, "shadow.sqlite");
    const productionDatabasePath = join(root, "production.sqlite");
    try {
      const database = new DatabaseSync(databasePath);
      configureDatabase(database);
      initSchema(database);
      const store = createStore(database);
      const source = store.createDataSource({
        orgId: 1,
        name: "Preflight source",
        sourceType: "amazon_sp_api",
        marketplace: "US",
        status: "connected",
      });
      const commerceStore = store.createCommerceStore({
        orgId: 1,
        name: "Preflight store",
        marketplace: "amazon.com",
        sellerId: "PREFLIGHT-SELLER",
      });
      store.replaceSpApiConnection({
        orgId: 1,
        dataSourceId: source.id,
        region: "NA",
        commerceStoreIds: [commerceStore.id],
        encryptedCredentials: {
          keyVersion: "test",
          ciphertext: "redacted",
          iv: "redacted",
          authTag: "redacted",
        },
      });
      database.close();
      const backupPath = join(root, "backup.sqlite");
      await backupSqliteDatabaseFile(databasePath, backupPath);

      const result = runShadowPreflight(buildConfig(databasePath, source.id, commerceStore.id), {
        productionDatabasePath,
        connectorEnabled: true,
        fixtureDirectory: null,
        backupPath,
        shadowUserDataPath: join(root, "shadow-user-data"),
        productionUserDataPath: join(root, "production-user-data"),
        runtimeDatabasePath: databasePath,
      });
      expect(result.ok).toBe(true);
      expect(result.storage?.snapshot.journalMode).toBe("wal");
      expect(result.checks.every((check) => check.ok)).toBe(true);
      expect(result.scope).toEqual({
        evidenceBundleId: "shadow-preflight-test",
        organizationId: "org-redacted",
        commerceStoreId: "store-redacted",
        sourceId: "source-redacted",
        marketplace: "US",
        currency: "USD",
        businessTimezone: "America/Los_Angeles",
        windowStart: dates[0],
        windowEnd: dates[dates.length - 1],
      });
      expect(JSON.stringify(result)).not.toContain("ciphertext");
      expect(JSON.stringify(result)).not.toContain("PREFLIGHT-SELLER");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when storage thresholds are exceeded and records the applied bounds", async () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-shadow-preflight-storage-"));
    const databasePath = join(root, "shadow.sqlite");
    try {
      const database = new DatabaseSync(databasePath);
      configureDatabase(database);
      initSchema(database);
      database.close();
      const backupPath = join(root, "backup.sqlite");
      await backupSqliteDatabaseFile(databasePath, backupPath);

      const result = runShadowPreflight(buildConfig(databasePath, 1, 1), {
        productionDatabasePath: join(root, "production.sqlite"),
        connectorEnabled: true,
        fixtureDirectory: null,
        backupPath,
        shadowUserDataPath: join(root, "shadow-user-data"),
        productionUserDataPath: join(root, "production-user-data"),
        runtimeDatabasePath: databasePath,
        storageThresholds: { maxTotalBytes: 0 },
      });

      expect(result.ok).toBe(false);
      expect(result.storage?.thresholds).toMatchObject({
        requireWal: true,
        maxWalBytes: 512 * 1024 * 1024,
        maxTotalBytes: 0,
      });
      expect(result.storage?.health.ok).toBe(false);
      expect(result.storage?.health.issues.join(" ")).toContain("above 0");
      expect(result.checks.find((check) => check.name === "sqlite_storage")).toMatchObject({ ok: false });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when the shadow path is production and unsafe runtime modes are enabled", async () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-shadow-preflight-"));
    const databasePath = join(root, "shadow.sqlite");
    try {
      const database = new DatabaseSync(databasePath);
      configureDatabase(database);
      initSchema(database);
      database.close();
      const backupPath = join(root, "backup.sqlite");
      await backupSqliteDatabaseFile(databasePath, backupPath);

      const result = runShadowPreflight(buildConfig(databasePath, 1, 1), {
        productionDatabasePath: databasePath,
        connectorEnabled: false,
        fixtureDirectory: join(root, "fixtures"),
        backupPath,
        shadowUserDataPath: join(root, "shadow-user-data"),
        productionUserDataPath: join(root, "production-user-data"),
        runtimeDatabasePath: databasePath,
      });

      expect(result.ok).toBe(false);
      expect(result.checks.find((check) => check.name === "database_isolated")?.ok).toBe(false);
      expect(result.checks.find((check) => check.name === "connector_enabled")?.ok).toBe(false);
      expect(result.checks.find((check) => check.name === "fixture_disabled")?.ok).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when source and store belong to another organization", async () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-shadow-preflight-"));
    const databasePath = join(root, "shadow.sqlite");
    try {
      const database = new DatabaseSync(databasePath);
      configureDatabase(database);
      initSchema(database);
      const store = createStore(database);
      const otherOrg = store.createOrganization({ name: "Other organization", plan: "standard" });
      const source = store.createDataSource({
        orgId: otherOrg.id,
        name: "Other source",
        sourceType: "amazon_sp_api",
        marketplace: "US",
      });
      const commerceStore = store.createCommerceStore({
        orgId: otherOrg.id,
        name: "Other store",
        marketplace: "US",
        sellerId: "OTHER-SELLER",
      });
      store.replaceSpApiConnection({
        orgId: otherOrg.id,
        dataSourceId: source.id,
        region: "NA",
        commerceStoreIds: [commerceStore.id],
        encryptedCredentials: {
          keyVersion: "test",
          ciphertext: "redacted",
          iv: "redacted",
          authTag: "redacted",
        },
      });
      database.close();
      const backupPath = join(root, "backup.sqlite");
      await backupSqliteDatabaseFile(databasePath, backupPath);

      const result = runShadowPreflight(buildConfig(databasePath, source.id, commerceStore.id), {
        productionDatabasePath: join(root, "production.sqlite"),
        connectorEnabled: true,
        fixtureDirectory: null,
        backupPath,
        shadowUserDataPath: join(root, "shadow-user-data"),
        productionUserDataPath: join(root, "production-user-data"),
        runtimeDatabasePath: databasePath,
      });

      expect(result.ok).toBe(false);
      expect(result.checks.find((check) => check.name === "organization_boundary")?.ok).toBe(true);
      expect(result.checks.find((check) => check.name === "data_source_boundary")?.ok).toBe(false);
      expect(result.checks.find((check) => check.name === "commerce_store_boundary")?.ok).toBe(false);
      expect(result.checks.find((check) => check.name === "sp_api_connection")?.ok).toBe(false);
      expect(result.checks.find((check) => check.name === "connection_store_link")?.ok).toBe(false);
      expect(result.checks.find((check) => check.name === "fact_boundary")?.ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects a fact row that crosses the scoped commerce store boundary", async () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-shadow-preflight-"));
    const databasePath = join(root, "shadow.sqlite");
    try {
      const database = new DatabaseSync(databasePath);
      configureDatabase(database);
      initSchema(database);
      const store = createStore(database);
      const source = store.createDataSource({
        orgId: 1,
        name: "Fact boundary source",
        sourceType: "amazon_sp_api",
        marketplace: "US",
        status: "connected",
      });
      const scopedStore = store.createCommerceStore({
        orgId: 1,
        name: "Scoped store",
        marketplace: "US",
        sellerId: "SCOPED-SELLER",
      });
      const otherOrg = store.createOrganization({ name: "Fact boundary other org", plan: "standard" });
      const otherStore = store.createCommerceStore({
        orgId: otherOrg.id,
        name: "Other store",
        marketplace: "US",
        sellerId: "OTHER-FACT-SELLER",
      });
      store.replaceSpApiConnection({
        orgId: 1,
        dataSourceId: source.id,
        region: "NA",
        commerceStoreIds: [scopedStore.id],
        encryptedCredentials: {
          keyVersion: "test",
          ciphertext: "redacted",
          iv: "redacted",
          authTag: "redacted",
        },
      });
      const run = store.createDataSourceSyncRun({
        orgId: 1,
        dataSourceId: source.id,
        operation: "sp_api_sales_traffic_daily_sync",
        domain: "sales_traffic",
        trigger: "manual",
        mode: "incremental",
        marketplaces: ["US"],
        startedAt: "2026-08-10T08:00:00.000Z",
      });
      database.prepare(`
        INSERT INTO sp_api_sales_traffic_daily
          (org_id, data_source_id, sync_run_id, commerce_store_id, marketplace, business_date,
           seller_sku, scope, currency, synced_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        1,
        source.id,
        run.id,
        otherStore.id,
        "US",
        "2026-08-03",
        "CROSS-STORE-SKU",
        "store_daily",
        "USD",
        "2026-08-10T08:00:00.000Z",
        "success",
      );
      database.close();
      const backupPath = join(root, "backup.sqlite");
      await backupSqliteDatabaseFile(databasePath, backupPath);

      const result = runShadowPreflight(buildConfig(databasePath, source.id, scopedStore.id), {
        productionDatabasePath: join(root, "production.sqlite"),
        connectorEnabled: true,
        fixtureDirectory: null,
        backupPath,
        shadowUserDataPath: join(root, "shadow-user-data"),
        productionUserDataPath: join(root, "production-user-data"),
        runtimeDatabasePath: databasePath,
      });

      expect(result.ok).toBe(false);
      expect(result.checks.find((check) => check.name === "data_source_boundary")?.ok).toBe(true);
      expect(result.checks.find((check) => check.name === "commerce_store_boundary")?.ok).toBe(true);
      expect(result.checks.find((check) => check.name === "fact_boundary")?.ok).toBe(false);
      expect(result.checks.find((check) => check.name === "fact_boundary")?.detail).toContain("sp_api_sales_traffic_daily:1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function buildConfig(databasePath: string, dataSourceId: number, commerceStoreId: number): ShadowEvidenceCollectorConfig {
  return {
    databasePath,
    orgId: 1,
    dataSourceId,
    commerceStoreId,
    marketplace: "US",
    currency: "USD",
    businessTimezone: "America/Los_Angeles",
    evidenceBundleId: "shadow-preflight-test",
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
    observedAtByDate: Object.fromEntries(dates.map((date) => [date, `${date}T08:30:00.000Z`])),
  };
}
