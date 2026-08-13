import { resolve } from "node:path";
import {
  evaluateSqliteStorage,
  inspectSqliteStorage,
} from "../apps/api/src/store/sqlite-storage.js";
import type { SqliteStorageThresholds } from "../apps/api/src/store/sqlite-storage.js";
import { validateConfig } from "./sp-api-shadow-evidence-collector-utils.js";
import type { ShadowEvidenceCollectorConfig } from "./sp-api-shadow-evidence-collector-types.js";
import {
  inspectBackupArtifact,
  inspectRuntimeDatabaseBinding,
  inspectUserDataIsolation,
  isEnvTrue,
  normalizePath,
} from "./verify-sp-api-shadow-preflight-utils.js";
import { readIdentityChecks } from "./verify-sp-api-shadow-preflight-boundaries.js";
import type {
  ShadowPreflightCheck,
  ShadowPreflightOptions,
  ShadowPreflightResult,
  ShadowPreflightScope,
  ShadowPreflightStorage,
} from "./verify-sp-api-shadow-preflight-types.js";

export type {
  ShadowPreflightCheck,
  ShadowPreflightOptions,
  ShadowPreflightResult,
  ShadowPreflightScope,
} from "./verify-sp-api-shadow-preflight-types.js";

export const DEFAULT_SHADOW_STORAGE_THRESHOLDS = {
  requireWal: true,
  maxWalBytes: 512 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
} satisfies SqliteStorageThresholds;

export function runShadowPreflight(
  config: ShadowEvidenceCollectorConfig,
  options: ShadowPreflightOptions = {},
): ShadowPreflightResult {
  const databasePath = resolve(config.databasePath);
  const productionDatabasePath = resolve(
    options.productionDatabasePath ?? resolve(process.cwd(), "data/amazon-monitor.sqlite"),
  );
  const shadowUserDataPath = resolveOptionalPath(options.shadowUserDataPath);
  const productionUserDataPath = resolveOptionalPath(options.productionUserDataPath);
  const runtimeDatabasePath = resolveOptionalPath(
    options.runtimeDatabasePath === undefined
      ? process.env.DB_PATH
      : options.runtimeDatabasePath,
  );
  const storageThresholds = {
    ...DEFAULT_SHADOW_STORAGE_THRESHOLDS,
    ...options.storageThresholds,
    ...(options.requireWal === undefined ? {} : { requireWal: options.requireWal }),
  };
  const checks: ShadowPreflightCheck[] = [
    checkConfigWindow(config),
    checkDatabaseIsolation(databasePath, productionDatabasePath),
    {
      name: "connector_enabled",
      ok: options.connectorEnabled ?? isEnvTrue(process.env.SP_API_CONNECTOR_ENABLED),
      detail: (options.connectorEnabled ?? isEnvTrue(process.env.SP_API_CONNECTOR_ENABLED))
        ? "SP-API connector is enabled"
        : "SP_API_CONNECTOR_ENABLED must be true",
    },
    checkFixtureDisabled(options),
    inspectUserDataIsolation(
      { ...options, shadowUserDataPath, productionUserDataPath },
      options.requireUserDataIsolation ?? true,
    ),
    inspectRuntimeDatabaseBinding(
      databasePath,
      { ...options, runtimeDatabasePath },
      options.requireRuntimeDatabaseBinding ?? true,
    ),
  ];

  const backupInspection = inspectBackupArtifact(
    options.backupPath,
    databasePath,
    productionDatabasePath,
    options.requireBackup ?? true,
  );
  checks.push(backupInspection.check);

  let storage: ShadowPreflightStorage | null = null;
  try {
    const snapshot = inspectSqliteStorage(databasePath, { checkpoint: "none" });
    const health = evaluateSqliteStorage(snapshot, storageThresholds);
    storage = {
      snapshot,
      health,
      thresholds: {
        requireWal: storageThresholds.requireWal === true,
        maxWalBytes: storageThresholds.maxWalBytes ?? DEFAULT_SHADOW_STORAGE_THRESHOLDS.maxWalBytes,
        maxTotalBytes: storageThresholds.maxTotalBytes ?? DEFAULT_SHADOW_STORAGE_THRESHOLDS.maxTotalBytes,
        ...(storageThresholds.maxFreelistRatio === undefined
          ? {}
          : { maxFreelistRatio: storageThresholds.maxFreelistRatio }),
      },
    };
    checks.push({
      name: "sqlite_storage",
      ok: health.ok,
      detail: health.ok
        ? `readable SQLite database with journal_mode=${snapshot.journalMode}`
        : health.issues.join("; "),
    });
  } catch (error) {
    checks.push({
      name: "sqlite_storage",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  checks.push(...readIdentityChecks(config, databasePath));
  return {
    schemaVersion: 1,
    ok: checks.every((check) => check.ok),
    databasePath,
    productionDatabasePath,
    runtimeDatabasePath,
    scope: {
      evidenceBundleId: config.evidenceBundleId,
      organizationId: config.organizationEvidenceId,
      commerceStoreId: config.commerceStoreEvidenceId,
      sourceId: config.sourceEvidenceId,
      marketplace: config.marketplace,
      currency: config.currency,
      businessTimezone: config.businessTimezone,
      windowStart: config.windowStart,
      windowEnd: config.windowEnd,
    },
    userData: {
      shadowPath: shadowUserDataPath,
      productionPath: productionUserDataPath,
    },
    backup: backupInspection.artifact,
    checks,
    storage,
  };
}

function checkConfigWindow(config: ShadowEvidenceCollectorConfig): ShadowPreflightCheck {
  try {
    const dates = validateConfig(config);
    return {
      name: "config_window",
      ok: true,
      detail: `seven business dates and ${dates.length} external references are complete`,
    };
  } catch (error) {
    return {
      name: "config_window",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkDatabaseIsolation(
  databasePath: string,
  productionDatabasePath: string,
): ShadowPreflightCheck {
  const isolated = !samePath(databasePath, productionDatabasePath);
  return {
    name: "database_isolated",
    ok: isolated,
    detail: isolated
      ? "shadow database path is distinct from production"
      : "shadow database path must not equal production database path",
  };
}

function checkFixtureDisabled(options: ShadowPreflightOptions): ShadowPreflightCheck {
  const fixtureDirectory = options.fixtureDirectory === undefined
    ? process.env.SP_API_SYNC_FIXTURE_DIR?.trim() || null
    : options.fixtureDirectory?.trim() || null;
  return {
    name: "fixture_disabled",
    ok: fixtureDirectory === null,
    detail: fixtureDirectory === null
      ? "SP-API fixture mode is disabled"
      : "SP_API_SYNC_FIXTURE_DIR must be empty for a real shadow run",
  };
}

function resolveOptionalPath(value: string | null | undefined): string | null {
  return value?.trim() ? resolve(value) : null;
}

function samePath(left: string, right: string): boolean {
  return normalizePath(left) === normalizePath(right);
}
