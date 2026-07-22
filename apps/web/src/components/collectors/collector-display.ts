import type { CollectJob, CollectionFreshness, WorkerStatus } from "@amazon-monitor/shared";

export const collectorTaskTypeLabels: Record<CollectJob["taskType"], string> = {
  keyword: "关键词",
  category: "类目榜单"
};

export const collectorJobStatusLabels: Record<CollectJob["status"], string> = {
  pending: "等待中",
  processing: "采集中",
  completed: "已完成",
  failed: "失败"
};

export function formatCollectorDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return "-";
  const startMs = new Date(startedAt).getTime();
  const endMs = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "-";
  return formatElapsedMs(Math.max(0, endMs - startMs));
}

export function formatElapsedMs(value: number | null): string {
  if (value === null) return "从未上报";
  if (value < 1_000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${Math.round(value / 1_000)} 秒`;
  if (value < 3_600_000) return `${Math.floor(value / 60_000)} 分钟`;
  return `${Math.floor(value / 3_600_000)} 小时`;
}

export function collectionFreshnessState(item: CollectionFreshness): {
  label: string;
  detail: string;
  tone: "healthy" | "warning" | "danger" | "neutral";
} {
  if (!item.lastStartedAt) {
    return { label: "未采集", detail: "请先发起一次采集", tone: "neutral" };
  }
  if (item.lastStatus === "failed") {
    return { label: "最近失败", detail: `${item.failedJobs} 个失败任务`, tone: "danger" };
  }
  if (item.lastStatus === "pending" || item.lastStatus === "processing") {
    return { label: "正在更新", detail: "数据刷新进行中", tone: "warning" };
  }
  if (!item.lastCompletedAt) {
    return { label: "等待完成", detail: "尚无成功快照", tone: "warning" };
  }

  const ageMs = Math.max(0, Date.now() - new Date(item.lastCompletedAt).getTime());
  if (ageMs <= 24 * 3_600_000) {
    return { label: "新鲜", detail: `${formatElapsedMs(ageMs)}前完成`, tone: "healthy" };
  }
  return { label: "需更新", detail: `${formatElapsedMs(ageMs)}前完成`, tone: "warning" };
}

export function workerDisplay(status: WorkerStatus | null): {
  label: string;
  detail: string;
  tone: "healthy" | "warning" | "danger" | "neutral";
} {
  if (!status || status.offline) {
    return { label: "离线", detail: "启动 Worker 后任务才会执行", tone: "danger" };
  }
  if (status.stale) {
    return { label: "心跳延迟", detail: `${formatElapsedMs(status.ageMs)}未上报`, tone: "warning" };
  }
  return {
    label: "在线",
    detail: `${status.host ?? "Worker"} · PID ${status.pid ?? "-"}`,
    tone: "healthy"
  };
}
