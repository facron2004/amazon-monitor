import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseShadowEvidenceConfig } from "./sp-api-shadow-evidence-config.js";
import { runShadowPreflight } from "./verify-sp-api-shadow-preflight.js";
import type { ShadowPreflightOptions } from "./verify-sp-api-shadow-preflight-types.js";

interface CliOptions {
  configPath: string | undefined;
  productionDatabasePath: string | undefined;
  backupPath: string | undefined;
  shadowUserDataPath: string | undefined;
  productionUserDataPath: string | undefined;
  runtimeDatabasePath: string | undefined;
  requireWal: boolean | undefined;
  storageThresholds: ShadowPreflightOptions["storageThresholds"];
}

function parseArgs(argv: string[]): CliOptions {
  let configPath: string | undefined;
  let productionDatabasePath: string | undefined;
  let backupPath: string | undefined;
  let shadowUserDataPath: string | undefined;
  let productionUserDataPath: string | undefined;
  let runtimeDatabasePath: string | undefined;
  let requireWal: boolean | undefined;
  let maxWalBytes: number | undefined;
  let maxTotalBytes: number | undefined;
  let maxFreelistRatio: number | undefined;
  for (const argument of argv) {
    if (argument.startsWith("--production-db=")) productionDatabasePath = argument.slice("--production-db=".length);
    else if (argument.startsWith("--backup=")) backupPath = argument.slice("--backup=".length);
    else if (argument.startsWith("--user-data=")) shadowUserDataPath = argument.slice("--user-data=".length);
    else if (argument.startsWith("--production-user-data=")) productionUserDataPath = argument.slice("--production-user-data=".length);
    else if (argument.startsWith("--runtime-db=")) runtimeDatabasePath = argument.slice("--runtime-db=".length);
    else if (argument === "--require-wal") requireWal = true;
    else if (argument.startsWith("--max-wal-mb=")) maxWalBytes = parseMegabytes(argument, "--max-wal-mb=");
    else if (argument.startsWith("--max-total-mb=")) maxTotalBytes = parseMegabytes(argument, "--max-total-mb=");
    else if (argument.startsWith("--max-freelist-ratio=")) maxFreelistRatio = parseRatio(argument.slice("--max-freelist-ratio=".length));
    else if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    else if (!configPath) configPath = argument;
    else throw new Error("Only one preflight config path may be provided");
  }
  return {
    configPath,
    productionDatabasePath,
    backupPath,
    shadowUserDataPath,
    productionUserDataPath,
    runtimeDatabasePath,
    requireWal,
    storageThresholds: {
      ...(maxWalBytes === undefined ? {} : { maxWalBytes }),
      ...(maxTotalBytes === undefined ? {} : { maxTotalBytes }),
      ...(maxFreelistRatio === undefined ? {} : { maxFreelistRatio }),
    },
  };
}

function parseMegabytes(argument: string, prefix: string): number {
  const value = Number(argument.slice(prefix.length));
  if (!Number.isFinite(value) || value < 0) throw new Error(`${prefix.slice(0, -1)} must be a non-negative number`);
  return Math.floor(value * 1024 * 1024);
}

function parseRatio(value: string): number {
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) throw new Error("--max-freelist-ratio must be between 0 and 1");
  return ratio;
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (!options.configPath) {
      throw new Error("Usage: npm run verify:sp-api-shadow-preflight -- <config.json> --production-db=<production-db-path> --backup=<backup-path> --user-data=<shadow-userData> --production-user-data=<production-userData> [--runtime-db=<shadow-db-path>] [--require-wal] [--max-wal-mb=N] [--max-total-mb=N] [--max-freelist-ratio=N]");
    }
    const configPath = resolve(options.configPath);
    const rawConfig = JSON.parse(await readFile(configPath, "utf8")) as unknown;
    const config = parseShadowEvidenceConfig(rawConfig, dirname(configPath));
    const result = runShadowPreflight(config, {
      productionDatabasePath: options.productionDatabasePath,
      backupPath: options.backupPath,
      shadowUserDataPath: options.shadowUserDataPath,
      productionUserDataPath: options.productionUserDataPath,
      runtimeDatabasePath: options.runtimeDatabasePath,
      requireWal: options.requireWal,
      storageThresholds: options.storageThresholds,
      requireBackup: true,
      requireUserDataIsolation: true,
      requireRuntimeDatabaseBinding: true,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
