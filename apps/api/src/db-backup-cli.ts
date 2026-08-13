import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { loadEnv } from "./notifications/env.js";
import {
  backupSqliteDatabaseFile,
  pruneSqliteBackups,
  verifySqliteBackupRestore,
} from "./store/db-backup.js";

loadEnv();

const defaultDbPath = (() => {
  try {
    return fileURLToPath(new URL("../../../data/amazon-monitor.sqlite", import.meta.url));
  } catch {
    return "data/amazon-monitor.sqlite";
  }
})();

const sourcePath = resolve(process.env.DB_PATH ?? defaultDbPath);

function defaultTargetPath(): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return join(dirname(sourcePath), "backups", `amazon-monitor-${timestamp}.sqlite`);
}

interface BackupOptions {
  outputPath: string;
  keep?: number;
  verifyRestore: boolean;
}

function parseOptions(args: string[]): BackupOptions {
  let outputPath: string | undefined;
  let keep: number | undefined;
  let verifyRestore = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--output") {
      const output = args[index + 1]?.trim();
      if (!output || output.startsWith("--")) {
        throw new Error("Usage: npm run backup:db -- [--output <path>] [--keep <count>] [--verify-restore]");
      }
      outputPath = resolve(output);
      index += 1;
      continue;
    }
    if (argument === "--keep") {
      const rawKeep = args[index + 1]?.trim();
      const parsedKeep = Number(rawKeep);
      if (!rawKeep || !Number.isInteger(parsedKeep) || parsedKeep < 1) {
        throw new Error("Usage: npm run backup:db -- [--output <path>] [--keep <count>] [--verify-restore]");
      }
      keep = parsedKeep;
      index += 1;
      continue;
    }
    if (argument === "--verify-restore") {
      verifyRestore = true;
      continue;
    }
    throw new Error("Usage: npm run backup:db -- [--output <path>] [--keep <count>] [--verify-restore]");
  }
  return { outputPath: outputPath ?? defaultTargetPath(), keep, verifyRestore };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const targetPath = options.outputPath;
  if (!existsSync(sourcePath)) {
    throw new Error(`SQLite source database does not exist: ${sourcePath}`);
  }
  const result = await backupSqliteDatabaseFile(sourcePath, targetPath);
  const verification = options.verifyRestore
    ? await verifySqliteBackupRestore(targetPath)
    : undefined;
  const retention = options.keep === undefined
    ? undefined
    : pruneSqliteBackups(dirname(targetPath), options.keep);
  console.log(JSON.stringify({
    ok: true,
    ...result,
    ...(verification ? { restoreVerification: verification } : {}),
    ...(retention ? { retention } : {}),
  }));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
