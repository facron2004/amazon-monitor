import { backup as backupSqliteDatabase, DatabaseSync } from "node:sqlite";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface DesktopPaths {
  browser: string;
  database: string;
  exports: string;
  logs: string;
  secrets: string;
}

export function createDesktopPaths(userData: string): DesktopPaths {
  const paths = {
    browser: join(userData, "browser"),
    database: join(userData, "data", "amazon-monitor.sqlite"),
    exports: join(userData, "exports"),
    logs: join(userData, "logs"),
    secrets: join(userData, "secrets"),
  };
  Object.values(paths).forEach((path) => mkdirSync(
    path.endsWith(".sqlite") ? dirname(path) : path,
    { recursive: true },
  ));
  return paths;
}

export async function migrateLegacyDatabase(
  legacyDatabase: string,
  targetDatabase: string,
): Promise<"migrated" | "skipped"> {
  if (!existsSync(legacyDatabase) || existsSync(targetDatabase)) return "skipped";

  mkdirSync(dirname(targetDatabase), { recursive: true });
  const temporary = `${targetDatabase}.migrating`;
  const backup = `${targetDatabase}.legacy-backup`;
  const source = new DatabaseSync(legacyDatabase, { readOnly: true });
  try {
    if (existsSync(temporary)) unlinkSync(temporary);
    await backupSqliteDatabase(source, temporary);
    verifySqliteDatabase(temporary);
    removeSqliteSidecars(temporary);
    copyFileSync(temporary, backup);
    renameSync(temporary, targetDatabase);
    verifySqliteDatabase(targetDatabase);
    return "migrated";
  } catch (error) {
    removeSqliteSidecars(temporary);
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  } finally {
    source.close();
  }
}

function removeSqliteSidecars(path: string): void {
  for (const suffix of ["-shm", "-wal"]) {
    const sidecar = `${path}${suffix}`;
    if (existsSync(sidecar)) unlinkSync(sidecar);
  }
}

export function findLegacyDatabase(
  candidates: Array<string | undefined>,
  targetDatabase: string,
): string | null {
  const target = resolve(targetDatabase);
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = resolve(candidate);
    if (normalized === target || seen.has(normalized)) continue;
    seen.add(normalized);
    if (existsSync(normalized) && statSync(normalized).size > 0) {
      return normalized;
    }
  }
  return null;
}

function verifySqliteDatabase(path: string): void {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const result = database.prepare("PRAGMA integrity_check").get() as
      | { integrity_check?: string }
      | undefined;
    if (result?.integrity_check !== "ok") {
      throw new Error("SQLite integrity check failed");
    }
  } finally {
    database.close();
  }
}
