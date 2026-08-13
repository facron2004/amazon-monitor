import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { verifySqliteDatabaseFile } from "../apps/api/src/store/db-backup.js";
import type {
  ShadowPreflightBackup,
  ShadowPreflightCheck,
  ShadowPreflightOptions,
} from "./verify-sp-api-shadow-preflight-types.js";

export interface BackupInspectionResult {
  check: ShadowPreflightCheck;
  artifact: ShadowPreflightBackup | null;
}

export function inspectBackupArtifact(
  backupPath: string | null | undefined,
  databasePath: string,
  productionDatabasePath: string,
  required: boolean,
): BackupInspectionResult {
  const path = backupPath?.trim() ? resolve(backupPath) : null;
  if (!path) {
    return {
      check: {
        name: "backup_artifact",
        ok: !required,
        detail: required ? "backup path is required" : "backup path was not supplied",
      },
      artifact: null,
    };
  }
  const normalizedPath = normalizePath(path);
  if (normalizedPath === normalizePath(databasePath) || normalizedPath === normalizePath(productionDatabasePath)) {
    return {
      check: {
        name: "backup_artifact",
        ok: false,
        detail: "backup path must be distinct from both shadow and production databases",
      },
      artifact: null,
    };
  }
  try {
    const verification = verifySqliteDatabaseFile(path);
    const bytes = readFileSync(path);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const artifact: ShadowPreflightBackup = {
      path: verification.path,
      sha256,
      bytes: verification.bytes,
      tableCount: verification.tableCount,
      integrityCheck: verification.integrityCheck,
    };
    return {
      check: {
        name: "backup_artifact",
        ok: verification.tableCount > 0,
        detail: verification.tableCount > 0
          ? `backup integrity is ok; sha256=${sha256}`
          : "backup has no application tables",
      },
      artifact,
    };
  } catch (error) {
    return {
      check: {
        name: "backup_artifact",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      },
      artifact: null,
    };
  }
}

export function inspectUserDataIsolation(
  options: ShadowPreflightOptions,
  required: boolean,
): ShadowPreflightCheck {
  const shadowPath = options.shadowUserDataPath?.trim() ? resolve(options.shadowUserDataPath) : null;
  const productionPath = options.productionUserDataPath?.trim() ? resolve(options.productionUserDataPath) : null;
  if (!shadowPath || !productionPath) {
    return {
      name: "user_data_isolated",
      ok: !required,
      detail: required
        ? "shadow and production userData paths are required"
        : "userData isolation was not requested",
    };
  }
  const isolated = !pathsOverlap(shadowPath, productionPath);
  return {
    name: "user_data_isolated",
    ok: isolated,
    detail: isolated
      ? "shadow userData is distinct from production userData"
      : "shadow and production userData paths overlap",
  };
}

export function inspectRuntimeDatabaseBinding(
  databasePath: string,
  options: ShadowPreflightOptions,
  required: boolean,
): ShadowPreflightCheck {
  const runtimePath = options.runtimeDatabasePath === undefined
    ? process.env.DB_PATH?.trim() || null
    : options.runtimeDatabasePath?.trim() || null;
  if (!runtimePath) {
    return {
      name: "runtime_database_binding",
      ok: !required,
      detail: required ? "runtime DB_PATH is required" : "runtime DB_PATH was not supplied",
    };
  }
  const bound = normalizePath(runtimePath) === normalizePath(databasePath);
  return {
    name: "runtime_database_binding",
    ok: bound,
    detail: bound
      ? "runtime DB_PATH resolves to the shadow database"
      : "runtime DB_PATH does not resolve to the configured shadow database",
  };
}

export function normalizePath(path: string): string {
  const absolutePath = resolve(path);
  try {
    return realpathSync.native(absolutePath).replace(/[\\/]+/g, "/").toLowerCase();
  } catch {
    return absolutePath.replace(/[\\/]+/g, "/").toLowerCase();
  }
}

export function pathsOverlap(left: string, right: string): boolean {
  const normalizedLeft = `${normalizePath(left).replace(/\/$/, "")}/`;
  const normalizedRight = `${normalizePath(right).replace(/\/$/, "")}/`;
  return normalizedLeft.startsWith(normalizedRight) || normalizedRight.startsWith(normalizedLeft);
}

export function isEnvTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}
