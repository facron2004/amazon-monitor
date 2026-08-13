import { existsSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { validateEvidenceBundle } from "./sp-api-shadow-evidence-validation.js";
import {
  CURRENCY_EXPONENTS,
  chooseStatus,
  emptySales,
  fbaCheckpointIssues,
  formatIssues,
  minutesBetween,
  redactedRunId,
  sumAmounts,
  sumIntegers,
  toMinor,
  uniqueStrings,
  validateConfig,
} from "./sp-api-shadow-evidence-collector-utils.js";
import type {
  FbaSummary,
  FbaFreshnessRow,
  LatestRunAttempt,
  RunRow,
  SalesRow,
  SalesSummary,
  ShadowEvidenceCollectionResult,
  ShadowEvidenceCollectorConfig,
} from "./sp-api-shadow-evidence-collector-types.js";

export function collectShadowEvidence(
  config: ShadowEvidenceCollectorConfig,
): ShadowEvidenceCollectionResult {
  const dates = validateConfig(config);
  const databasePath = config.databasePath;
  if (!existsSync(databasePath) || statSync(databasePath).size === 0) {
    throw new Error(`Shadow evidence database is missing or empty: ${databasePath}`);
  }
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const days = dates.map((businessDate) => collectDay(database, config, businessDate));
    const bundle: Record<string, unknown> = {
      schemaVersion: 2,
      evidenceMode: "real",
      evidenceBundleId: config.evidenceBundleId,
      organizationId: config.organizationEvidenceId,
      commerceStoreId: config.commerceStoreEvidenceId,
      marketplace: config.marketplace,
      currency: config.currency,
      businessTimezone: config.businessTimezone,
      windowStart: config.windowStart,
      windowEnd: config.windowEnd,
      days,
    };
    const validation = validateEvidenceBundle(bundle, { requireAllPass: false });
    if (!validation.ok) {
      throw new Error(`Collected evidence did not satisfy its manifest schema: ${formatIssues(validation.issues)}`);
    }
    return { bundle, validation };
  } finally {
    database.close();
  }
}

function collectDay(
  database: DatabaseSync,
  config: ShadowEvidenceCollectorConfig,
  businessDate: string,
): Record<string, unknown> {
  const observedAt = config.observedAtByDate[businessDate];
  const reference = config.externalReferences[businessDate];
  const issues: string[] = [];
  const sales = readSales(database, config, businessDate, observedAt, issues);
  const fba = readFba(database, config, businessDate, observedAt, issues);
  const status = chooseStatus(sales.hasFacts, issues);
  return {
    businessDate,
    status,
    externalReference: reference,
    sales: {
      sourceId: config.sourceEvidenceId,
      syncRunId: redactedRunId(config.evidenceBundleId, sales.syncRunId),
      storeDailyAmountMinor: sales.storeDailyAmountMinor,
      skuAmountMinor: sales.skuAmountMinor,
      unmappedAmountMinor: sales.unmappedAmountMinor,
      orders: sales.orders,
      units: sales.units,
      factRows: sales.factRows,
      replayCreatedRecords: sales.replayCreatedRecords,
      replayUpdatedRecords: sales.replayUpdatedRecords,
    },
    fba: {
      sourceId: config.sourceEvidenceId,
      syncRunId: redactedRunId(config.evidenceBundleId, fba.sourceRunId),
      snapshotRows: fba.snapshotRows,
      latestRows: fba.latestRows,
      asOfRows: fba.asOfRows,
      freshnessMinutes: fba.freshnessMinutes,
    },
    mappingIssues: uniqueStrings(issues),
  };
}

