import { randomBytes } from "node:crypto";
import {
  backup as backupSqliteDatabase,
  DatabaseSync,
} from "node:sqlite";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  type Dirent,
  type Stats,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

export interface SqliteBackupResult {
  sourcePath: string;
  targetPath: string;
  bytes: number;
}

export interface SqliteDatabaseVerificationResult {
  path: string;
  bytes: number;
  integrityCheck: "ok";
  tableCount: number;
}

export interface SqliteRestoreVerificationResult {
  sourcePath: string;
  restoredBytes: number;
  tableCount: number;
}

export interface SqliteBackupRetentionResult {
  directory: string;
  keep: number;
  candidates: number;
  removed: string[];
}

/**
 * Creates an integrity-checked SQLite snapshot without copying a live WAL file.
 * The target is never overwritten; callers can safely retry with a new name.
 */
export async function backupSqliteDatabaseFile(
  sourcePath: string,
  targetPath: string,
): Promise<SqliteBackupResult> {
  const source = resolve(sourcePath);
  const target = resolve(targetPath);
  if (source === target) {
    throw new Error("SQLite backup target must differ from the source database");
  }
  if (!existsSync(source)) {
    throw new Error(`SQLite source database does not exist: ${source}`);
  }
  if (existsSync(target)) {
    throw new Error(`SQLite backup target already exists: ${target}`);
  }

  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${randomBytes(8).toString("hex")}`;
  const sourceDatabase = new DatabaseSync(source, { readOnly: true });
  let committed = false;
  try {
    await backupSqliteDatabase(sourceDatabase, temporary);
    verifySqliteDatabaseFile(temporary);
    renameSync(temporary, target);
    committed = true;
    verifySqliteDatabaseFile(target);
    removeSqliteSidecars(target);
    return {
      sourcePath: source,
      targetPath: target,
      bytes: statSync(target).size,
    };
  } catch (error) {
    removeSqliteSidecars(temporary);
    removeIfExists(temporary);
    if (committed) {
      removeSqliteSidecars(target);
      removeIfExists(target);
    }
    throw error;
  } finally {
    sourceDatabase.close();
  }
}

export function verifySqliteDatabaseFile(path: string): SqliteDatabaseVerificationResult {
  const databasePath = resolve(path);
  if (!existsSync(databasePath)) {
    throw new Error(`SQLite database does not exist: ${databasePath}`);
  }
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const result = database.prepare("PRAGMA integrity_check").get() as
      | { integrity_check?: string }
      | undefined;
    if (result?.integrity_check !== "ok") {
      throw new Error(`SQLite integrity check failed: ${databasePath}`);
    }
    const tableCount = database.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    ).get() as { count?: number } | undefined;
    return {
      path: databasePath,
      bytes: statSync(databasePath).size,
      integrityCheck: "ok",
      tableCount: Number(tableCount?.count ?? 0),
    };
  } finally {
    database.close();
  }
}

/**
 * Restores a backup into an isolated temporary database and opens it again.
 * The source backup and the live database are never modified.
 */
export async function verifySqliteBackupRestore(
  sourcePath: string,
): Promise<SqliteRestoreVerificationResult> {
  const source = resolve(sourcePath);
  if (!existsSync(source)) {
    throw new Error(`SQLite backup does not exist: ${source}`);
  }
  const temporaryRoot = mkdtempSync(join(tmpdir(), "amazon-monitor-db-restore-"));
  const restoredPath = join(temporaryRoot, "restored.sqlite");
  try {
    const restored = await backupSqliteDatabaseFile(source, restoredPath);
    const verification = verifySqliteDatabaseFile(restored.targetPath);
    return {
      sourcePath: source,
      restoredBytes: verification.bytes,
      tableCount: verification.tableCount,
    };
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

/**
 * Removes old timestamped backups only when an explicit keep count is given.
 * Files are ordered newest-first by modification time, then by name.
 */
export function pruneSqliteBackups(
  directoryPath: string,
  keep: number,
  prefix = "amazon-monitor-",
): SqliteBackupRetentionResult {
  if (!Number.isInteger(keep) || keep < 1) {
    throw new Error("SQLite backup keep count must be a positive integer");
  }
  const directory = resolve(directoryPath);
  if (!existsSync(directory)) {
    return { directory, keep, candidates: 0, removed: [] };
  }
  const candidates = readdirSync(directory, { withFileTypes: true })
    .filter((entry: Dirent) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".sqlite"))
    .map((entry: Dirent) => {
      const path = join(directory, entry.name);
      const stats: Stats = statSync(path);
      return { name: entry.name, path, modifiedAt: stats.mtimeMs };
    })
    .sort((left, right) => right.modifiedAt - left.modifiedAt || right.name.localeCompare(left.name));
  const removed = candidates.slice(keep).map((entry) => entry.path);
  for (const path of removed) {
    removeSqliteSidecars(path);
    unlinkSync(path);
  }
  return { directory, keep, candidates: candidates.length, removed };
}

function removeIfExists(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

function removeSqliteSidecars(path: string): void {
  removeIfExists(`${path}-wal`);
  removeIfExists(`${path}-shm`);
}
