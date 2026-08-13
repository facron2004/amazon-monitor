import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { verifySqliteBackupRestore } from "./store/db-backup.js";

function parseInput(args: string[]): string {
  if (args.length !== 2 || args[0] !== "--input" || !args[1]?.trim() || args[1].startsWith("--")) {
    throw new Error("Usage: npm run verify:db-backup -- --input <backup-path>");
  }
  return resolve(args[1]);
}

async function main(): Promise<void> {
  const inputPath = parseInput(process.argv.slice(2));
  if (!existsSync(inputPath)) {
    throw new Error(`SQLite backup does not exist: ${inputPath}`);
  }
  const result = await verifySqliteBackupRestore(inputPath);
  console.log(JSON.stringify({ ok: true, ...result }));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
