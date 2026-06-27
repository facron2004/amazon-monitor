import { fileURLToPath } from "node:url";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnv } from "./notifier.js";

loadEnv();

import type { CollectTaskLog } from "@amazon-monitor/shared";
import { runCategoryCollectionForMonitor } from "./category-pipeline.js";
import { formatDuration, ts } from "./log.js";
import { runCollectionForKeyword } from "./pipeline.js";
import { openAppStore } from "./store.js";

const appVersion = (() => {
  try {
    // Worker lives at `apps/api/src/worker.ts` in dev and
    // `apps/api/dist/worker.js` in prod. `../package.json` resolves to the
    // API package's manifest in both cases, while `../../package.json`
    // would point at the non-existent `apps/package.json`. We resolve
    // relative to `import.meta.url` so it works from both layouts.
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "..", "package.json"), "utf-8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
})();

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
const jobTimeoutMs = Math.max(0, Number(process.env.AMAZON_WORKER_JOB_TIMEOUT_MS ?? 10 * 60 * 1000));
const heartbeatIntervalMs = Math.max(1000, Number(process.env.AMAZON_WORKER_HEARTBEAT_MS ?? 5000));
const verboseLog = process.env.AMAZON_WORKER_VERBOSE_LOG !== "false";

let running = true;

export async function startWorker(storeInstance?: any) {
  const store = storeInstance ?? openAppStore(dbPath);
  console.log(`[${ts()}] [Worker] Started. Polling SQLite queue: ${dbPath} (poll=${pollIntervalMs}ms, maxRetries=${maxRetries}, concurrency=${workerConcurrency}, jobTimeout=${formatDuration(jobTimeoutMs)})`);

  // Recover jobs that the previous Worker left in 'processing' state. Without
  // this, those rows would sit forever — `claimNextJob` only reads 'pending',
  // so no lane would ever pick them up. Mark them failed with an explicit
  // reason so operators can spot recovery events in the job history.
  try {
    const recovered = store.recoverStuckJobs("Worker 进程重启，上一次未完成的任务被回收");
    if (recovered.length > 0) {
      console.log(`[${ts()}] [Worker] Recovered ${recovered.length} stuck job(s): #${recovered.join(", #")}`);
    }
  } catch (err) {
    console.error(`[${ts()}] [Worker] recoverStuckJobs failed:`, err);
  }

  // Stable per-process identity — used as the PK in amazon_worker_heartbeat
  // so restarts surface as a new "online" entry instead of overwriting in a
  // confusing way. Captured once at startup.
  const workerId = randomUUID();
  const workerStartedAt = new Date().toISOString();

  let jobsProcessed = 0;
  // Shared across all lanes so the periodic heartbeat can describe every
  // lane in one log line. Reset to null when the lane is between jobs.
  const activeJobs = new Map<number, { taskType: string; targetId: number; startedAt: number }>();
  // Most recent job status observed by any lane — surfaced via the API
  // heartbeat so the UI can show "last job failed" alongside the green dot.
  let lastJob: { id: number; status: "pending" | "processing" | "completed" | "failed" } | null = null;
  let lastHeartbeatAt = Date.now();

  async function workerLane(laneId: number): Promise<void> {
    while (running) {
      try {
        const job = store.claimNextJob();
        if (job) {
          jobsProcessed++;
          const jobStartTime = Date.now();
          activeJobs.set(laneId, { taskType: job.taskType, targetId: job.targetId, startedAt: jobStartTime });
          lastJob = { id: job.id, status: "processing" };
          console.log(`[${ts()}] [Worker:${laneId}] ▶ Job #${job.id} STARTED | type=${job.taskType}, targetId=${job.targetId}, date=${job.date} | queue_position=${jobsProcessed}`);

          try {
            const log = await runJobWithTimeout(store, job, jobTimeoutMs);
            if (log.status === "failed") {
              throw new Error(log.errorMessage ?? "Collection failed");
            }

            store.completeJob(job.id);
            const elapsed = Date.now() - jobStartTime;
            lastJob = { id: job.id, status: "completed" };
            console.log(`[${ts()}] [Worker:${laneId}] ✓ Job #${job.id} COMPLETED | type=${job.taskType}, targetId=${job.targetId} | duration=${formatDuration(elapsed)}`);
          } catch (error) {
            const elapsed = Date.now() - jobStartTime;
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error(`[${ts()}] [Worker:${laneId}] ✗ Job #${job.id} FAILED | type=${job.taskType}, targetId=${job.targetId} | duration=${formatDuration(elapsed)} | error=${errMsg}`);
            store.failJob(job.id, errMsg, maxRetries);
            lastJob = { id: job.id, status: "failed" };
          } finally {
            activeJobs.delete(laneId);
          }
        }
      } catch (err) {
        console.error(`[${ts()}] [Worker:${laneId}] Poll loop error:`, err);
      }

      if (running) {
        // Always refresh the API-visible heart-beat on every iteration so the
        // topbar can detect a dead Worker promptly (default poll = 2s).
        try {
          store.recordWorkerHeartbeat({
            workerId,
            pid: process.pid,
            host: hostname(),
            startedAt: workerStartedAt,
            version: appVersion,
            lastJobId: lastJob?.id ?? null,
            lastStatus: lastJob?.status ?? null
          });
        } catch (err) {
          console.error(`[${ts()}] [Worker:${laneId}] recordWorkerHeartbeat failed:`, err);
        }

        await maybeHeartbeat(activeJobs, heartbeatIntervalMs, lastHeartbeatAt, (stamp) => {
          lastHeartbeatAt = stamp;
        });
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }
  }

  const lanes = Array.from({ length: workerConcurrency }, (_, i) => workerLane(i + 1));
  await Promise.all(lanes);
}

/**
 * Run a single collect job with a wall-clock deadline. When the deadline is
 * reached we reject with a timeout error so the caller's catch block can
 * route the job through `failJob` like any other failure — Playwright's
 * in-flight `page.goto / waitForLoadState` is left to its own internal
 * timeouts (we don't try to abort the browser here; closing the browser
 * without coordination can corrupt in-memory caches).
 */
async function runJobWithTimeout(store: any, job: { taskType: "keyword" | "category"; targetId: number; date: string }, timeoutMs: number): Promise<CollectTaskLog> {
  if (timeoutMs <= 0) {
    return runCollectJob(store, job);
  }

  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Collect job exceeded timeout of ${formatDuration(timeoutMs)}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([runCollectJob(store, job), timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function runCollectJob(store: any, job: { taskType: "keyword" | "category"; targetId: number; date: string }): Promise<CollectTaskLog> {
  if (job.taskType === "keyword") {
    return runCollectionForKeyword(store, job.targetId, job.date);
  }
  if (job.taskType === "category") {
    return runCategoryCollectionForMonitor(store, job.targetId, job.date);
  }
  throw new Error(`Unknown task type: ${job.taskType}`);
}

async function maybeHeartbeat(
  activeJobs: Map<number, { taskType: string; targetId: number; startedAt: number }>,
  intervalMs: number,
  lastHeartbeatAt: number,
  setLast: (stamp: number) => void
): Promise<void> {
  if (!verboseLog) return;
  const now = Date.now();
  if (now - lastHeartbeatAt < intervalMs) return;
  setLast(now);

  if (activeJobs.size === 0) {
    console.log(`[${ts()}] [Worker:heartbeat] all lanes idle`);
    return;
  }

  const lanes = Array.from(activeJobs.entries())
    .sort(([a], [b]) => a - b)
    .map(([laneId, info]) => `lane${laneId}=${info.taskType}#${info.targetId}@${formatDuration(now - info.startedAt)}`)
    .join(" | ");
  console.log(`[${ts()}] [Worker:heartbeat] ${lanes}`);
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
