import type {
  SqliteStorageHealth,
  SqliteStorageSnapshot,
} from "../apps/api/src/store/sqlite-storage.js";

export interface ShadowPreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ShadowPreflightStorage {
  snapshot: SqliteStorageSnapshot;
  health: SqliteStorageHealth;
  thresholds: {
    requireWal: boolean;
    maxWalBytes: number;
    maxTotalBytes: number;
    maxFreelistRatio?: number;
  };
}

export interface ShadowPreflightBackup {
  path: string;
  sha256: string;
  bytes: number;
  tableCount: number;
  integrityCheck: "ok";
}

export interface ShadowPreflightScope {
  evidenceBundleId: string;
  organizationId: string;
  commerceStoreId: string;
  sourceId: string;
  marketplace: string;
  currency: string;
  businessTimezone: string;
  windowStart: string;
  windowEnd: string;
}

export interface ShadowPreflightOptions {
  productionDatabasePath?: string;
  connectorEnabled?: boolean;
  fixtureDirectory?: string | null;
  requireWal?: boolean;
  backupPath?: string | null;
  shadowUserDataPath?: string | null;
  productionUserDataPath?: string | null;
  runtimeDatabasePath?: string | null;
  requireBackup?: boolean;
  requireUserDataIsolation?: boolean;
  requireRuntimeDatabaseBinding?: boolean;
  storageThresholds?: {
    maxWalBytes?: number;
    maxTotalBytes?: number;
    maxFreelistRatio?: number;
  };
}

export interface ShadowPreflightResult {
  schemaVersion: 1;
  ok: boolean;
  databasePath: string;
  productionDatabasePath: string;
  runtimeDatabasePath: string | null;
  scope: ShadowPreflightScope;
  userData: {
    shadowPath: string | null;
    productionPath: string | null;
  };
  backup: ShadowPreflightBackup | null;
  checks: ShadowPreflightCheck[];
  storage: ShadowPreflightStorage | null;
}
