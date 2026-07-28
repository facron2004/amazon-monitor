import { fileURLToPath } from "node:url";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { loadEnv } from "./notifier.js";

loadEnv();

import type { CollectTaskLog } from "@amazon-monitor/shared";
import { intEnv } from "./amazon/config.js";
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
const maxRetries = intEnv("AMAZON_COLLECT_MAX_RETRIES", 3, 0, 10);
const pollIntervalMs = intEnv("AMAZON_COLLECT_POLL_INTERVAL_MS", 2000, 100, 60000);
const workerConcurrency = intEnv("AMAZON_WORKER_CONCURRENCY", 2, 1, 10);
const jobTimeoutMs = intEnv("AMAZON_WORKER_JOB_TIMEOUT_MS", 10 * 60 * 1000, 0, 60 * 60 * 1000);
const heartbeatIntervalMs = intEnv("AMAZON_WORKER_HEARTBEAT_MS", 5000, 1000, 60000);
const reaperIntervalMs = intEnv("AMAZON_WORKER_REAPER_INTERVAL_MS", 30000, 5000, 300000);
const staleJobThresholdMs = intEnv("AMAZON_WORKER_STALE_JOB_THRESHOLD_MS", 15 * 60 * 1000, 60000, 30 * 60 * 1000);
const verboseLog = process.env.AMAZON_WORKER_VERBOSE_LOG !== "false";

let running = true;

type CollectJobRef = { orgId?: number; taskType: "keyword" | "category"; targetId: number; date: string };
type CollectJobRunner = (store: any, job: CollectJobRef, options?: { signal?: AbortSignal }) => Promise<CollectTaskLog>;

export async function startWorker(storeInstance?: any) {
  const store = storeInstance ?? openAppStore(dbPath);
  console.log(`[${ts()}] [Worker] Started. Polling SQLite queue: ${dbPath} (poll=${pollIntervalMs}ms, maxRetries=${maxRetries}, concurrency=${workerConcurrency}, jobTimeout=${formatDuration(jobTimeoutMs)}, staleReaper=${formatDuration(staleJobThresholdMs)} every ${reaperIntervalMs}ms)`);

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

  function writeHeartbeat(): void {
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
      console.error(`[${ts()}] [Worker] recordWorkerHeartbeat failed:`, err);
    }
    logHeartbeatIfVerbose(activeJobs);
  }

  writeHeartbeat();
  const heartbeatTimer = setInterval(writeHeartbeat, heartbeatIntervalMs);

  /**
   * Runtime reaper: periodically recovers jobs stuck in 'processing' beyond
   * the stale threshold. This prevents jobs from being stuck forever when a
   * lane hangs on a non-abortable operation (e.g. Playwright browser hang).
   * Without this, stuck jobs would only be recovered on worker restart.
   */
  function reapStaleJobs(): void {
    try {
      const ids = store.recoverStaleProcessingJobs(staleJobThresholdMs, maxRetries);
      if (ids.length > 0) {
        console.log(`[${ts()}] [Worker:reaper] Recovered ${ids.length} stale job(s): #${ids.join(", #")}`);
      }
    } catch (err) {
      console.error(`[${ts()}] [Worker:reaper] Error:`, err);
    }
  }
  const reaperTimer = setInterval(reapStaleJobs, reaperIntervalMs);

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
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }
  }

  const lanes = Array.from({ length: workerConcurrency }, (_, i) => workerLane(i + 1));
  try {
    await Promise.all(lanes);
  } finally {
    clearInterval(heartbeatTimer);
    clearInterval(reaperTimer);
  }
}

/**
 * Run a single collect job with a wall-clock deadline. When the deadline is
 * reached we abort via AbortController so the pipeline can check
 * signal.aborted and shut down cleanly — preventing zombie writes after
 * the job has been marked failed.
 */
export async function runJobWithTimeout(
  store: any,
  job: CollectJobRef,
  timeoutMs: number,
  runner: CollectJobRunner = runCollectJob
): Promise<CollectTaskLog> {
  if (timeoutMs <= 0) {
    return runner(store, job);
  }

  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new DOMException(`Collect job timed out after ${formatDuration(timeoutMs)}`, "AbortError"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      runner(store, job, { signal: controller.signal }),
      timeoutPromise
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function runCollectJob(store: ReturnType<typeof openAppStore>, job: CollectJobRef, options?: { signal?: AbortSignal }): Promise<CollectTaskLog> {
  if (options?.signal?.aborted) {
    throw new Error(`Collect job aborted before start (timeout of ${formatDuration(jobTimeoutMs)})`);
  }

  if (job.taskType === "keyword") {
    return runCollectionForKeyword(store, job.targetId, job.date, { signal: options?.signal });
  }
  if (job.taskType === "category") {
    return runCategoryCollectionForMonitor(store, job.targetId, job.date, {
      signal: options?.signal,
      organizationId: job.orgId ?? 1
    });
  }
  throw new Error(`Unknown task type: ${job.taskType}`);
}

function logHeartbeatIfVerbose(activeJobs: Map<number, { taskType: string; targetId: number; startedAt: number }>): void {
  if (!verboseLog) return;
  const now = Date.now();
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
const workerEntryName = process.argv[1] ? basename(process.argv[1]) : "";
const isDirectRun = workerEntryName === "worker.ts" || workerEntryName === "worker.js";

if (isDirectRun) {
  startWorker().catch((err) => {
    console.error("[Worker] Fatal startup error:", err);
    process.exit(1);
  });
}
