import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SqliteCheckpointMode = "none" | "passive" | "truncate";

export interface SqliteCheckpointSnapshot {
  mode: Exclude<SqliteCheckpointMode, "none">;
  busy: number;
  walFrames: number;
  checkpointedFrames: number;
}

export interface SqliteStorageSnapshot {
  path: string;
  observedAt: string;
  journalMode: string;
  synchronous: number;
  observerBusyTimeoutMs: number;
  pageSize: number;
  pageCount: number;
  freelistCount: number;
  walAutocheckpointPages: number;
  databaseBytes: number;
  walBytes: number;
  shmBytes: number;
  totalBytes: number;
  checkpoint: SqliteCheckpointSnapshot | null;
}

export interface SqliteStorageThresholds {
  requireWal?: boolean;
  maxWalBytes?: number;
  maxTotalBytes?: number;
  maxFreelistRatio?: number;
}

export interface SqliteStorageHealth {
  ok: boolean;
  issues: string[];
  freelistRatio: number;
}

export function inspectSqliteStorage(
  databasePath: string,
  options: { checkpoint?: SqliteCheckpointMode } = {},
): SqliteStorageSnapshot {
  const path = resolve(databasePath);
  if (!existsSync(path)) {
    throw new Error(`SQLite database does not exist: ${path}`);
  }
  if (fileBytes(path) === 0) {
    throw new Error(`SQLite database is empty: ${path}`);
  }

  const checkpointMode = options.checkpoint ?? "none";
  const database = checkpointMode === "none"
    ? new DatabaseSync(path, { readOnly: true })
    : new DatabaseSync(path);
  try {
    const checkpoint = checkpointMode === "none"
      ? null
      : readCheckpoint(database, checkpointMode);
    const pageSize = pragmaNumber(database, "PRAGMA page_size", "page_size");
    const pageCount = pragmaNumber(database, "PRAGMA page_count", "page_count");
    const freelistCount = pragmaNumber(database, "PRAGMA freelist_count", "freelist_count");
    const databaseBytes = fileBytes(path);
    const walBytes = fileBytes(`${path}-wal`);
    const shmBytes = fileBytes(`${path}-shm`);

    return {
      path,
      observedAt: new Date().toISOString(),
      journalMode: pragmaText(database, "PRAGMA journal_mode", "journal_mode").toLowerCase(),
      synchronous: pragmaNumber(database, "PRAGMA synchronous", "synchronous"),
      observerBusyTimeoutMs: pragmaNumber(database, "PRAGMA busy_timeout", "timeout"),
      pageSize,
      pageCount,
      freelistCount,
      walAutocheckpointPages: pragmaNumber(database, "PRAGMA wal_autocheckpoint", "wal_autocheckpoint"),
      databaseBytes,
      walBytes,
      shmBytes,
      totalBytes: databaseBytes + walBytes + shmBytes,
      checkpoint,
    };
  } finally {
    database.close();
  }
}

export function evaluateSqliteStorage(
  snapshot: SqliteStorageSnapshot,
  thresholds: SqliteStorageThresholds = {},
): SqliteStorageHealth {
  validateThresholds(thresholds);
  const issues: string[] = [];
  const freelistRatio = snapshot.pageCount === 0
    ? 0
    : snapshot.freelistCount / snapshot.pageCount;

  if (thresholds.requireWal && snapshot.journalMode !== "wal") {
    issues.push(`journal mode is ${snapshot.journalMode}, expected wal`);
  }
  if (thresholds.maxWalBytes !== undefined && snapshot.walBytes > thresholds.maxWalBytes) {
    issues.push(`WAL is ${snapshot.walBytes} bytes, above ${thresholds.maxWalBytes}`);
  }
  if (thresholds.maxTotalBytes !== undefined && snapshot.totalBytes > thresholds.maxTotalBytes) {
    issues.push(`SQLite storage is ${snapshot.totalBytes} bytes, above ${thresholds.maxTotalBytes}`);
  }
  if (thresholds.maxFreelistRatio !== undefined && freelistRatio > thresholds.maxFreelistRatio) {
    issues.push(`freelist ratio is ${freelistRatio}, above ${thresholds.maxFreelistRatio}`);
  }

  return { ok: issues.length === 0, issues, freelistRatio };
}

function readCheckpoint(
  database: DatabaseSync,
  mode: Exclude<SqliteCheckpointMode, "none">,
): SqliteCheckpointSnapshot {
  const row = database.prepare(`PRAGMA wal_checkpoint(${mode.toUpperCase()})`).get() as Record<string, unknown> | undefined;
  return {
    mode,
    busy: numberValue(row, "busy"),
    walFrames: numberValue(row, "log"),
    checkpointedFrames: numberValue(row, "checkpointed"),
  };
}

function pragmaText(database: DatabaseSync, sql: string, key: string): string {
  const row = database.prepare(sql).get() as Record<string, unknown> | undefined;
  const value = row?.[key];
  if (typeof value !== "string") {
    throw new Error(`SQLite pragma ${key} did not return text`);
  }
  return value;
}

function pragmaNumber(database: DatabaseSync, sql: string, key: string): number {
  const row = database.prepare(sql).get() as Record<string, unknown> | undefined;
  return numberValue(row, key);
}

function numberValue(row: Record<string, unknown> | undefined, key: string): number {
  const value = row?.[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`SQLite pragma ${key} did not return a finite number`);
  }
  return value;
}

function fileBytes(path: string): number {
  if (!existsSync(path)) return 0;
  return statSync(path).size;
}

function validateThresholds(thresholds: SqliteStorageThresholds): void {
  for (const [name, value] of Object.entries(thresholds)) {
    if (name === "requireWal") continue;
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`SQLite storage threshold ${name} must be a non-negative finite number`);
    }
  }
  if (thresholds.maxFreelistRatio !== undefined && thresholds.maxFreelistRatio > 1) {
    throw new Error("SQLite storage threshold maxFreelistRatio must be no more than 1");
  }
}
