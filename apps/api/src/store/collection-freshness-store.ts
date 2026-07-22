import type { DatabaseSync } from "node:sqlite";
import type { CollectionFreshness, ProductSyncStatus } from "@amazon-monitor/shared";

type TaskType = CollectionFreshness["taskType"];
type JobStatus = CollectionFreshness["lastStatus"];

interface QueueFreshnessRow {
  task_type: TaskType;
  total_jobs: number;
  failed_jobs: number;
  last_completed_at: string | null;
  last_started_at: string | null;
  last_status: JobStatus;
  last_error_message: string | null;
}

interface SnapshotFreshnessRow {
  data_source: string;
  last_synced_at: string | null;
  sync_status: ProductSyncStatus;
}

function latestSnapshotFreshness(
  db: DatabaseSync,
  taskType: TaskType,
  orgId?: number
): SnapshotFreshnessRow | null {
  const scope = orgId ?? null;
  const row = taskType === "keyword"
    ? db.prepare(`
        SELECT snapshot.data_source, snapshot.last_synced_at, snapshot.sync_status
        FROM amazon_keyword_serp_snapshot snapshot
        JOIN amazon_keyword_monitor monitor ON monitor.id = snapshot.keyword_id
        WHERE (? IS NULL OR monitor.org_id = ?)
        ORDER BY COALESCE(snapshot.last_synced_at, snapshot.created_at) DESC, snapshot.id DESC
        LIMIT 1
      `).get(scope, scope)
    : db.prepare(`
        SELECT snapshot.data_source, snapshot.last_synced_at, snapshot.sync_status
        FROM amazon_bestseller_rank_snapshot snapshot
        JOIN amazon_bestseller_category_monitor monitor ON monitor.id = snapshot.category_id
        WHERE (? IS NULL OR monitor.org_id = ?)
        ORDER BY COALESCE(snapshot.last_synced_at, snapshot.created_at) DESC, snapshot.id DESC
        LIMIT 1
      `).get(scope, scope);
  return row ? row as unknown as SnapshotFreshnessRow : null;
}

function resolveSyncStatus(
  jobStatus: JobStatus,
  snapshotStatus: ProductSyncStatus | null
): ProductSyncStatus | null {
  if (jobStatus === "failed") return "failed";
  if (jobStatus === "pending" || jobStatus === "processing") return "pending";
  if (snapshotStatus) return snapshotStatus;
  return jobStatus === "completed" ? "success" : null;
}

export function getCollectionFreshness(
  db: DatabaseSync,
  orgId?: number
): CollectionFreshness[] {
  const scope = orgId ?? null;
  const rows = db.prepare(`
    SELECT q.task_type,
      COUNT(*) AS total_jobs,
      SUM(CASE WHEN q.status = 'failed' THEN 1 ELSE 0 END) AS failed_jobs,
      MAX(q.completed_at) AS last_completed_at,
      MAX(q.started_at) AS last_started_at,
      (
        SELECT q2.status FROM amazon_collect_job_queue q2
        WHERE q2.task_type = q.task_type AND (? IS NULL OR q2.org_id = ?)
        ORDER BY q2.id DESC LIMIT 1
      ) AS last_status,
      (
        SELECT q2.error_message FROM amazon_collect_job_queue q2
        WHERE q2.task_type = q.task_type AND (? IS NULL OR q2.org_id = ?)
        ORDER BY q2.id DESC LIMIT 1
      ) AS last_error_message
    FROM amazon_collect_job_queue q
    WHERE (? IS NULL OR q.org_id = ?)
    GROUP BY q.task_type
  `).all(scope, scope, scope, scope, scope, scope) as unknown as QueueFreshnessRow[];

  const queueByType = new Map(rows.map((row) => [row.task_type, row]));
  return (["category", "keyword"] as const).map((taskType) => {
    const queue = queueByType.get(taskType);
    const snapshot = latestSnapshotFreshness(db, taskType, orgId);
    const lastStatus = queue?.last_status ?? null;
    const syncStatus = resolveSyncStatus(lastStatus, snapshot?.sync_status ?? null);
    return {
      taskType,
      lastCompletedAt: queue?.last_completed_at ?? null,
      lastStartedAt: queue?.last_started_at ?? null,
      lastStatus,
      dataSource: snapshot?.data_source ?? (queue ? "amazon_playwright" : null),
      lastSyncedAt: snapshot?.last_synced_at ?? queue?.last_completed_at ?? null,
      syncStatus,
      syncError: syncStatus === "failed" ? queue?.last_error_message ?? "采集失败" : null,
      totalJobs: queue?.total_jobs ?? 0,
      failedJobs: queue?.failed_jobs ?? 0
    };
  });
}
