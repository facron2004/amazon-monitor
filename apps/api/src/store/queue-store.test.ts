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
});
