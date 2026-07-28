import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { collectApi } from "../api-collect";
import { useCollectorsStore } from "./collectors";

describe("useCollectorsStore log pagination", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    vi.spyOn(collectApi, "listJobs").mockResolvedValue([]);
    vi.spyOn(collectApi, "fetchFreshness").mockResolvedValue([]);
    vi.spyOn(collectApi, "fetchQueueStats").mockResolvedValue({
      pendingCount: 0,
      processingCount: 0,
      completedRecentCount: 0,
      failedRecentCount: 0,
      oldestPendingAgeMs: 0
    });
    vi.spyOn(collectApi, "fetchWorkerStatus").mockResolvedValue({
      alive: false,
      stale: false,
      offline: true,
      ageMs: null,
      workerId: null,
      pid: null,
      host: null,
      startedAt: null,
      lastBeatAt: null,
      version: null,
      lastJobId: null,
      lastStatus: null
    });
  });

  it("keeps log totals from the center response", async () => {
    vi.spyOn(collectApi, "listLogsPage").mockResolvedValue({
      logs: [],
      total: 293,
      limit: 50,
      offset: 0
    });
    const store = useCollectorsStore();

    await store.fetchCenter();

    expect(store.logsTotal).toBe(293);
    expect(store.logsCurrentPage).toBe(1);
    expect(store.logsPageCount).toBe(6);
  });

  it("changes only the log page with a clamped offset", async () => {
    const listLogsPage = vi.spyOn(collectApi, "listLogsPage").mockResolvedValue({
      logs: [],
      total: 293,
      limit: 50,
      offset: 0
    });
    const store = useCollectorsStore();
    await store.fetchCenter();
    listLogsPage.mockResolvedValue({
      logs: [],
      total: 293,
      limit: 50,
      offset: 250
    });

    await store.goToLogsPage(99);

    expect(listLogsPage).toHaveBeenLastCalledWith(50, 250);
    expect(store.logsCurrentPage).toBe(6);
    expect(collectApi.listJobs).toHaveBeenCalledTimes(1);
  });
});
