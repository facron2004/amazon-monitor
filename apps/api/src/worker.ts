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
import { runSpApiSyncJob } from "./services/sp-api-sync-runner.js";
import { openAppStore, type ClaimedCollectJob, type Store } from "./store.js";
import type { CollectJobResult } from "./worker-types.js";

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
const leaseDurationMs = intEnv("AMAZON_WORKER_LEASE_MS", 60_000, heartbeatIntervalMs * 2, 30 * 60 * 1000);
const drainTimeoutMs = intEnv("AMAZON_WORKER_DRAIN_TIMEOUT_MS", 30_000, 1000, 5 * 60 * 1000);
const verboseLog = process.env.AMAZON_WORKER_VERBOSE_LOG !== "false";
const RETRY_BACKOFF_BASE_MS = 1_000;
const RETRY_BACKOFF_MAX_MS = 5 * 60_000;
const RETRY_AFTER_MAX_MS = 60 * 60_000;

export type CollectJobRunner = (store: Store, job: ClaimedCollectJob, options?: { signal?: AbortSignal }) => Promise<CollectJobResult>;

export interface WorkerStartOptions {
  workerId?: string;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  reaperIntervalMs?: number;
  leaseDurationMs?: number;
  jobTimeoutMs?: number;
  maxRetries?: number;
  drainTimeoutMs?: number;
  concurrency?: number;
  runner?: CollectJobRunner;
  handleSignals?: boolean;
  onJobCompleted?: (job: ClaimedCollectJob) => void | Promise<void>;
}

interface ActiveJob {
  job: ClaimedCollectJob;
  startedAt: number;
  controller: AbortController;
}

interface WorkerRuntime {
  acceptingJobs: boolean;
  shutdownController: AbortController;
  activeJobs: Map<number, ActiveJob>;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  reaperTimer: ReturnType<typeof setInterval> | null;
  lanesDone: Promise<void> | null;
  drainTimeoutMs: number;
  stopPromise: Promise<void> | null;
}

let activeWorker: WorkerRuntime | null = null;

