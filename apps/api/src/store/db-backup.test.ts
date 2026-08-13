import {
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  backupSqliteDatabaseFile,
  pruneSqliteBackups,
  verifySqliteBackupRestore,
  type SqliteBackupResult,
} from "./db-backup.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  temporaryRoots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true }));
});

describe("backupSqliteDatabaseFile", () => {
  it("creates an integrity-checked snapshot from a live WAL database", async () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-db-backup-"));
    temporaryRoots.push(root);
    const sourcePath = join(root, "source.sqlite");
    const targetPath = join(root, "backups", "snapshot.sqlite");
    const source = new DatabaseSync(sourcePath);
    source.exec("PRAGMA journal_mode = WAL; CREATE TABLE marker (value TEXT NOT NULL);");
    source.prepare("INSERT INTO marker (value) VALUES (?)").run("live-wal");

    let result: SqliteBackupResult;
    try {
      result = await backupSqliteDatabaseFile(sourcePath, targetPath);
    } finally {
      source.close();
    }

    expect(existsSync(`${targetPath}-wal`)).toBe(false);
    expect(existsSync(`${targetPath}-shm`)).toBe(false);
    const backup = new DatabaseSync(targetPath, { readOnly: true });
    const marker = backup.prepare("SELECT value FROM marker").get() as { value?: string };
    backup.close();

    expect(result.targetPath).toBe(targetPath);
    expect(result.bytes).toBeGreaterThan(0);
    expect(marker.value).toBe("live-wal");
  });

  it("does not overwrite an existing target", async () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-db-backup-"));
    temporaryRoots.push(root);
    const sourcePath = join(root, "source.sqlite");
    const targetPath = join(root, "snapshot.sqlite");
    const source = new DatabaseSync(sourcePath);
    source.exec("CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker VALUES ('source');");
    source.close();
    const existing = new DatabaseSync(targetPath);
    existing.exec("CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker VALUES ('existing');");
    existing.close();

    await expect(backupSqliteDatabaseFile(sourcePath, targetPath)).rejects.toThrow("already exists");

    const preserved = new DatabaseSync(targetPath, { readOnly: true });
    const marker = preserved.prepare("SELECT value FROM marker").get() as { value?: string };
    preserved.close();
    expect(marker.value).toBe("existing");
  });

  it("rejects a missing source database", async () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-db-backup-"));
    temporaryRoots.push(root);

    await expect(
      backupSqliteDatabaseFile(join(root, "missing.sqlite"), join(root, "snapshot.sqlite")),
    ).rejects.toThrow("does not exist");
  });

  it("verifies that a backup can be restored into an isolated database", async () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-db-backup-"));
    temporaryRoots.push(root);
    const sourcePath = join(root, "source.sqlite");
    const backupPath = join(root, "snapshot.sqlite");
    const source = new DatabaseSync(sourcePath);
    source.exec("CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker VALUES ('restore-me');");
    source.close();

    await backupSqliteDatabaseFile(sourcePath, backupPath);
    const verification = await verifySqliteBackupRestore(backupPath);

    expect(verification.sourcePath).toBe(backupPath);
    expect(verification.restoredBytes).toBeGreaterThan(0);
    expect(verification.tableCount).toBe(1);
    expect(existsSync(sourcePath)).toBe(true);
    expect(statSync(backupPath).size).toBeGreaterThan(0);
  });

  it("prunes only timestamped backups beyond the explicit keep count", () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-db-backup-"));
    temporaryRoots.push(root);
    const oldest = join(root, "amazon-monitor-20260807.sqlite");
    const middle = join(root, "amazon-monitor-20260808.sqlite");
    const newest = join(root, "amazon-monitor-20260809.sqlite");
    for (const path of [oldest, middle, newest]) writeFileSync(path, "snapshot");
    utimesSync(oldest, new Date(1_000), new Date(1_000));
    utimesSync(middle, new Date(2_000), new Date(2_000));
    utimesSync(newest, new Date(3_000), new Date(3_000));

    const result = pruneSqliteBackups(root, 2);

    expect(result.candidates).toBe(3);
    expect(result.removed).toEqual([oldest]);
    expect(existsSync(oldest)).toBe(false);
    expect(existsSync(middle)).toBe(true);
    expect(existsSync(newest)).toBe(true);
  });

  it("rejects an unsafe zero backup retention count", () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-db-backup-"));
    temporaryRoots.push(root);
    expect(() => pruneSqliteBackups(root, 0)).toThrow("positive integer");
  });
});
