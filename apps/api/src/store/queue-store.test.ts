import { describe, expect, it, beforeEach } from "vitest";
import { openAppStore } from "../store.js";

describe("QueueStore", () => {
  let store: ReturnType<typeof openAppStore>;

  beforeEach(() => {
    // Open in-memory sqlite db for isolation
    store = openAppStore(":memory:");
    store.reset();
  });

  it("can push jobs and query status", () => {
    const job = store.pushJob("keyword", 42, "2026-06-11");
    expect(job).toMatchObject({
      taskType: "keyword",
      targetId: 42,
      date: "2026-06-11",
      status: "pending",
      retryCount: 0
    });

    const status = store.getJobStatus(job.id);
    expect(status).toMatchObject(job);
  });

  it("does not insert duplicate pending jobs", () => {
    const job1 = store.pushJob("keyword", 42, "2026-06-11");
    const job2 = store.pushJob("keyword", 42, "2026-06-11");

    expect(job1.id).toBe(job2.id);
    
    const list = store.listJobs();
    expect(list.length).toBe(1);
  });

  it("claims jobs in order and locks them in processing status", () => {
    const job1 = store.pushJob("keyword", 101, "2026-06-11");
    const job2 = store.pushJob("keyword", 102, "2026-06-11");

    const claimed1 = store.claimNextJob();
    expect(claimed1).not.toBeNull();
    expect(claimed1?.id).toBe(job1.id);
    expect(claimed1?.status).toBe("processing");
    expect(claimed1?.startedAt).not.toBeNull();

    const claimed2 = store.claimNextJob();
    expect(claimed2?.id).toBe(job2.id);

    const claimed3 = store.claimNextJob();
    expect(claimed3).toBeNull();
  });

  it("completes jobs successfully", () => {
    const job = store.pushJob("category", 10, "2026-06-11");
    const claimed = store.claimNextJob()!;
    
    store.completeJob(claimed.id);
    const finished = store.getJobStatus(job.id)!;
    expect(finished.status).toBe("completed");
    expect(finished.completedAt).not.toBeNull();
  });

  it("handles job failures and retries appropriately", () => {
    const job = store.pushJob("keyword", 99, "2026-06-11");
    const claimed = store.claimNextJob()!;

    // Max retries = 2. First failure -> should retry (goes back to pending, increments retry_count)
    store.failJob(claimed.id, "Attempt 1 failed", 2);

    const status1 = store.getJobStatus(job.id)!;
    expect(status1.status).toBe("pending");
    expect(status1.retryCount).toBe(1);
    expect(status1.errorMessage).toBe("Attempt 1 failed");
    expect(status1.startedAt).toBeNull();

    // Claim again
    const claimedAgain = store.claimNextJob()!;
    expect(claimedAgain.id).toBe(job.id);
    expect(claimedAgain.retryCount).toBe(1);

    // Second failure -> reaches max retries, should set status to failed
    store.failJob(claimedAgain.id, "Attempt 2 failed", 2);

    const status2 = store.getJobStatus(job.id)!;
    expect(status2.status).toBe("failed");
    expect(status2.retryCount).toBe(2);
    expect(status2.errorMessage).toBe("Attempt 2 failed");
    expect(status2.completedAt).not.toBeNull();
  });

  describe("getCollectionFreshness", () => {
    it("returns empty entries for both task types when queue is empty", () => {
      const result = store.getCollectionFreshness();
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.taskType).sort()).toEqual(["category", "keyword"]);
      for (const entry of result) {
        expect(entry.lastCompletedAt).toBeNull();
        expect(entry.lastStartedAt).toBeNull();
        expect(entry.lastStatus).toBeNull();
        expect(entry.totalJobs).toBe(0);
        expect(entry.failedJobs).toBe(0);
      }
    });

    it("aggregates latest completion and counts per task type", () => {
      // Two completed keyword jobs. lastCompletedAt should reflect the
      // most recent completion timestamp on disk.
      store.pushJob("keyword", 1, "2026-06-01");
      store.claimNextJob();
      store.completeJob(1);
      store.pushJob("keyword", 2, "2026-06-02");
      store.claimNextJob();
      store.completeJob(2);

      // One pending category job
      store.pushJob("category", 9, "2026-06-01");

      const result = store.getCollectionFreshness();
      const kw = result.find((r) => r.taskType === "keyword")!;
      const cat = result.find((r) => r.taskType === "category")!;

      expect(kw.lastStatus).toBe("completed");
      expect(kw.lastCompletedAt).not.toBeNull();
      // The reported completion must match the actual stored timestamp.
      const stored = store.getJobStatus(2)!.completedAt!;
      expect(kw.lastCompletedAt).toBe(stored);
      expect(kw.totalJobs).toBe(2);
      expect(kw.failedJobs).toBe(0);

      expect(cat.lastStatus).toBe("pending");
      expect(cat.lastCompletedAt).toBeNull();
      expect(cat.totalJobs).toBe(1);
    });

    it("counts failed jobs separately", () => {
      const job = store.pushJob("keyword", 1, "2026-06-01");
      const claimed = store.claimNextJob()!;
      store.failJob(claimed.id, "boom", 1); // maxRetries=1 → immediate failed

      const result = store.getCollectionFreshness();
      const kw = result.find((r) => r.taskType === "keyword")!;
      expect(kw.failedJobs).toBe(1);
      expect(kw.totalJobs).toBe(1);
      expect(kw.lastStatus).toBe("failed");
      // The first (newest in scan order) row dictates lastStatus
      expect(job.status).toBeDefined();
    });

    it("returns entries sorted by taskType alphabetically", () => {
      store.pushJob("keyword", 1, "2026-06-01");
      store.pushJob("category", 1, "2026-06-01");
      const result = store.getCollectionFreshness();
      expect(result.map((r) => r.taskType)).toEqual(["category", "keyword"]);
    });
  });

  describe("getQueueStats", () => {
    it("returns zero counts when the queue is empty", () => {
      const stats = store.getQueueStats();
      expect(stats).toEqual({
        pendingCount: 0,
        processingCount: 0,
        completedRecentCount: 0,
        failedRecentCount: 0,
        oldestPendingAgeMs: 0
      });
    });

    it("counts pending/processing/completed/failed jobs", () => {
      const a = store.pushJob("keyword", 1, "2026-06-01");
      const b = store.pushJob("category", 1, "2026-06-01");
      const c = store.pushJob("keyword", 2, "2026-06-01");
      const d = store.pushJob("category", 2, "2026-06-01");

      // a: complete
      store.claimNextJob();
      store.completeJob(a.id);
      // b: fail immediately (maxRetries=1)
      store.claimNextJob();
      store.failJob(b.id, "boom", 1);
      // c: claimed (processing) — DON'T complete; should remain processing.
      const cClaim = store.claimNextJob();
      expect(cClaim?.id).toBe(c.id);
      // d: still pending.

      const stats = store.getQueueStats();
      // Sanity-check the underlying state too.
      expect(store.getJobStatus(a.id)!.status).toBe("completed");
      expect(store.getJobStatus(b.id)!.status).toBe("failed");
      expect(store.getJobStatus(c.id)!.status).toBe("processing");
      expect(store.getJobStatus(d.id)!.status).toBe("pending");

      expect(stats.pendingCount).toBe(1);
      expect(stats.processingCount).toBe(1);
      expect(stats.completedRecentCount).toBe(1);
      expect(stats.failedRecentCount).toBe(1);
      expect(stats.oldestPendingAgeMs).toBeGreaterThanOrEqual(0);
    });

    it("reports the age of the oldest pending job", async () => {
      store.pushJob("keyword", 1, "2026-06-01");
      // Simulate a job that has been waiting a while.
      await new Promise((resolve) => setTimeout(resolve, 25));
      const stats = store.getQueueStats();
      expect(stats.oldestPendingAgeMs).toBeGreaterThanOrEqual(20);
    });
  });

  describe("recoverStuckJobs", () => {
    it("returns an empty list when nothing is stuck", () => {
      expect(store.recoverStuckJobs("reason")).toEqual([]);
    });

    it("marks 'processing' rows as 'failed' so a new worker can resume", () => {
      const a = store.pushJob("keyword", 1, "2026-06-01");
      const b = store.pushJob("category", 1, "2026-06-01");

      // a is claimed → processing
      store.claimNextJob();
      // b is claimed → processing
      store.claimNextJob();

      expect(store.getJobStatus(a.id)!.status).toBe("processing");
      expect(store.getJobStatus(b.id)!.status).toBe("processing");

      const recovered = store.recoverStuckJobs("worker restarted");
      expect(recovered.sort()).toEqual([a.id, b.id].sort());

      const aAfter = store.getJobStatus(a.id)!;
      const bAfter = store.getJobStatus(b.id)!;
      expect(aAfter.status).toBe("failed");
      expect(aAfter.errorMessage).toBe("worker restarted");
      expect(aAfter.completedAt).not.toBeNull();
      expect(bAfter.status).toBe("failed");
      expect(bAfter.errorMessage).toBe("worker restarted");
    });

    it("does not touch already completed or failed jobs", () => {
      const a = store.pushJob("keyword", 1, "2026-06-01");
      store.claimNextJob();
      store.completeJob(a.id);
      const completedError = store.getJobStatus(a.id)!.errorMessage;
      const completedAt = store.getJobStatus(a.id)!.completedAt;

      // a stays 'completed', nothing stuck.
      expect(store.recoverStuckJobs("worker restarted")).toEqual([]);
      const after = store.getJobStatus(a.id)!;
      expect(after.status).toBe("completed");
      expect(after.errorMessage).toBe(completedError);
      expect(after.completedAt).toBe(completedAt);
    });
  });
});
