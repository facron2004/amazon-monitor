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

  it("deduplicates jobs within an organization without merging organizations", () => {
    const secondOrganization = store.createOrganization({ name: "Second queue organization" });
    const first = store.pushJob("keyword", 42, "2026-06-11", 1);
    const duplicate = store.pushJob("keyword", 42, "2026-06-11", 1);
    const secondOrg = store.pushJob("keyword", 42, "2026-06-11", secondOrganization.id);

    expect(duplicate.id).toBe(first.id);
    expect(secondOrg.id).not.toBe(first.id);
    expect(store.listJobs(50, 0, 1)).toEqual([expect.objectContaining({ id: first.id, orgId: 1 })]);
    expect(store.listJobs(50, 0, secondOrganization.id)).toEqual([
      expect.objectContaining({ id: secondOrg.id, orgId: secondOrganization.id })
    ]);
  });

  it("claims jobs in order and locks them in processing status", () => {
    const job1 = store.pushJob("keyword", 101, "2026-06-11");
    const job2 = store.pushJob("keyword", 102, "2026-06-11");

    const claimed1 = store.claimNextJob("test-worker", 60_000);
    expect(claimed1).not.toBeNull();
    expect(claimed1?.id).toBe(job1.id);
    expect(claimed1?.status).toBe("processing");
    expect(claimed1?.startedAt).not.toBeNull();

    const claimed2 = store.claimNextJob("test-worker", 60_000);
    expect(claimed2?.id).toBe(job2.id);

    const claimed3 = store.claimNextJob("test-worker", 60_000);
    expect(claimed3).toBeNull();
  });

  it("completes jobs successfully", () => {
    const job = store.pushJob("category", 10, "2026-06-11");
    const claimed = store.claimNextJob("test-worker", 60_000)!;
    
    store.completeJob(claimed.id, claimed.leaseOwner, claimed.leaseToken);
    const finished = store.getJobStatus(job.id)!;
    expect(finished.status).toBe("completed");
    expect(finished.completedAt).not.toBeNull();
  });

  it("handles job failures and retries appropriately", () => {
    const job = store.pushJob("keyword", 99, "2026-06-11");
    const claimed = store.claimNextJob("test-worker", 60_000)!;

    // Max retries = 2. First failure -> should retry (goes back to pending, increments retry_count)
    store.failJob(claimed.id, claimed.leaseOwner, claimed.leaseToken, "Attempt 1 failed", 2);

    const status1 = store.getJobStatus(job.id)!;
    expect(status1.status).toBe("pending");
    expect(status1.retryCount).toBe(1);
    expect(status1.errorMessage).toBe("Attempt 1 failed");
    expect(status1.startedAt).toBeNull();

    // Claim again
    const claimedAgain = store.claimNextJob("test-worker", 60_000)!;
    expect(claimedAgain.id).toBe(job.id);
    expect(claimedAgain.retryCount).toBe(1);

    // Second failure -> reaches max retries, should set status to failed
    store.failJob(claimedAgain.id, claimedAgain.leaseOwner, claimedAgain.leaseToken, "Attempt 2 failed", 2);

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
        expect(entry.dataSource).toBeNull();
        expect(entry.lastSyncedAt).toBeNull();
        expect(entry.syncStatus).toBeNull();
        expect(entry.syncError).toBeNull();
        expect(entry.totalJobs).toBe(0);
        expect(entry.failedJobs).toBe(0);
      }
    });

    it("aggregates latest completion and counts per task type", () => {
      // Two completed keyword jobs. lastCompletedAt should reflect the
      // most recent completion timestamp on disk.
      store.pushJob("keyword", 1, "2026-06-01");
      const firstClaim = store.claimNextJob("test-worker", 60_000)!;
      store.completeJob(firstClaim.id, firstClaim.leaseOwner, firstClaim.leaseToken);
      store.pushJob("keyword", 2, "2026-06-02");
      const secondClaim = store.claimNextJob("test-worker", 60_000)!;
      store.completeJob(secondClaim.id, secondClaim.leaseOwner, secondClaim.leaseToken);

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
      expect(kw).toMatchObject({
        dataSource: "amazon_playwright",
        lastSyncedAt: stored,
        syncStatus: "success",
        syncError: null
      });
      expect(kw.totalJobs).toBe(2);
      expect(kw.failedJobs).toBe(0);

      expect(cat.lastStatus).toBe("pending");
      expect(cat.lastCompletedAt).toBeNull();
      expect(cat.syncStatus).toBe("pending");
      expect(cat.totalJobs).toBe(1);
    });

    it("counts failed jobs separately", () => {
      const job = store.pushJob("keyword", 1, "2026-06-01");
      const claimed = store.claimNextJob("test-worker", 60_000)!;
      store.failJob(claimed.id, claimed.leaseOwner, claimed.leaseToken, "boom", 1); // maxRetries=1 → immediate failed

      const result = store.getCollectionFreshness();
      const kw = result.find((r) => r.taskType === "keyword")!;
      expect(kw.failedJobs).toBe(1);
      expect(kw.totalJobs).toBe(1);
      expect(kw.lastStatus).toBe("failed");
      expect(kw.syncStatus).toBe("failed");
      expect(kw.syncError).toBe("boom");
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
      const completeClaim = store.claimNextJob("test-worker", 60_000)!;
      store.completeJob(completeClaim.id, completeClaim.leaseOwner, completeClaim.leaseToken);
      // b: fail immediately (maxRetries=1)
      const failedClaim = store.claimNextJob("test-worker", 60_000)!;
      store.failJob(failedClaim.id, failedClaim.leaseOwner, failedClaim.leaseToken, "boom", 1);
      // c: claimed (processing) — DON'T complete; should remain processing.
      const cClaim = store.claimNextJob("test-worker", 60_000);
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

  describe("lease recovery", () => {
    it("returns an empty list when nothing is stuck", () => {
      expect(store.recoverStuckJobs("reason")).toEqual([]);
    });

    it("recovers expired leases so another worker can resume", async () => {
      const a = store.pushJob("keyword", 1, "2026-06-01");
      const b = store.pushJob("category", 1, "2026-06-01");

      // a is claimed → processing
      store.claimNextJob("test-worker", 1);
      // b is claimed → processing
      store.claimNextJob("test-worker", 1);

      expect(store.getJobStatus(a.id)!.status).toBe("processing");
      expect(store.getJobStatus(b.id)!.status).toBe("processing");

      await new Promise((resolve) => setTimeout(resolve, 5));
      const recovered = store.recoverExpiredJobLeases(1);
      expect(recovered.sort()).toEqual([a.id, b.id].sort());

      const aAfter = store.getJobStatus(a.id)!;
      const bAfter = store.getJobStatus(b.id)!;
      expect(aAfter.status).toBe("failed");
      expect(aAfter.errorMessage).toBe("任务租约已过期，已自动回收");
      expect(aAfter.completedAt).not.toBeNull();
      expect(bAfter.status).toBe("failed");
      expect(bAfter.errorMessage).toBe("任务租约已过期，已自动回收");
    });

    it("does not touch already completed or failed jobs", () => {
      const a = store.pushJob("keyword", 1, "2026-06-01");
      const completedClaim = store.claimNextJob("test-worker", 60_000)!;
      store.completeJob(completedClaim.id, completedClaim.leaseOwner, completedClaim.leaseToken);
      const completedError = store.getJobStatus(a.id)!.errorMessage;
      const completedAt = store.getJobStatus(a.id)!.completedAt;

      // a stays 'completed', nothing stuck.
      expect(store.recoverExpiredJobLeases(1)).toEqual([]);
      const after = store.getJobStatus(a.id)!;
      expect(after.status).toBe("completed");
      expect(after.errorMessage).toBe(completedError);
      expect(after.completedAt).toBe(completedAt);
    });

    it("prevents an expired lease holder from completing a re-claimed job", async () => {
      const job = store.pushJob("keyword", 1, "2026-06-01");
      const firstLease = store.claimNextJob("first-worker", 1)!;

      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(store.recoverExpiredJobLeases(2)).toEqual([job.id]);

      const secondLease = store.claimNextJob("second-worker", 60_000)!;
      expect(secondLease.id).toBe(job.id);
      expect(secondLease.leaseToken).not.toBe(firstLease.leaseToken);
      expect(store.completeJob(firstLease.id, firstLease.leaseOwner, firstLease.leaseToken)).toBe(false);
      expect(store.completeJob(secondLease.id, secondLease.leaseOwner, secondLease.leaseToken)).toBe(true);
      expect(store.getJobStatus(job.id)?.status).toBe("completed");
    });

    it("renews an active lease before it expires", async () => {
      const job = store.pushJob("keyword", 1, "2026-06-01");
      const lease = store.claimNextJob("test-worker", 100)!;

      expect(store.renewJobLease(job.id, lease.leaseOwner, lease.leaseToken, 60_000)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(store.recoverExpiredJobLeases(1)).toEqual([]);
      expect(store.isJobLeaseActive(job.id, lease.leaseOwner, lease.leaseToken)).toBe(true);
    });
  });
});
