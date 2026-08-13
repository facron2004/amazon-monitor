import { DatabaseSync } from "node:sqlite";
import {
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  backupSqliteDatabaseFile,
  verifySqliteBackupRestore,
  verifySqliteDatabaseFile,
} from "./store/db-backup.js";

interface BackupDrillResult {
  ok: true;
  sourcePath: string;
  backupPath: string;
  backupBytes: number;
  restoredBytes: number;
  tableCount: number;
  sourceMarker: string;
  backupMarker: string;
  sidecarsAbsent: boolean;
}

async function run(): Promise<BackupDrillResult> {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "amazon-monitor-db-backup-drill-"));
  const sourcePath = join(temporaryRoot, "source.sqlite");
  const backupPath = join(temporaryRoot, "backups", "amazon-monitor-drill.sqlite");
  const markerValue = "release-backup-drill";
  const source = new DatabaseSync(sourcePath);
  let sourceClosed = false;
  try {
    source.exec("PRAGMA journal_mode = WAL; CREATE TABLE backup_drill_marker (value TEXT NOT NULL);");
    source.prepare("INSERT INTO backup_drill_marker (value) VALUES (?)").run(markerValue);
    const backup = await backupSqliteDatabaseFile(sourcePath, backupPath);
    const sidecarsAbsent = !existsSync(`${backupPath}-wal`) && !existsSync(`${backupPath}-shm`);
    const sourceMarker = (source.prepare(
      "SELECT value FROM backup_drill_marker LIMIT 1",
    ).get() as { value?: string } | undefined)?.value;
    source.close();
    sourceClosed = true;

    const backupVerification = verifySqliteDatabaseFile(backupPath);
    const backupDatabase = new DatabaseSync(backupPath, { readOnly: true });
    const backupMarker = (backupDatabase.prepare(
      "SELECT value FROM backup_drill_marker LIMIT 1",
    ).get() as { value?: string } | undefined)?.value;
    backupDatabase.close();

    const restore = await verifySqliteBackupRestore(backupPath);
    if (
      sourceMarker !== markerValue
      || backupMarker !== markerValue
      || backupVerification.tableCount !== 1
      || restore.tableCount !== 1
      || !sidecarsAbsent
    ) {
      throw new Error(JSON.stringify({
        sourceMarker,
        backupMarker,
        backupTableCount: backupVerification.tableCount,
        restoredTableCount: restore.tableCount,
        sidecarsAbsent,
      }));
    }
    return {
      ok: true,
      sourcePath,
      backupPath,
      backupBytes: backup.bytes,
      restoredBytes: restore.restoredBytes,
      tableCount: restore.tableCount,
      sourceMarker: sourceMarker ?? "",
      backupMarker: backupMarker ?? "",
      sidecarsAbsent,
    };
  } finally {
    if (!sourceClosed) source.close();
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

run()
  .then((result) => {
    console.log(JSON.stringify(result));
  })
  .catch((error: unknown) => {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  });
