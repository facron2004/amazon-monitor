import type { CollectTaskLog } from "@amazon-monitor/shared";
import { describe, expect, it } from "vitest";
import { openAppStore } from "./store.js";
import { retryDelayMs, retryDelayMsWithJitter, runJobWithTimeout, startWorker, stopWorker } from "./worker.js";

describe("worker job timeout", () => {
  it("prefers Retry-After and otherwise uses bounded exponential backoff", () => {
    expect(retryDelayMs(0)).toBe(1_000);
    expect(retryDelayMs(2)).toBe(4_000);
    expect(retryDelayMs(99)).toBe(5 * 60_000);
    expect(retryDelayMs(0, 12_345)).toBe(12_345);
    expect(retryDelayMs(0, Number.POSITIVE_INFINITY)).toBe(1_000);
  });

  it("adds bounded jitter only when Retry-After is absent", () => {
    expect(retryDelayMsWithJitter(0, undefined, () => 0)).toBe(1_000);
    expect(retryDelayMsWithJitter(0, undefined, () => 0.5)).toBe(1_500);
    expect(retryDelayMsWithJitter(99, undefined, () => 0.9)).toBe(5 * 60_000);
    expect(retryDelayMsWithJitter(0, 12_345, () => 0.9)).toBe(12_345);
  });

  it("aborts the running job and rejects at the deadline", async () => {
    let signal: AbortSignal | undefined;
    const startedAt = Date.now();
    const store = openAppStore(":memory:");
    store.reset();
    const queued = store.pushJob("keyword", 1, "2026-05-17");
    const job = store.claimNextJob("timeout-test-worker", 60_000)!;

    await expect(
      runJobWithTimeout(
        store,
        job,
        20,
        async (_store, _job, options) => {
          signal = options?.signal;
          return new Promise<CollectTaskLog>(() => undefined);
        }
      )
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(signal?.aborted).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(store.getJobStatus(queued.id)?.status).toBe("processing");
  });

  it("stops claiming work, aborts the active runner, and drains on shutdown", async () => {
    const store = openAppStore(":memory:");
    store.reset();
    const first = store.pushJob("keyword", 1, "2026-05-17");
    const second = store.pushJob("keyword", 2, "2026-05-17");
    let runnerSignal: AbortSignal | undefined;
    let signalStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });

    const worker = startWorker(store, {
      workerId: "shutdown-test-worker",
      concurrency: 1,
      pollIntervalMs: 1,
      heartbeatIntervalMs: 5,
      reaperIntervalMs: 5,
      leaseDurationMs: 60_000,
      drainTimeoutMs: 500,
      handleSignals: false,
      runner: async (_store, _job, options) => {
        runnerSignal = options?.signal;
        signalStarted?.();
        return new Promise<CollectTaskLog>(() => undefined);
      }
    });

    await started;
    await stopWorker();
    await worker;

    expect(runnerSignal?.aborted).toBe(true);
    expect(store.getJobStatus(first.id)?.status).toBe("pending");
    expect(store.getJobStatus(second.id)?.status).toBe("pending");
  });

  it("dispatches Agent recovery only after a collection job is completed", async () => {
    const store = openAppStore(":memory:");
    store.reset();
    const queued = store.pushJob("keyword", 1, "2026-05-17");
    let resolveCompleted: ((jobId: number) => void) | undefined;
    const completed = new Promise<number>((resolve) => {
      resolveCompleted = resolve;
    });
    const worker = startWorker(store, {
      workerId: "recovery-dispatch-test-worker",
      concurrency: 1,
      pollIntervalMs: 1,
      heartbeatIntervalMs: 5,
      reaperIntervalMs: 5,
      leaseDurationMs: 60_000,
      handleSignals: false,
      runner: async (_store, job) => ({
        id: 1,
        orgId: job.orgId,
        taskType: job.taskType,
        keywordId: job.targetId,
        keyword: null,
        marketplace: null,
        status: "success",
        startTime: "2026-05-17T00:00:00.000Z",
        endTime: "2026-05-17T00:00:01.000Z",
        pageCount: 1,
        successCount: 1,
        failCount: 0,
        errorMessage: null,
        retryCount: 0,
        createdAt: "2026-05-17T00:00:00.000Z",
      }),
      onJobCompleted: (job) => resolveCompleted?.(job.id),
    });

    expect(await completed).toBe(queued.id);
    expect(store.getJobStatus(queued.id)?.status).toBe("completed");
    await stopWorker();
    await worker;
  });

  it("does not requeue a runner-declared terminal failure", async () => {
    const store = openAppStore(":memory:");
    store.reset();
    const queued = store.pushJob("data_source_sync", 1, "2026-05-17");
    let runnerStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      runnerStarted = resolve;
    });

    const worker = startWorker(store, {
      workerId: "terminal-failure-test-worker",
      concurrency: 1,
      pollIntervalMs: 1,
      heartbeatIntervalMs: 5,
      reaperIntervalMs: 5,
      leaseDurationMs: 60_000,
      maxRetries: 3,
      handleSignals: false,
      runner: async (_store, job) => {
        runnerStarted?.();
        return {
          id: 1,
          orgId: job.orgId,
          taskType: job.taskType,
          keywordId: null,
          keyword: "terminal SP-API failure",
          marketplace: null,
          status: "failed" as const,
          startTime: "2026-05-17T00:00:00.000Z",
          endTime: "2026-05-17T00:00:01.000Z",
          pageCount: 0,
          successCount: 0,
          failCount: 1,
          errorMessage: "SP-API credentials are invalid",
          retryCount: 0,
          createdAt: "2026-05-17T00:00:00.000Z",
          retryable: false
        };
      }
    });

    await started;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (store.getJobStatus(queued.id)?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(store.getJobStatus(queued.id)).toMatchObject({ status: "failed", retryCount: 1 });

    await stopWorker();
    await worker;
  });

  it("persists a transient runner Retry-After on the pending queue job", async () => {
    const store = openAppStore(":memory:");
    store.reset();
    const queued = store.pushJob("data_source_sync", 2, "2026-05-17");
    let runnerCalls = 0;
    let workerPromise: Promise<void> | undefined;
    const started = new Promise<void>((resolve) => {
      const worker = startWorker(store, {
        workerId: "retry-after-test-worker",
        concurrency: 1,
        pollIntervalMs: 1,
        heartbeatIntervalMs: 5,
        reaperIntervalMs: 5,
        leaseDurationMs: 60_000,
        maxRetries: 3,
        handleSignals: false,
        runner: async (_store, job) => {
          runnerCalls += 1;
          resolve();
          return {
            id: 1,
            orgId: job.orgId,
            taskType: job.taskType,
            keywordId: null,
            keyword: "transient SP-API failure",
            marketplace: null,
            status: "failed" as const,
            startTime: "2026-05-17T00:00:00.000Z",
            endTime: "2026-05-17T00:00:01.000Z",
            pageCount: 0,
            successCount: 0,
            failCount: 1,
            errorMessage: "SP-API is rate limited",
            retryCount: job.retryCount,
            createdAt: "2026-05-17T00:00:00.000Z",
            retryable: true,
            retryAfterMs: 30_000
          };
        }
      });
      workerPromise = worker;
      void worker.catch(() => undefined);
    });

    await started;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (store.getJobStatus(queued.id)?.status === "pending") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(store.getJobStatus(queued.id)).toMatchObject({
      status: "pending",
      retryCount: 1,
      nextAttemptAt: expect.any(String)
    });
    expect(runnerCalls).toBe(1);
    await stopWorker();
    await workerPromise!;
  });
});
