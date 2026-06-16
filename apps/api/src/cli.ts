import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { runCategoryCollectionForAll } from "./category-pipeline.js";
import { loadEnv } from "./notifier.js";
import { runCollectionForAll } from "./pipeline.js";
import { formatCategorySnapshotQualityAudits, listCategorySnapshotQualityAudits } from "./quality-audit.js";
import { openAppStore } from "./store.js";

loadEnv();

const defaultDbPath = (() => {
  try {
    return fileURLToPath(new URL("../../../data/amazon-monitor.sqlite", import.meta.url));
  } catch {
    return "data/amazon-monitor.sqlite";
  }
})();

const dbPath = process.env.DB_PATH ?? defaultDbPath;
const store = openAppStore(dbPath);

async function main() {
  const command = process.argv[2] || "collect";

  console.log("\nAmazon Monitor CLI\n");

  try {
    switch (command) {
      case "collect":
        console.log("Collecting keyword and category data...\n");
        await runAll();
        break;

      case "keyword":
        console.log("Collecting keyword data...\n");
        await runKeywords();
        break;

      case "category":
        console.log("Collecting category data...\n");
        await runCategories();
        break;

      case "quality":
        console.log("Inspecting category snapshot quality...\n");
        await runQuality(process.argv[3]);
        break;

      default:
        showHelp();
        process.exit(1);
    }

    console.log("\nCollection finished.\n");
    process.exit(0);
  } catch (error) {
    console.error("\nCommand failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function runAll() {
  const startTime = Date.now();
  const [keywordLogs, categoryLogs] = await Promise.all([
    runCollectionForAll(store),
    runCategoryCollectionForAll(store)
  ]);

  const keywordSuccess = keywordLogs.filter((log) => log.status === "success").length;
  const keywordFailed = keywordLogs.filter((log) => log.status === "failed").length;
  const categorySuccess = categoryLogs.filter((log) => log.status === "success").length;
  const categoryFailed = categoryLogs.filter((log) => log.status === "failed").length;
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\nCollection summary:");
  console.log(`  Keywords: success=${keywordSuccess} failed=${keywordFailed}`);
  console.log(`  Categories: success=${categorySuccess} failed=${categoryFailed}`);
  console.log(`  Duration: ${duration}s`);

  printFailureHint(keywordFailed + categoryFailed);
}

async function runKeywords() {
  const startTime = Date.now();
  const logs = await runCollectionForAll(store);
  const success = logs.filter((log) => log.status === "success").length;
  const failed = logs.filter((log) => log.status === "failed").length;
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\nCollection summary:");
  console.log(`  Success: ${success}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Duration: ${duration}s`);

  printFailureHint(failed);
  printFailureDetails(logs);
}

async function runCategories() {
  const startTime = Date.now();
  const logs = await runCategoryCollectionForAll(store);
  const success = logs.filter((log) => log.status === "success").length;
  const failed = logs.filter((log) => log.status === "failed").length;
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\nCollection summary:");
  console.log(`  Success: ${success}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Duration: ${duration}s`);

  printFailureHint(failed);
  printFailureDetails(logs);
}

async function runQuality(snapshotDate?: string) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const audits = listCategorySnapshotQualityAudits(db, snapshotDate);
    console.log(formatCategorySnapshotQualityAudits(audits));
  } finally {
    db.close();
  }
}

function printFailureHint(failedCount: number) {
  if (failedCount <= 0) {
    return;
  }
  console.log("\nSome collections failed. Check data/collector-screenshots/ for evidence.");
}

function printFailureDetails(logs: Array<{ status: string; errorMessage?: string | null }>) {
  const failedLogs = logs.filter((log) => log.status === "failed");
  if (failedLogs.length === 0 || failedLogs.length > 5) {
    return;
  }

  console.log("\nFailure details:");
  for (const log of failedLogs) {
    console.log(`  - ${log.errorMessage || "Unknown error"}`);
  }
}

function showHelp() {
  console.log(`
Usage: npm run collect [command] [args]

Commands:
  collect           Collect keyword and category data (default)
  keyword           Collect keyword data only
  category          Collect category data only
  quality [date]    Inspect category snapshot quality for the latest or specified date

Examples:
  npm run collect
  npm run collect:keyword
  npm run collect:category
  npm run collect quality
  npm run collect quality 2026-06-12
`);
}

main();
