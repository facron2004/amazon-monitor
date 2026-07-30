import { DatabaseSync } from "node:sqlite";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";

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

export function migrateLegacyDatabase(
  legacyDatabase: string,
  targetDatabase: string,
): "migrated" | "skipped" {
  if (!existsSync(legacyDatabase) || existsSync(targetDatabase)) return "skipped";

  mkdirSync(dirname(targetDatabase), { recursive: true });
  const temporary = `${targetDatabase}.migrating`;
  const backup = `${targetDatabase}.legacy-backup`;
  try {
    copyFileSync(legacyDatabase, temporary);
    verifySqliteDatabase(temporary);
    copyFileSync(legacyDatabase, backup);
    renameSync(temporary, targetDatabase);
    verifySqliteDatabase(targetDatabase);
    return "migrated";
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
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