export async function startWorker(storeInstance?: Store, overrides: WorkerStartOptions = {}): Promise<void> {
  if (activeWorker) {
    throw new Error("Worker is already running");
  }

  const store = storeInstance ?? openAppStore(dbPath);
  const runtime: WorkerRuntime = {
    acceptingJobs: true,
    shutdownController: new AbortController(),
    activeJobs: new Map(),
    heartbeatTimer: null,
    reaperTimer: null,
    lanesDone: null,
    drainTimeoutMs: overrides.drainTimeoutMs ?? drainTimeoutMs,
    stopPromise: null
  };
  activeWorker = runtime;

  const configuredPollIntervalMs = overrides.pollIntervalMs ?? pollIntervalMs;
  const configuredHeartbeatIntervalMs = overrides.heartbeatIntervalMs ?? heartbeatIntervalMs;
  const configuredReaperIntervalMs = overrides.reaperIntervalMs ?? reaperIntervalMs;
  const configuredLeaseDurationMs = overrides.leaseDurationMs ?? leaseDurationMs;
  const configuredJobTimeoutMs = overrides.jobTimeoutMs ?? jobTimeoutMs;
  const configuredMaxRetries = overrides.maxRetries ?? maxRetries;
  const configuredConcurrency = overrides.concurrency ?? workerConcurrency;
  const runner = overrides.runner ?? runCollectJob;
  const workerId = overrides.workerId ?? randomUUID();
  const workerStartedAt = new Date().toISOString();
  const signalHandler = () => {
    void stopWorker();
  };
  const handleSignals = overrides.handleSignals ?? true;
  if (handleSignals) {
    process.once("SIGTERM", signalHandler);
    process.once("SIGINT", signalHandler);
  }

  console.log(`[${ts()}] [Worker:${workerId}] Started. Polling SQLite queue: ${dbPath} (poll=${configuredPollIntervalMs}ms, maxRetries=${configuredMaxRetries}, concurrency=${configuredConcurrency}, jobTimeout=${formatDuration(configuredJobTimeoutMs)}, lease=${formatDuration(configuredLeaseDurationMs)}, reaper=${formatDuration(configuredReaperIntervalMs)})`);

  // Recover jobs that the previous Worker left in 'processing' state. Without
  // this, those rows would sit forever — `claimNextJob` only reads 'pending',
  // so no lane would ever pick them up. Mark them failed with an explicit
  // reason so operators can spot recovery events in the job history.
  try {
    const legacyRecovered = store.recoverStuckJobs("Worker 升级前没有租约的任务被回收");
    const expiredRecovered = store.recoverExpiredJobLeases(configuredMaxRetries);
    const recovered = [...legacyRecovered, ...expiredRecovered];
    if (recovered.length > 0) {
      console.log(`[${ts()}] [Worker:${workerId}] Recovered ${recovered.length} unavailable lease(s): #${recovered.join(", #")}`);
    }
  } catch (err) {
    console.error(`[${ts()}] [Worker:${workerId}] lease recovery failed:`, err);
  }

  let jobsProcessed = 0;
  // Shared across all lanes so the periodic heartbeat can describe every
  // lane in one log line. Reset to null when the lane is between jobs.
  // Most recent job status observed by any lane — surfaced via the API
  // heartbeat so the UI can show "last job failed" alongside the green dot.
  let lastJob: { id: number; status: "pending" | "processing" | "completed" | "failed" } | null = null;

  function writeHeartbeat(): void {
    for (const [laneId, active] of runtime.activeJobs) {
      const renewed = store.renewJobLease(
        active.job.id,
        active.job.leaseOwner,
        active.job.leaseToken,
        configuredLeaseDurationMs
      );
      if (!renewed) {
        active.controller.abort();
        console.error(`[${ts()}] [Worker:${workerId}:${laneId}] Lost lease for job #${active.job.id} (${leaseTokenSummary(active.job.leaseToken)}); aborting stale runner.`);
      }
    }
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
      console.error(`[${ts()}] [Worker:${workerId}] recordWorkerHeartbeat failed:`, err);
    }
    logHeartbeatIfVerbose(runtime.activeJobs);
  }

  writeHeartbeat();
  runtime.heartbeatTimer = setInterval(writeHeartbeat, configuredHeartbeatIntervalMs);

  /**
   * Runtime reaper only recovers expired leases. An active worker renews its
   * lease with every heartbeat, so another worker can never reclaim an
   * in-flight job merely because it started later.
   */
  function reapExpiredLeases(): void {
    try {
      const ids = store.recoverExpiredJobLeases(configuredMaxRetries);
      if (ids.length > 0) {
        console.log(`[${ts()}] [Worker:${workerId}:reaper] Recovered ${ids.length} expired lease(s): #${ids.join(", #")}`);
      }
    } catch (err) {
      console.error(`[${ts()}] [Worker:${workerId}:reaper] Error:`, err);
    }
  }
  runtime.reaperTimer = setInterval(reapExpiredLeases, configuredReaperIntervalMs);

  async function workerLane(laneId: number): Promise<void> {
    while (runtime.acceptingJobs) {
      try {
        const job = store.claimNextJob(workerId, configuredLeaseDurationMs);
        if (job) {
          jobsProcessed++;
          const jobStartTime = Date.now();
          const controller = new AbortController();
          runtime.activeJobs.set(laneId, { job, startedAt: jobStartTime, controller });
          lastJob = { id: job.id, status: "processing" };
          console.log(`[${ts()}] [Worker:${workerId}:${laneId}] ▶ Job #${job.id} STARTED | type=${job.taskType}, targetId=${job.targetId}, date=${job.date}, lease=${leaseTokenSummary(job.leaseToken)} | queue_position=${jobsProcessed}`);

          let jobMaxRetries = configuredMaxRetries;
          let retryAfterMs: number | undefined;
          try {
            const log = await runJobWithTimeout(store, job, configuredJobTimeoutMs, runner, controller.signal);
            if (log.status === "failed") {
              jobMaxRetries = log.retryable === false ? 1 : configuredMaxRetries;
              retryAfterMs = log.retryAfterMs;
              throw new Error(log.errorMessage ?? "Collection failed");
            }

            if (!store.completeJob(job.id, job.leaseOwner, job.leaseToken)) {
              throw new DOMException("Collection job lease was lost before completion", "AbortError");
            }
            const elapsed = Date.now() - jobStartTime;
            lastJob = { id: job.id, status: "completed" };
            try {
              await overrides.onJobCompleted?.(job);
            } catch (recoveryError) {
              console.error(
                `[${ts()}] [Worker:${workerId}:${laneId}] Agent recovery dispatch failed for job #${job.id}:`,
                recoveryError instanceof Error ? recoveryError.message : "unknown error",
              );
            }
            console.log(`[${ts()}] [Worker:${workerId}:${laneId}] ✓ Job #${job.id} COMPLETED | type=${job.taskType}, targetId=${job.targetId} | duration=${formatDuration(elapsed)}`);
          } catch (error) {
            const elapsed = Date.now() - jobStartTime;
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error(`[${ts()}] [Worker:${workerId}:${laneId}] ✗ Job #${job.id} FAILED | type=${job.taskType}, targetId=${job.targetId} | duration=${formatDuration(elapsed)} | error=${errMsg}`);
            if (!store.failJob(job.id, job.leaseOwner, job.leaseToken, errMsg, jobMaxRetries, retryDelayMsWithJitter(job.retryCount, retryAfterMs))) {
              console.warn(`[${ts()}] [Worker:${workerId}:${laneId}] Job #${job.id} failure was not recorded because its lease is no longer active.`);
            }
            lastJob = { id: job.id, status: "failed" };
          } finally {
            runtime.activeJobs.delete(laneId);
          }
        }
      } catch (err) {
        console.error(`[${ts()}] [Worker:${laneId}] Poll loop error:`, err);
      }

      if (runtime.acceptingJobs) {
        await waitForPoll(configuredPollIntervalMs, runtime.shutdownController.signal);
      }
    }
  }

  const lanes = Array.from({ length: configuredConcurrency }, (_, i) => workerLane(i + 1));
  runtime.lanesDone = Promise.all(lanes).then(() => undefined);
  try {
    await runtime.lanesDone;
  } finally {
    clearWorkerTimers(runtime);
    if (handleSignals) {
      process.removeListener("SIGTERM", signalHandler);
      process.removeListener("SIGINT", signalHandler);
    }
    if (activeWorker === runtime) {
      activeWorker = null;
    }
  }
}

