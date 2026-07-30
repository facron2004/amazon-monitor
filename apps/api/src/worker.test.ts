import type { CollectTaskLog } from "@amazon-monitor/shared";
import { describe, expect, it } from "vitest";
import { openAppStore } from "./store.js";
import { runJobWithTimeout, startWorker, stopWorker } from "./worker.js";

describe("worker job timeout", () => {
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
});
