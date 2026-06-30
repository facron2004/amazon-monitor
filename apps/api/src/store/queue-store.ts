import type { DatabaseSync } from "node:sqlite";
import { clampLimit, clampOffset, nowIso, withTransaction } from "./sql-utils.js";
import type { CollectJob, Store } from "./types.js";

type QueueStoreMethods = Pick<
  Store,
  | "pushJob"
  | "claimNextJob"
  | "completeJob"
  | "failJob"
  | "listJobs"
  | "getJobStatus"
  | "getCollectionFreshness"
  | "getQueueStats"
  | "recoverStuckJobs"
  | "resetQueue"
>;

export function mapCollectJob(row: any): CollectJob {
  return {
    id: row.id,
    taskType: row.task_type as "keyword" | "category",
    targetId: row.target_id,
    date: row.date,
    status: row.status as "pending" | "processing" | "completed" | "failed",
    createdAt: row.created_at,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    errorMessage: row.error_message ?? null,
    retryCount: row.retry_count
  };
}

export function createQueueStore(db: DatabaseSync): QueueStoreMethods {
  return {
    pushJob(taskType, targetId, date) {
      const now = nowIso();

      // Atomic dedup via partial unique index idx_queue_dedup_active.
      // INSERT OR IGNORE skips if a pending/processing job already exists for
      // this (task_type, target_id, date) — eliminates the race window that
      // the previous SELECT-then-INSERT had under concurrent pushJob calls.
      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO amazon_collect_job_queue
        (task_type, target_id, date, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
      `);
      const result = insertStmt.run(taskType, targetId, date, now);

      if (result.changes > 0) {
        const newJob = db.prepare(`
          SELECT * FROM amazon_collect_job_queue WHERE id = ?
        `).get(Number(result.lastInsertRowid)) as any;
        return mapCollectJob(newJob);
      }

      // Existing pending/processing job — return it
      const existing = db.prepare(`
        SELECT * FROM amazon_collect_job_queue
        WHERE task_type = ? AND target_id = ? AND date = ? AND status IN ('pending', 'processing')
        LIMIT 1
      `).get(taskType, targetId, date) as any;

      // Defensive: rare race where the job transitioned between INSERT IGNORE
      // and SELECT. Re-attempt the insert once.
      if (!existing) {
        const retry = insertStmt.run(taskType, targetId, date, now);
        if (retry.changes > 0) {
          const newJob = db.prepare(`
            SELECT * FROM amazon_collect_job_queue WHERE id = ?
          `).get(Number(retry.lastInsertRowid)) as any;
          return mapCollectJob(newJob);
        }
      }

      return mapCollectJob(existing);
    },

    claimNextJob() {
      // Use transaction to avoid race conditions between multiple workers
      db.exec("BEGIN IMMEDIATE");
      try {
        const job = db.prepare(`
          SELECT * FROM amazon_collect_job_queue
          WHERE status = 'pending'
          ORDER BY id ASC
          LIMIT 1
        `).get() as any;

        if (job) {
          const now = nowIso();
          db.prepare(`
            UPDATE amazon_collect_job_queue
            SET status = 'processing', started_at = ?
            WHERE id = ?
          `).run(now, job.id);

          const updatedJob = db.prepare(`
            SELECT * FROM amazon_collect_job_queue WHERE id = ?
          `).get(job.id) as any;

          db.exec("COMMIT");
          return mapCollectJob(updatedJob);
        }

        db.exec("COMMIT");
        return null;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    completeJob(id) {
      const now = nowIso();
      // Clear any stale error_message from a previous failed attempt —
      // a successful retry shouldn't surface the old failure reason to
      // the operator looking at the job history.
      db.prepare(`
        UPDATE amazon_collect_job_queue
        SET status = 'completed', completed_at = ?, error_message = NULL
        WHERE id = ?
      `).run(now, id);
    },

    failJob(id, errorMessage, maxRetries) {
      const job = db.prepare(`
        SELECT * FROM amazon_collect_job_queue WHERE id = ?
      `).get(id) as any;

      if (!job) return;

      const nextRetryCount = job.retry_count + 1;
      const now = nowIso();

      if (nextRetryCount >= maxRetries) {
        db.prepare(`
          UPDATE amazon_collect_job_queue
          SET status = 'failed', completed_at = ?, error_message = ?, retry_count = ?
          WHERE id = ?
        `).run(now, errorMessage, nextRetryCount, id);
      } else {
        db.prepare(`
          UPDATE amazon_collect_job_queue
          SET status = 'pending', started_at = NULL, error_message = ?, retry_count = ?
          WHERE id = ?
        `).run(errorMessage, nextRetryCount, id);
      }
    },

    listJobs(limit = 50, offset = 0) {
      const clamped = clampLimit(limit) || 50;
      const off = clampOffset(offset);
      const rows = db.prepare(`
        SELECT * FROM amazon_collect_job_queue
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `).all(clamped, off) as any[];
      return rows.map(mapCollectJob);
    },

    getJobStatus(id) {
      const row = db.prepare(`
        SELECT * FROM amazon_collect_job_queue WHERE id = ?
      `).get(id) as any;
      return row ? mapCollectJob(row) : null;
    },

    /**
     * Aggregate latest collection status per task_type. Used by the dashboard
     * to surface "data is X hours stale" without exposing the raw queue.
     */
    getCollectionFreshness() {
      // SQL-side aggregation: avoids loading the entire queue into JS memory
      // on every dashboard refresh. ISO 8601 timestamps sort correctly as
      // strings, so MAX() yields the latest.
      const rows = db.prepare(`
        SELECT q.task_type,
          COUNT(*) AS total_jobs,
          SUM(CASE WHEN q.status = 'failed' THEN 1 ELSE 0 END) AS failed_jobs,
          MAX(q.completed_at) AS last_completed_at,
          MAX(q.started_at) AS last_started_at,
          (
            SELECT q2.status FROM amazon_collect_job_queue q2
            WHERE q2.task_type = q.task_type
            ORDER BY q2.id DESC LIMIT 1
          ) AS last_status
        FROM amazon_collect_job_queue q
        GROUP BY q.task_type
      `).all() as Array<{
        task_type: "keyword" | "category";
        total_jobs: number;
        failed_jobs: number;
        last_completed_at: string | null;
        last_started_at: string | null;
        last_status: "completed" | "failed" | "pending" | "processing" | null;
      }>;

      const byType = new Map<string, {
        taskType: "keyword" | "category";
        lastCompletedAt: string | null;
        lastStartedAt: string | null;
        lastStatus: "completed" | "failed" | "pending" | "processing" | null;
        totalJobs: number;
        failedJobs: number;
      }>();

      for (const row of rows) {
        byType.set(row.task_type, {
          taskType: row.task_type,
          lastCompletedAt: row.last_completed_at,
          lastStartedAt: row.last_started_at,
          lastStatus: row.last_status,
          totalJobs: row.total_jobs,
          failedJobs: row.failed_jobs
        });
      }

      // Ensure both task types are always returned (even when queue is empty)
      for (const taskType of ["keyword", "category"] as const) {
        if (!byType.has(taskType)) {
          byType.set(taskType, {
            taskType,
            lastCompletedAt: null,
            lastStartedAt: null,
            lastStatus: null,
            totalJobs: 0,
            failedJobs: 0
          });
        }
      }

      return Array.from(byType.values()).sort((a, b) => a.taskType.localeCompare(b.taskType));
    },

    resetQueue() {
      db.exec(`DELETE FROM amazon_collect_job_queue`);
    },

    /**
     * Snapshot of queue health for the dashboard indicator. Cheap aggregate
     * query — used by `/api/collect/queue-stats` to render the topbar badge
     * without paging through the full job list.
     */
    getQueueStats() {
      const counts = db.prepare(`
        SELECT
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_recent_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_recent_count
        FROM amazon_collect_job_queue
      `).get() as {
        pending_count: number | null;
        processing_count: number | null;
        completed_recent_count: number | null;
        failed_recent_count: number | null;
      };

      const oldest = db.prepare(`
        SELECT created_at FROM amazon_collect_job_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
      `).get() as { created_at: string } | undefined;

      const oldestPendingAgeMs = oldest
        ? Math.max(0, Date.now() - new Date(oldest.created_at).getTime())
        : 0;

      return {
        pendingCount: counts.pending_count ?? 0,
        processingCount: counts.processing_count ?? 0,
        completedRecentCount: counts.completed_recent_count ?? 0,
        failedRecentCount: counts.failed_recent_count ?? 0,
        oldestPendingAgeMs
      };
    },

    /**
     * Recover jobs left in 'processing' state by a previous Worker that
     * crashed or was killed. Marks them failed with an explicit reason so
     * operators can distinguish "we recovered a dead task" from "the task
     * genuinely errored". Returns the recovered job IDs for logging.
     *
     * Without this, the queue would silently carry jobs that no lane will
     * ever pick up — `claimNextJob` only reads 'pending' rows.
     */
    recoverStuckJobs(reason: string): number[] {
      const stuck = db.prepare(`
        SELECT id FROM amazon_collect_job_queue
        WHERE status = 'processing'
        ORDER BY id ASC
        LIMIT 1000
      `).all() as Array<{ id: number }>;

      if (stuck.length === 0) return [];

      const now = nowIso();
      const ids = stuck.map((row) => row.id);
      const placeholders = ids.map(() => "?").join(",");

      // Single batch UPDATE replaces the per-row loop — within a transaction
      // the SELECT/UPDATE is atomic, so every selected id transitions.
      withTransaction(db, () => {
        db.prepare(`
          UPDATE amazon_collect_job_queue
          SET status = 'failed', completed_at = ?, error_message = ?
          WHERE id IN (${placeholders}) AND status = 'processing'
        `).run(now, reason, ...ids);
      });

      // Re-query which ids actually landed in 'failed' (defensive against
      // a concurrent status change between SELECT and UPDATE).
      const recoveredRows = db.prepare(`
        SELECT id FROM amazon_collect_job_queue
        WHERE id IN (${placeholders}) AND status = 'failed' AND completed_at = ? AND error_message = ?
      `).all(...ids, now, reason) as Array<{ id: number }>;

      return recoveredRows.map((row) => row.id);
    }
  };
}