function readSales(
  database: DatabaseSync,
  config: ShadowEvidenceCollectorConfig,
  businessDate: string,
  observedAt: string,
  issues: string[],
): SalesSummary {
  const rows = database.prepare(`
    SELECT id, scope, sales_amount, orders, units_sold, currency, data_source_id,
           sync_run_id, product_id, synced_at
    FROM sp_api_sales_traffic_daily
    WHERE org_id = ? AND data_source_id = ? AND commerce_store_id = ?
      AND marketplace = ? AND business_date = ? AND status = 'success'
    ORDER BY synced_at DESC, id DESC
  `).all(
    config.orgId,
    config.dataSourceId,
    config.commerceStoreId,
    config.marketplace,
    businessDate,
  ) as unknown as SalesRow[];
  if (rows.length === 0) {
    issues.push("sales facts unavailable");
    return emptySales();
  }
  const latestAttempt = latestRunAttempt(database, config, "sales_traffic", businessDate, observedAt);
  if (latestAttempt && latestAttempt.status !== "success") issues.push(`sales latest run ${latestAttempt.status}`);
  appendOpenMappingIssues(database, config, issues);
  const exponent = CURRENCY_EXPONENTS[config.currency] ?? 2;
  const mismatchedCurrency = rows.some((row) => row.currency.toUpperCase() !== config.currency);
  if (mismatchedCurrency) issues.push("sales currency mismatch");
  const storeRows = rows.filter((row) => row.scope === "store_daily");
  const skuRows = rows.filter((row) => row.scope === "sku_daily");
  const store = storeRows[0];
  if (!store) issues.push("missing STORE_DAILY fact");
  const skuAmountMinor = sumAmounts(skuRows, exponent);
  const mappedAmountMinor = sumAmounts(skuRows.filter((row) => row.product_id !== null), exponent);
  const unmappedAmountMinor = skuAmountMinor - mappedAmountMinor;
  const storeDailyAmountMinor = store ? toMinor(store.sales_amount, exponent) : skuAmountMinor;
  if (storeDailyAmountMinor !== skuAmountMinor) issues.push("store/SKU sales amount mismatch");
  if (unmappedAmountMinor !== 0) issues.push("unmapped sales amount");
  const orders = store?.orders ?? sumIntegers(skuRows.map((row) => row.orders));
  const units = store?.units_sold ?? sumIntegers(skuRows.map((row) => row.units_sold));
  const syncRunId = store?.sync_run_id ?? rows[0]?.sync_run_id ?? null;
  const replayRuns = listRuns(database, config, "sales_traffic", businessDate, observedAt);
  const replay = replayRuns[0];
  if (replayRuns.length < 2) issues.push("sales replay evidence unavailable");
  if (replay && replay.created_records !== 0) issues.push("sales replay created records");
  return {
    hasFacts: true,
    syncRunId,
    storeDailyAmountMinor,
    skuAmountMinor: mappedAmountMinor,
    unmappedAmountMinor,
    orders,
    units,
    factRows: rows.length,
    replayCreatedRecords: replay?.created_records ?? 0,
    replayUpdatedRecords: replay?.updated_records ?? 0,
  };
}

function readFba(
  database: DatabaseSync,
  config: ShadowEvidenceCollectorConfig,
  businessDate: string,
  observedAt: string,
  issues: string[],
): FbaSummary {
  const run = listRuns(database, config, "fba_inventory", businessDate, observedAt)[0];
  const latestAttempt = latestRunAttempt(database, config, "fba_inventory", businessDate, observedAt);
  if (latestAttempt && latestAttempt.status !== "success") issues.push(`fba latest run ${latestAttempt.status}`);
  if (!run) {
    issues.push("fba run unavailable");
    return { sourceRunId: null, snapshotRows: 0, latestRows: 0, asOfRows: 0, freshnessMinutes: 525_600 };
  }
  const snapshotRows = countRows(database, `
    SELECT COUNT(*) AS count
    FROM sp_api_inventory_snapshots
    WHERE org_id = ? AND data_source_id = ? AND commerce_store_id = ?
      AND marketplace = ? AND sync_run_id = ? AND status = 'success'
  `, config, run.id);
  const latestRows = countRows(database, `
    SELECT COUNT(*) AS count
    FROM sp_api_inventory_latest
    WHERE org_id = ? AND data_source_id = ? AND commerce_store_id = ?
      AND marketplace = ? AND status = 'success'
  `, config);
  const asOfRows = countRowsAsOf(database, config, run.id, observedAt);
  issues.push(...fbaCheckpointIssues(run, snapshotRows));
  if (asOfRows !== snapshotRows) issues.push("fba snapshot extends beyond observedAt");
  const freshness = database.prepare(`
    SELECT MAX(source_time) AS source_time,
           MAX(synced_at) AS synced_at,
           SUM(CASE WHEN source_time IS NULL OR TRIM(source_time) = '' THEN 1 ELSE 0 END) AS missing_source_time,
           SUM(CASE WHEN source_time IS NOT NULL AND TRIM(source_time) <> '' AND julianday(source_time) IS NULL THEN 1 ELSE 0 END) AS invalid_source_time
    FROM sp_api_inventory_snapshots
    WHERE org_id = ? AND data_source_id = ? AND commerce_store_id = ?
      AND marketplace = ? AND sync_run_id = ? AND status = 'success'
  `).get(config.orgId, config.dataSourceId, config.commerceStoreId, config.marketplace, run.id) as FbaFreshnessRow | undefined;
  if ((freshness?.missing_source_time ?? 0) > 0) issues.push("fba source time unavailable");
  if ((freshness?.invalid_source_time ?? 0) > 0) issues.push("fba source time invalid");
  const freshnessMinutes = minutesBetween(observedAt, freshness?.source_time ?? freshness?.synced_at ?? run.finished_at ?? run.started_at);
  if (snapshotRows === 0 || latestRows === 0 || asOfRows === 0) issues.push("fba inventory rows unavailable");
  if (freshnessMinutes > 60) issues.push("fba freshness exceeds 60 minutes");
  return { sourceRunId: run.id, snapshotRows, latestRows, asOfRows, freshnessMinutes };
}