/**
 * Run a single collect job with a wall-clock deadline. When the deadline is
 * reached we abort via AbortController so the pipeline can check
 * signal.aborted and shut down cleanly — preventing zombie writes after
 * the job has been marked failed.
 */
export async function runJobWithTimeout(
  store: Store,
  job: ClaimedCollectJob,
  timeoutMs: number,
  runner: CollectJobRunner = runCollectJob,
  shutdownSignal?: AbortSignal
): Promise<CollectJobResult> {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const cleanup = { removeShutdownListener: undefined as (() => void) | undefined };
  const abortPromises: Promise<never>[] = [];

  if (timeoutMs > 0) {
    abortPromises.push(new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new DOMException(`Collect job timed out after ${formatDuration(timeoutMs)}`, "AbortError"));
      }, timeoutMs);
    }));
  }

  if (shutdownSignal) {
    abortPromises.push(new Promise<never>((_resolve, reject) => {
      const abortForShutdown = () => {
        controller.abort();
        reject(new DOMException("Collect job aborted during worker shutdown", "AbortError"));
      };
      if (shutdownSignal.aborted) {
        abortForShutdown();
        return;
      }
      shutdownSignal.addEventListener("abort", abortForShutdown, { once: true });
      cleanup.removeShutdownListener = () => shutdownSignal.removeEventListener("abort", abortForShutdown);
    }));
  }

  try {
    return await Promise.race([runner(store, job, { signal: controller.signal }), ...abortPromises]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    cleanup.removeShutdownListener?.();
  }
}

export function retryDelayMs(retryCount: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs)) {
    return Math.max(0, Math.min(Math.floor(retryAfterMs), RETRY_AFTER_MAX_MS));
  }
  const exponent = Math.min(Math.max(Math.floor(retryCount), 0), 10);
  return Math.min(RETRY_BACKOFF_BASE_MS * (2 ** exponent), RETRY_BACKOFF_MAX_MS);
}

