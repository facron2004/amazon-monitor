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
  if (!shouldMigrateDatabase(legacyDatabase, targetDatabase)) {
    return "skipped";
  }

  mkdirSync(dirname(targetDatabase), { recursive: true });
  const temporary = `${targetDatabase}.migrating`;
  const backup = `${targetDatabase}.legacy-backup`;
  const source = new DatabaseSync(legacyDatabase, { readOnly: true });
  try {
    if (existsSync(temporary)) unlinkSync(temporary);
    await backupSqliteDatabase(source, temporary);
    verifySqliteDatabase(temporary);
    removeSqliteSidecars(temporary);
    removeSqliteSidecars(backup);
    copyFileSync(temporary, backup);
    removeSqliteSidecars(targetDatabase);
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

export function shouldMigrateDatabase(
  legacyPath: string,
  targetPath: string,
): boolean {
  if (!existsSync(legacyPath)) return false;
  if (!existsSync(targetPath)) return true;

  const legacyStat = statSync(legacyPath);
  const targetStat = statSync(targetPath);
  if (legacyStat.mtimeMs > targetStat.mtimeMs) {
    return true;
  }

  try {
    const legacyMaxId = getMaxDataId(legacyPath);
    const targetMaxId = getMaxDataId(targetPath);
    if (legacyMaxId > targetMaxId) {
      return true;
    }
  } catch {
    // If reading internal tables fails, fall back to false
  }

  return false;
}

function getMaxDataId(dbPath: string): number {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    let maxId = 0;
    for (const query of [
      "SELECT MAX(id) as max_id FROM amazon_collect_task_log",
      "SELECT MAX(id) as max_id FROM amazon_keyword_serp_snapshot",
      "SELECT MAX(id) as max_id FROM amazon_bestseller_rank_snapshot",
    ]) {
      try {
        const row = db.prepare(query).get() as { max_id?: number | null } | undefined;
        if (row?.max_id && typeof row.max_id === "number") {
          if (row.max_id > maxId) maxId = row.max_id;
        }
      } catch {
        // Table might not exist yet
      }
    }
    return maxId;
  } finally {
    db.close();
  }
}

export function findProjectDataDatabase(startDir: string): string | undefined {
  let current = resolve(startDir);
  while (current) {
    const candidate = join(current, "data", "amazon-monitor.sqlite");
    if (existsSync(candidate) && statSync(candidate).size > 0) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
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