function listRuns(
  database: DatabaseSync,
  config: ShadowEvidenceCollectorConfig,
  domain: "sales_traffic" | "fba_inventory",
  businessDate: string,
  observedAt: string,
): RunRow[] {
  return database.prepare(`
    SELECT id, created_records, updated_records, status, error_code, checkpoint_summary, started_at, finished_at
    FROM data_source_sync_runs
    WHERE org_id = ? AND data_source_id = ? AND domain = ? AND status = 'success'
      AND (requested_from_date IS NULL OR requested_from_date <= ?)
      AND (requested_to_date IS NULL OR requested_to_date >= ?)
      AND (finished_at IS NULL OR finished_at <= ?)
    ORDER BY COALESCE(finished_at, started_at) DESC, id DESC
  `).all(config.orgId, config.dataSourceId, domain, businessDate, businessDate, observedAt) as unknown as RunRow[];
}

function latestRunAttempt(
  database: DatabaseSync,
  config: ShadowEvidenceCollectorConfig,
  domain: "sales_traffic" | "fba_inventory",
  businessDate: string,
  observedAt: string,
): LatestRunAttempt | null {
  const row = database.prepare(`
    SELECT status, error_code
    FROM data_source_sync_runs
    WHERE org_id = ? AND data_source_id = ? AND domain = ?
      AND (requested_from_date IS NULL OR requested_from_date <= ?)
      AND (requested_to_date IS NULL OR requested_to_date >= ?)
      AND (started_at <= ?)
    ORDER BY COALESCE(finished_at, started_at) DESC, id DESC
    LIMIT 1
  `).get(config.orgId, config.dataSourceId, domain, businessDate, businessDate, observedAt) as LatestRunAttempt | undefined;
  return row ?? null;
}

function appendOpenMappingIssues(
  database: DatabaseSync,
  config: ShadowEvidenceCollectorConfig,
  issues: string[],
): void {
  const rows = database.prepare(`
    SELECT DISTINCT issue_type
    FROM data_source_mapping_issues
    WHERE org_id = ? AND data_source_id = ? AND commerce_store_id = ?
      AND marketplace = ? AND domain = 'sales_traffic' AND status <> 'resolved'
    ORDER BY issue_type
  `).all(config.orgId, config.dataSourceId, config.commerceStoreId, config.marketplace) as Array<{ issue_type: string }>;
  for (const row of rows) issues.push(`mapping issue: ${row.issue_type}`);
}

function countRows(
  database: DatabaseSync,
  sql: string,
  config: ShadowEvidenceCollectorConfig,
  runId?: number,
): number {
  const row = database.prepare(sql).get(
    config.orgId,
    config.dataSourceId,
    config.commerceStoreId,
    config.marketplace,
    ...(runId === undefined ? [] : [runId]),
  ) as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

function countRowsAsOf(
  database: DatabaseSync,
  config: ShadowEvidenceCollectorConfig,
  runId: number,
  observedAt: string,
): number {
  const row = database.prepare(`
    SELECT COUNT(*) AS count
    FROM sp_api_inventory_snapshots
    WHERE org_id = ? AND data_source_id = ? AND commerce_store_id = ?
      AND marketplace = ? AND sync_run_id = ? AND status = 'success'
      AND synced_at <= ?
  `).get(
    config.orgId,
    config.dataSourceId,
    config.commerceStoreId,
    config.marketplace,
    runId,
    observedAt,
  ) as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}
