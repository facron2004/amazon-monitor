import type {
  CollectJob,
  CollectTaskLog,
  CollectTaskLogListResponse,
  CollectionFreshness,
  QueueStats,
  WorkerStatus
} from "@amazon-monitor/shared";
import { request } from "./api-base";

export type CollectorRunTaskType = "all" | "keyword" | "category";

export interface CollectorRunPayload {
  taskType?: CollectorRunTaskType;
  targetId?: number;
  date?: string;
}

export const collectApi = {
  run: (payload: CollectorRunPayload = {}) =>
    request<CollectJob[]>("/collectors/run", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  collectJob: (id: number) => request<CollectJob>(`/collectors/jobs/${id}`),
  listJobs: (limit = 50, offset = 0) => request<CollectJob[]>(`/collectors/jobs?limit=${limit}&offset=${offset}`),
  listLogs: (limit = 50, offset = 0) => request<CollectTaskLog[]>(`/collectors/logs?limit=${limit}&offset=${offset}`),
  listLogsPage: (limit = 50, offset = 0) =>
    request<CollectTaskLogListResponse>(`/collectors/logs/page?limit=${limit}&offset=${offset}`),
  fetchFreshness: () => request<CollectionFreshness[]>("/collectors/freshness"),
  fetchQueueStats: () => request<QueueStats>("/collectors/queue-stats"),
  fetchWorkerStatus: () => request<WorkerStatus>("/collectors/worker-status"),
  restartWorker: () => request<{ started: boolean; pid: number | null }>("/collectors/worker-restart", { method: "POST" })
};
