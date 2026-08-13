import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { createStore, initSchema } from "../apps/api/src/store.js";
import { configureDatabase } from "../apps/api/src/store/db.js";
import { createProductStore } from "../apps/api/src/store/product-store.js";

interface BenchmarkResult {
  skuCount: number;
  seedMs: number;
  queryMs: number;
  returnedRows: number;
  expectedRows: number;
  truncated: boolean;
  dashboardQueryMs: number;
  dashboardMetricProductCount: number;
  dashboardCurrentSalesAmount: number | null;
  dashboardSevenDayPoints: number;
  auditQueryChunkSize: number;
  storage?: StorageEvidence;
}

interface StorageEvidence {
  mode: "file-backed-wal";
  journalMode: string;
  databaseBytes: number;
  walBytes: number;
  shmBytes: number;
}

const startDate = "2026-07-21";
const metricDate = "2026-07-27";
const benchmarkDates = buildDates(startDate, metricDate);
const queryLimit = 100_000;
const defaultSizes = [1_000, 10_000, 100_000];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fileBacked = args.includes("--file-backed");
  const sizes = parseSizes(args.filter((value) => value !== "--file-backed"));
  const results = sizes.map((size) => runBenchmark(size, fileBacked));
  console.log(JSON.stringify({
    startDate,
    metricDate,
    days: benchmarkDates.length,
    queryLimit,
    storageMode: fileBacked ? "file-backed-wal" : "memory",
    results
  }, null, 2));
}

function runBenchmark(skuCount: number, fileBacked: boolean): BenchmarkResult {
  process.stderr.write(`[effective-metrics] seed ${skuCount} SKUs\n`);
  const temporaryRoot = fileBacked ? mkdtempSync(join(tmpdir(), "amazon-monitor-effective-metrics-")) : undefined;
  const databasePath = temporaryRoot ? join(temporaryRoot, "benchmark.sqlite") : ":memory:";
  const db = new DatabaseSync(databasePath);
  try {
    if (fileBacked) configureDatabase(db);
    initSchema(db);
    const store = createStore(db);
    const source = store.createDataSource({
      orgId: 1,
      name: `Benchmark SP-API ${skuCount}`,
      sourceType: "amazon_sp_api"
    });
    const commerceStore = store.createCommerceStore({
      orgId: 1,
      name: `Benchmark store ${skuCount}`,
      marketplace: "amazon.com",
      sellerId: `BENCH-${skuCount}`
    });
    const run = store.createDataSourceSyncRun({
      orgId: 1,
      dataSourceId: source.id,
      operation: "sp_api_sales_traffic_daily_sync",
      domain: "sales_traffic",
      credentialVersion: 1,
      idempotencyKey: `benchmark-sales-${skuCount}`
    });
    const now = "2026-07-28T00:00:00.000Z";
    const insertProduct = db.prepare(`
      INSERT INTO own_products
        (org_id, store_id, marketplace, sku, asin, title, status, data_source,
         last_synced_at, sync_status, sync_error, created_at, updated_at)
      VALUES (?, ?, 'US', ?, ?, ?, 'active', 'manual', ?, 'manual', NULL, ?, ?)
    `);
    const insertMetric = db.prepare(`
      INSERT INTO own_product_daily_metrics
        (product_id, metric_date, orders, sales_amount, data_source,
         last_synced_at, sync_status, sync_error, created_at)
      VALUES (?, ?, 2, 20, 'manual', ?, 'manual', NULL, ?)
    `);
    const insertFact = db.prepare(`
      INSERT INTO sp_api_sales_traffic_daily
        (org_id, data_source_id, sync_run_id, commerce_store_id, marketplace,
         business_date, seller_sku, product_id, asin, scope, orders,
         sales_amount, currency, synced_at, status)
      VALUES (?, ?, ?, ?, 'US', ?, ?, ?, ?, 'sku_daily', 2, 20, 'USD', ?, 'success')
    `);
    const seedStart = performance.now();
    db.exec("BEGIN");
    try {
      for (let index = 0; index < skuCount; index += 1) {
        const sku = `BENCH-${skuCount}-${index}`;
        const asin = `B0BENCH${String(index).padStart(5, "0")}`;
        const productResult = insertProduct.run(
          1,
          commerceStore.id,
          sku,
          asin,
          `Benchmark SKU ${index}`,
          now,
          now,
          now
        );
        const productId = Number(productResult.lastInsertRowid);
        for (const date of benchmarkDates) {
          insertMetric.run(productId, date, now, now);
          insertFact.run(1, source.id, run.id, commerceStore.id, date, sku, productId, asin, now);
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    const seedMs = roundMs(performance.now() - seedStart);

    const productStore = createProductStore(db);
    const queryStart = performance.now();
    const rows = productStore.listOrganizationProductDailyMetrics(1, {
      startDate,
      endDate: metricDate,
      limit: queryLimit
    });
    const queryMs = roundMs(performance.now() - queryStart);
    const dashboardStart = performance.now();
    const dashboard = store.getDashboardOperationsSummary(1, metricDate);
    const dashboardQueryMs = roundMs(performance.now() - dashboardStart);
    const marketplace = dashboard.marketplaces.find((item) => item.marketplace === "US");
    if (
      !marketplace
      || marketplace.metricProductCount !== skuCount
      || marketplace.salesAmount !== skuCount * 20
      || marketplace.sevenDaySales.length !== benchmarkDates.length
    ) {
      throw new Error(`Dashboard benchmark mismatch for ${skuCount} SKUs`);
    }
    const storage = fileBacked ? readStorageEvidence(databasePath) : undefined;
    if (storage && storage.journalMode !== "wal") {
      throw new Error(`Expected file-backed benchmark to use WAL, got ${storage.journalMode}`);
    }
    return {
      skuCount,
      seedMs,
      queryMs,
      returnedRows: rows.length,
      expectedRows: skuCount * benchmarkDates.length,
      truncated: rows.length < skuCount * benchmarkDates.length,
      dashboardQueryMs,
      dashboardMetricProductCount: marketplace?.metricProductCount ?? 0,
      dashboardCurrentSalesAmount: marketplace?.salesAmount ?? null,
      dashboardSevenDayPoints: marketplace?.sevenDaySales.length ?? 0,
      auditQueryChunkSize: 250,
      ...(storage ? { storage } : {})
    };
  } finally {
    db.close();
    if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function parseSizes(args: string[]): number[] {
  const sizes = args
    .map((value) => Number(value))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  return sizes.length > 0 ? sizes : defaultSizes;
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function readStorageEvidence(databasePath: string): StorageEvidence {
  const journal = dbJournalMode(databasePath);
  return {
    mode: "file-backed-wal",
    journalMode: journal,
    databaseBytes: fileBytes(databasePath),
    walBytes: fileBytes(`${databasePath}-wal`),
    shmBytes: fileBytes(`${databasePath}-shm`)
  };
}

function dbJournalMode(databasePath: string): string {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = db.prepare("PRAGMA journal_mode").get() as { journal_mode?: unknown };
    return typeof row.journal_mode === "string" ? row.journal_mode : "unknown";
  } finally {
    db.close();
  }
}

function fileBytes(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function buildDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const endTime = Date.parse(`${end}T00:00:00.000Z`);
  while (cursor.getTime() <= endTime) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
