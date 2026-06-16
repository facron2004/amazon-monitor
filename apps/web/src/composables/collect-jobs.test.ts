import { describe, expect, it, vi } from "vitest";
import type { CollectJob } from "@amazon-monitor/shared";
import { waitForCollectJobs } from "./collect-jobs";

function buildJob(overrides: Partial<CollectJob> = {}): CollectJob {
  return {
    id: 1,
    taskType: "category",
    targetId: 1,
    date: "2026-06-13",
    status: "pending",
    createdAt: "2026-06-13T09:27:05.219Z",
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    retryCount: 0,
    ...overrides
  };
}

describe("waitForCollectJobs", () => {
  it("waits until the queued job completes", async () => {
    const getJobStatus = vi
      .fn<(_: number) => Promise<CollectJob | null>>()
      .mockResolvedValueOnce(buildJob({ status: "processing", startedAt: "2026-06-13T09:27:06.613Z" }))
      .mockResolvedValueOnce(
        buildJob({
          status: "completed",
          startedAt: "2026-06-13T09:27:06.613Z",
          completedAt: "2026-06-13T09:29:06.613Z"
        })
      );

    const sleep = vi.fn(async () => undefined);

    const [job] = await waitForCollectJobs([buildJob()], {
      getJobStatus,
      sleep,
      timeoutMs: 10_000
    });

    expect(job.status).toBe("completed");
    expect(getJobStatus).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("surfaces the backend failure message", async () => {
    const getJobStatus = vi
      .fn<(_: number) => Promise<CollectJob | null>>()
      .mockResolvedValueOnce(
        buildJob({
          status: "failed",
          errorMessage: "page.goto: net::ERR_NETWORK_ACCESS_DENIED"
        })
      );

    await expect(
      waitForCollectJobs([buildJob()], {
        getJobStatus,
        timeoutMs: 10_000
      })
    ).rejects.toThrow("page.goto: net::ERR_NETWORK_ACCESS_DENIED");
  });
});
