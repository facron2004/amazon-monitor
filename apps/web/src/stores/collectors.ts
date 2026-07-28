import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  CollectJob,
  CollectTaskLog,
  CollectionFreshness,
  QueueStats,
  WorkerStatus
} from "@amazon-monitor/shared";
import { collectApi, type CollectorRunPayload } from "../api-collect";

export type CollectorJobStatusFilter = CollectJob["status"] | "all";
export type CollectorTaskTypeFilter = CollectJob["taskType"] | "all";
export type CollectorJobSort = "newest" | "oldest" | "failures";

export const useCollectorsStore = defineStore("collectors", () => {
  const jobs = ref<CollectJob[]>([]);
  const logs = ref<CollectTaskLog[]>([]);
  const logsTotal = ref(0);
  const logsLimit = ref(50);
  const logsOffset = ref(0);
  const freshness = ref<CollectionFreshness[]>([]);
  const queueStats = ref<QueueStats | null>(null);
  const workerStatus = ref<WorkerStatus | null>(null);
  const taskTypeFilter = ref<CollectorTaskTypeFilter>("all");
  const statusFilter = ref<CollectorJobStatusFilter>("all");
  const sort = ref<CollectorJobSort>("newest");
  const query = ref("");
  const loading = ref(false);
  const logsLoading = ref(false);
  const running = ref(false);
  const error = ref<string | null>(null);
  const loadedAt = ref<string | null>(null);

  const filteredJobs = computed(() => {
    const normalizedQuery = query.value.trim().toLowerCase();
    const filtered = jobs.value.filter((job) => {
      if (taskTypeFilter.value !== "all" && job.taskType !== taskTypeFilter.value) return false;
      if (statusFilter.value !== "all" && job.status !== statusFilter.value) return false;
      if (!normalizedQuery) return true;
      return [job.id, job.targetId, job.date, job.errorMessage]
        .some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery));
    });
    return [...filtered].sort((left, right) => {
      if (sort.value === "oldest") return left.id - right.id;
      if (sort.value === "failures") {
        const failureDifference = Number(right.status === "failed") - Number(left.status === "failed");
        return failureDifference || right.id - left.id;
      }
      return right.id - left.id;
    });
  });

  const failedJobs = computed(() => jobs.value.filter((job) => job.status === "failed"));
  const logsCurrentPage = computed(() => Math.floor(logsOffset.value / logsLimit.value) + 1);
  const logsPageCount = computed(() => Math.max(1, Math.ceil(logsTotal.value / logsLimit.value)));

  async function fetchCenter(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [nextJobs, nextLogs, nextFreshness, nextQueueStats, nextWorkerStatus] = await Promise.allSettled([
        collectApi.listJobs(200, 0),
        collectApi.listLogsPage(logsLimit.value, logsOffset.value),
        collectApi.fetchFreshness(),
        collectApi.fetchQueueStats(),
        collectApi.fetchWorkerStatus()
      ]);

      if (nextJobs.status === "fulfilled") jobs.value = nextJobs.value;
      if (nextLogs.status === "fulfilled") {
        logs.value = nextLogs.value.logs;
        logsTotal.value = nextLogs.value.total;
        logsOffset.value = nextLogs.value.offset;
      }
      if (nextFreshness.status === "fulfilled") freshness.value = nextFreshness.value;
      if (nextQueueStats.status === "fulfilled") queueStats.value = nextQueueStats.value;
      if (nextWorkerStatus.status === "fulfilled") workerStatus.value = nextWorkerStatus.value;

      const failures = [nextJobs, nextLogs, nextFreshness, nextQueueStats, nextWorkerStatus].filter((item) => item.status === "rejected");
      if (failures.length > 0) {
        const first = failures[0] as PromiseRejectedResult;
        error.value = first.reason instanceof Error ? first.reason.message : String(first.reason);
      }
      loadedAt.value = new Date().toISOString();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      loading.value = false;
    }
  }

  async function restartWorker(): Promise<void> {
    error.value = null;
    try {
      await collectApi.restartWorker();
      await fetchCenter();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    }
  }

  async function goToLogsPage(page: number): Promise<void> {
    const nextPage = Math.min(Math.max(1, page), logsPageCount.value);
    logsLoading.value = true;
    error.value = null;
    try {
      const response = await collectApi.listLogsPage(
        logsLimit.value,
        (nextPage - 1) * logsLimit.value
      );
      logs.value = response.logs;
      logsTotal.value = response.total;
      logsOffset.value = response.offset;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      logsLoading.value = false;
    }
  }

  async function runCollection(payload: CollectorRunPayload): Promise<CollectJob[]> {
    running.value = true;
    error.value = null;
    try {
      const queued = await collectApi.run(payload);
      await fetchCenter();
      return queued;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      running.value = false;
    }
  }

  function clearFilters(): void {
    taskTypeFilter.value = "all";
    statusFilter.value = "all";
    sort.value = "newest";
    query.value = "";
  }

  return {
    jobs,
    logs,
    logsTotal,
    logsLimit,
    logsOffset,
    freshness,
    queueStats,
    workerStatus,
    taskTypeFilter,
    statusFilter,
    sort,
    query,
    loading,
    logsLoading,
    running,
    error,
    loadedAt,
    filteredJobs,
    failedJobs,
    logsCurrentPage,
    logsPageCount,
    fetchCenter,
    runCollection,
    restartWorker,
    goToLogsPage,
    clearFilters
  };
});
