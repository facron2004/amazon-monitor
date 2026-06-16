import { fileURLToPath } from "node:url";
import { loadEnv } from "./notifier.js";

loadEnv();

import { runCategoryCollectionForMonitor } from "./category-pipeline.js";
import { formatDuration, ts } from "./log.js";
import { runCollectionForKeyword } from "./pipeline.js";
import { openAppStore } from "./store.js";

const defaultDbPath = (() => {
  try {
    return fileURLToPath(new URL("../../../data/amazon-monitor.sqlite", import.meta.url));
  } catch {
    return "data/amazon-monitor.sqlite";
  }
})();

const dbPath = process.env.DB_PATH ?? defaultDbPath;
const maxRetries = Number(process.env.AMAZON_COLLECT_MAX_RETRIES ?? 3);
const pollIntervalMs = Number(process.env.AMAZON_COLLECT_POLL_INTERVAL_MS ?? 2000);
const workerConcurrency = Math.max(1, Number(process.env.AMAZON_WORKER_CONCURRENCY ?? 2));

let running = true;

export async function startWorker(storeInstance?: any) {
  const store = storeInstance ?? openAppStore(dbPath);
  console.log(`[${ts()}] [Worker] Started. Polling SQLite queue: ${dbPath} (poll=${pollIntervalMs}ms, maxRetries=${maxRetries}, concurrency=${workerConcurrency})`);

  let jobsProcessed = 0;

  async function workerLane(laneId: number): Promise<void> {
    while (running) {
      try {
        const job = store.claimNextJob();
        if (job) {
          jobsProcessed++;
          const jobStartTime = Date.now();
          console.log(`[${ts()}] [Worker:${laneId}] ▶ Job #${job.id} STARTED | type=${job.taskType}, targetId=${job.targetId}, date=${job.date} | queue_position=${jobsProcessed}`);

          try {
            if (job.taskType === "keyword") {
              await runCollectionForKeyword(store, job.targetId, job.date);
            } else if (job.taskType === "category") {
              await runCategoryCollectionForMonitor(store, job.targetId, job.date);
            } else {
              throw new Error(`Unknown task type: ${job.taskType}`);
            }

            store.completeJob(job.id);
            const elapsed = Date.now() - jobStartTime;
            console.log(`[${ts()}] [Worker:${laneId}] ✓ Job #${job.id} COMPLETED | type=${job.taskType}, targetId=${job.targetId} | duration=${formatDuration(elapsed)}`);
          } catch (error) {
            const elapsed = Date.now() - jobStartTime;
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error(`[${ts()}] [Worker:${laneId}] ✗ Job #${job.id} FAILED | type=${job.taskType}, targetId=${job.targetId} | duration=${formatDuration(elapsed)} | error=${errMsg}`);
            store.failJob(job.id, errMsg, maxRetries);
          }
        }
      } catch (err) {
        console.error(`[${ts()}] [Worker:${laneId}] Poll loop error:`, err);
      }

      if (running) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }
  }

  const lanes = Array.from({ length: workerConcurrency }, (_, i) => workerLane(i + 1));
  await Promise.all(lanes);
}

export async function stopWorker(): Promise<void> {
  running = false;
  console.log(`[${ts()}] [Worker] Shutting down — waiting for active jobs to finish...`);
  // Lanes will exit on next poll iteration when running=false
  console.log(`[${ts()}] [Worker] Stopped.`);
}

// If run directly from CLI
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith("worker.ts") || 
  process.argv[1].endsWith("worker.js") ||
  process.argv[1].includes("/worker") ||
  process.argv[1].includes("\\worker")
);

if (isDirectRun) {
  startWorker().catch((err) => {
    console.error("[Worker] Fatal startup error:", err);
    process.exit(1);
  });
}
