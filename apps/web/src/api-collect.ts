import type { CollectJob, CollectionFreshness, QueueStats, WorkerStatus } from "@amazon-monitor/shared";
import { request } from "./api-base";

export const collectApi = {
  collectJob: (id: number) => request<CollectJob | null>(`/collect/jobs/${id}`),
  listJobs: (limit = 50, offset = 0) => request<CollectJob[]>(`/collect/jobs?limit=${limit}&offset=${offset}`),
  fetchFreshness: () => request<CollectionFreshness[]>("/collect/freshness"),
  fetchQueueStats: () => request<QueueStats>("/collect/queue-stats"),
  fetchWorkerStatus: () => request<WorkerStatus>("/collect/worker-status")
};