export function retryDelayMsWithJitter(
  retryCount: number,
  retryAfterMs?: number,
  random = Math.random
): number {
  const baseDelayMs = retryDelayMs(retryCount, retryAfterMs);
  if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs)) return baseDelayMs;
  const sampled = random();
  const randomValue = Number.isFinite(sampled) ? Math.max(0, Math.min(sampled, 0.999999)) : 0;
  return Math.min(baseDelayMs + Math.floor(baseDelayMs * randomValue), RETRY_BACKOFF_MAX_MS);
}

async function runCollectJob(store: Store, job: ClaimedCollectJob, options?: { signal?: AbortSignal }): Promise<CollectTaskLog> {
  const ensureLeaseActive = () => {
    if (options?.signal?.aborted || !store.isJobLeaseActive(job.id, job.leaseOwner, job.leaseToken)) {
      throw new DOMException("Collection job lease is no longer active", "AbortError");
    }
  };
  ensureLeaseActive();

  if (job.taskType === "keyword") {
    return runCollectionForKeyword(store, job.targetId, job.date, { signal: options?.signal, ensureActive: ensureLeaseActive });
  }
  if (job.taskType === "category") {
    return runCategoryCollectionForMonitor(store, job.targetId, job.date, {
      signal: options?.signal,
      organizationId: job.orgId,
      ensureActive: ensureLeaseActive
    });
  }
  if (job.taskType === "data_source_sync") {
    return runSpApiSyncJob(store, job, { signal: options?.signal });
  }
  throw new Error(`Unknown task type: ${job.taskType}`);
}

function logHeartbeatIfVerbose(activeJobs: Map<number, ActiveJob>): void {
  if (!verboseLog) return;
  const now = Date.now();
  if (activeJobs.size === 0) {
    console.log(`[${ts()}] [Worker:heartbeat] all lanes idle`);
    return;
  }
  const lanes = Array.from(activeJobs.entries())
    .sort(([a], [b]) => a - b)
    .map(([laneId, info]) => `lane${laneId}=${info.job.taskType}#${info.job.targetId}@${formatDuration(now - info.startedAt)}`)
    .join(" | ");
  console.log(`[${ts()}] [Worker:heartbeat] ${lanes}`);
}

export async function stopWorker(): Promise<void> {
  const runtime = activeWorker;
  if (!runtime) return;
  if (runtime.stopPromise) return runtime.stopPromise;

  runtime.acceptingJobs = false;
  runtime.shutdownController.abort();
  if (runtime.reaperTimer) {
    clearInterval(runtime.reaperTimer);
    runtime.reaperTimer = null;
  }
  for (const active of runtime.activeJobs.values()) {
    active.controller.abort();
  }

  console.log(`[${ts()}] [Worker] Shutting down — stopped claiming work and aborting ${runtime.activeJobs.size} active job(s).`);
  runtime.stopPromise = waitForDrain(runtime.lanesDone, runtime.drainTimeoutMs).then((drained) => {
    if (drained) {
      console.log(`[${ts()}] [Worker] Stopped after draining active jobs.`);
    } else {
      console.warn(`[${ts()}] [Worker] Drain timed out; remaining job leases will be recovered after expiry.`);
    }
  });
  return runtime.stopPromise;
}

function clearWorkerTimers(runtime: WorkerRuntime): void {
  if (runtime.heartbeatTimer) {
    clearInterval(runtime.heartbeatTimer);
    runtime.heartbeatTimer = null;
  }
  if (runtime.reaperTimer) {
    clearInterval(runtime.reaperTimer);
    runtime.reaperTimer = null;
  }
}

function leaseTokenSummary(token: string): string {
  return token.slice(0, 8);
}

function waitForPoll(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || delayMs <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(done, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      done();
    };
    function done() {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForDrain(lanesDone: Promise<void> | null, timeoutMs: number): Promise<boolean> {
  if (!lanesDone) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    lanesDone.then(() => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

// If run directly from CLI
const workerEntryName = process.argv[1] ? basename(process.argv[1]) : "";
const isDirectRun = workerEntryName === "worker.ts" || workerEntryName === "worker.js";

if (isDirectRun) {
  const exitOnSignal = () => {
    void stopWorker().then(() => process.exit(0));
  };
  process.once("SIGTERM", exitOnSignal);
  process.once("SIGINT", exitOnSignal);
  startWorker(undefined, { handleSignals: false }).catch((err) => {
    console.error("[Worker] Fatal startup error:", err);
    process.exit(1);
  });
}
