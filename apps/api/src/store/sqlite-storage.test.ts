import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateSqliteStorage,
  inspectSqliteStorage,
  type SqliteStorageSnapshot,
} from "./sqlite-storage.js";

describe("sqlite storage observability", () => {
  it("observes a live WAL database and can collect checkpoint evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-sqlite-storage-"));
    const path = join(root, "storage.sqlite");
    const database = new DatabaseSync(path);
    try {
      database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA wal_autocheckpoint = 0;
        CREATE TABLE storage_probe (value TEXT NOT NULL);
        BEGIN;
        INSERT INTO storage_probe (value) VALUES ('${"x".repeat(2048)}');
        COMMIT;
      `);

      const observed = inspectSqliteStorage(path);
      expect(observed.journalMode).toBe("wal");
      expect(observed.databaseBytes).toBeGreaterThan(0);
      expect(observed.totalBytes).toBeGreaterThanOrEqual(observed.databaseBytes);
      expect(observed.checkpoint).toBeNull();

      const checkpointed = inspectSqliteStorage(path, { checkpoint: "passive" });
      expect(checkpointed.checkpoint).toMatchObject({
        mode: "passive",
        busy: 0,
      });
      expect(checkpointed.checkpoint?.walFrames).toBeGreaterThanOrEqual(0);
      expect(checkpointed.checkpoint?.checkpointedFrames).toBeGreaterThanOrEqual(0);
    } finally {
      database.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails only the explicitly configured storage thresholds", () => {
    const snapshot: SqliteStorageSnapshot = {
      path: "C:/shadow/storage.sqlite",
      observedAt: "2026-08-10T00:00:00.000Z",
      journalMode: "wal",
      synchronous: 1,
      observerBusyTimeoutMs: 10_000,
      pageSize: 4096,
      pageCount: 100,
      freelistCount: 15,
      walAutocheckpointPages: 1000,
      databaseBytes: 409_600,
      walBytes: 819_200,
      shmBytes: 32_768,
      totalBytes: 1_261_568,
      checkpoint: null,
    };

    expect(evaluateSqliteStorage(snapshot, { requireWal: true })).toEqual({
      ok: true,
      issues: [],
      freelistRatio: 0.15,
    });

    const health = evaluateSqliteStorage(snapshot, {
      requireWal: true,
      maxWalBytes: 100,
      maxTotalBytes: 100,
      maxFreelistRatio: 0.1,
    });
    expect(health.ok).toBe(false);
    expect(health.issues).toHaveLength(3);
    expect(health.issues.join(" ")).toContain("WAL");
    expect(health.issues.join(" ")).toContain("freelist ratio");
  });

  it("rejects invalid thresholds and missing databases", () => {
    const snapshot: SqliteStorageSnapshot = {
      path: "C:/shadow/storage.sqlite",
      observedAt: "2026-08-10T00:00:00.000Z",
      journalMode: "delete",
      synchronous: 2,
      observerBusyTimeoutMs: 0,
      pageSize: 4096,
      pageCount: 1,
      freelistCount: 0,
      walAutocheckpointPages: 1000,
      databaseBytes: 4096,
      walBytes: 0,
      shmBytes: 0,
      totalBytes: 4096,
      checkpoint: null,
    };

    expect(() => evaluateSqliteStorage(snapshot, { maxFreelistRatio: 1.1 })).toThrow("maxFreelistRatio");
    expect(() => inspectSqliteStorage(join(tmpdir(), "does-not-exist-amazon-monitor.sqlite"))).toThrow("does not exist");

    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-empty-storage-"));
    const emptyPath = join(root, "empty.sqlite");
    writeFileSync(emptyPath, "");
    try {
      expect(() => inspectSqliteStorage(emptyPath)).toThrow("is empty");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
