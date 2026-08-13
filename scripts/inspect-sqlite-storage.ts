import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  evaluateSqliteStorage,
  inspectSqliteStorage,
  type SqliteCheckpointMode,
  type SqliteStorageThresholds,
} from "../apps/api/src/store/sqlite-storage.js";

interface CliOptions {
  databasePath: string;
  checkpoint: SqliteCheckpointMode;
  thresholds: SqliteStorageThresholds;
}

function parseArgs(argv: string[]): CliOptions {
  let databasePath: string | undefined;
  let checkpoint: SqliteCheckpointMode = "none";
  let requireWal = false;
  let maxWalBytes: number | undefined;
  let maxTotalBytes: number | undefined;
  let maxFreelistRatio: number | undefined;

  for (const argument of argv) {
    if (argument === "--require-wal") {
      requireWal = true;
    } else if (argument.startsWith("--checkpoint=")) {
      const value = argument.slice("--checkpoint=".length);
      if (value !== "none" && value !== "passive" && value !== "truncate") {
        throw new Error("--checkpoint must be none, passive, or truncate");
      }
      checkpoint = value;
    } else if (argument.startsWith("--max-wal-mb=")) {
      maxWalBytes = parseMegabytes(argument, "--max-wal-mb=");
    } else if (argument.startsWith("--max-total-mb=")) {
      maxTotalBytes = parseMegabytes(argument, "--max-total-mb=");
    } else if (argument.startsWith("--max-freelist-ratio=")) {
      maxFreelistRatio = parseRatio(argument.slice("--max-freelist-ratio=".length));
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (!databasePath) {
      databasePath = argument;
    } else {
      throw new Error("Only one SQLite database path may be provided");
    }
  }

  return {
    databasePath: databasePath ?? process.env.DB_PATH ?? "data/amazon-monitor.sqlite",
    checkpoint,
    thresholds: {
      requireWal,
      maxWalBytes,
      maxTotalBytes,
      maxFreelistRatio,
    },
  };
}

function parseMegabytes(argument: string, prefix: string): number {
  const value = Number(argument.slice(prefix.length));
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${prefix.slice(0, -1)} must be a non-negative number`);
  }
  return Math.floor(value * 1024 * 1024);
}

function parseRatio(value: string): number {
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new Error("--max-freelist-ratio must be between 0 and 1");
  }
  return ratio;
}

function usage(): string {
  return [
    "Usage: npm run inspect:db-storage -- <database.sqlite> [options]",
    "Options:",
    "  --require-wal                 fail when journal_mode is not WAL",
    "  --checkpoint=passive          collect a passive checkpoint snapshot",
    "  --checkpoint=truncate         checkpoint and truncate the WAL sidecar",
    "  --max-wal-mb=N                fail when WAL bytes exceed N MiB",
    "  --max-total-mb=N              fail when database + WAL + SHM exceed N MiB",
    "  --max-freelist-ratio=N        fail when freelist/page_count exceeds N",
  ].join("\n");
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    const snapshot = inspectSqliteStorage(resolve(options.databasePath), {
      checkpoint: options.checkpoint,
    });
    const health = evaluateSqliteStorage(snapshot, options.thresholds);
    console.log(JSON.stringify({ snapshot, health }, null, 2));
    if (!health.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), usage: usage() }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
