import type { DatabaseSync } from "node:sqlite";
import { getCollectionFreshness } from "./collection-freshness-store.js";
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

interface CollectJobRow {
  id: number;
  org_id: number;
  task_type: CollectJob["taskType"];
  target_id: number;
  date: string;
  status: CollectJob["status"];
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  retry_count: number;
}

export function mapCollectJob(row: CollectJobRow): CollectJob {
  return {
    id: row.id,
    orgId: row.org_id,
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
    pushJob(taskType, targetId, date, orgId = 1) {
      const now = nowIso();

      // Atomic dedup via partial unique index idx_queue_dedup_active.
      // INSERT OR IGNORE skips if a pending/processing job already exists for
      // this (task_type, target_id, date) — eliminates the race window that
      // the previous SELECT-then-INSERT had under concurrent pushJob calls.
      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO amazon_collect_job_queue
        (org_id, task_type, target_id, date, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', ?)
      `);
      const result = insertStmt.run(orgId, taskType, targetId, date, now);

      if (result.changes > 0) {
        const newJob = db.prepare(`
          SELECT * FROM amazon_collect_job_queue WHERE id = ?
        `).get(Number(result.lastInsertRowid)) as unknown as CollectJobRow;
        return mapCollectJob(newJob);
      }

      // Existing pending/processing job — return it
      const existing = db.prepare(`
        SELECT * FROM amazon_collect_job_queue
        WHERE org_id = ? AND task_type = ? AND target_id = ? AND date = ? AND status IN ('pending', 'processing')
        LIMIT 1
      `).get(orgId, taskType, targetId, date) as unknown as CollectJobRow | undefined;

      // Defensive: rare race where the job transitioned between INSERT IGNORE
      // and SELECT. Re-attempt the insert once.
      if (!existing) {
        const retry = insertStmt.run(orgId, taskType, targetId, date, now);
        if (retry.changes > 0) {
          const newJob = db.prepare(`
            SELECT * FROM amazon_collect_job_queue WHERE id = ?
          `).get(Number(retry.lastInsertRowid)) as unknown as CollectJobRow;
          return mapCollectJob(newJob);
        }
      }

      if (!existing) throw new Error("Unable to queue collection job");
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
        `).get() as unknown as CollectJobRow | undefined;

        if (job) {
          const now = nowIso();
          db.prepare(`
            UPDATE amazon_collect_job_queue
            SET status = 'processing', started_at = ?
            WHERE id = ?
          `).run(now, job.id);

          const updatedJob = db.prepare(`
            SELECT * FROM amazon_collect_job_queue WHERE id = ?
          `).get(job.id) as unknown as CollectJobRow;

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
      `).get(id) as unknown as CollectJobRow | undefined;

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

    listJobs(limit = 50, offset = 0, orgId) {
      const clamped = clampLimit(limit) || 50;
      const off = clampOffset(offset);
      const rows = db.prepare(`
        SELECT * FROM amazon_collect_job_queue
        ${orgId === undefined ? "" : "WHERE org_id = ?"}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `).all(...(orgId === undefined ? [clamped, off] : [orgId, clamped, off])) as unknown as CollectJobRow[];
      return rows.map(mapCollectJob);
    },

    getJobStatus(id, orgId) {
      const row = orgId === undefined
        ? db.prepare("SELECT * FROM amazon_collect_job_queue WHERE id = ?").get(id)
        : db.prepare("SELECT * FROM amazon_collect_job_queue WHERE id = ? AND org_id = ?").get(id, orgId);
      return row ? mapCollectJob(row as unknown as CollectJobRow) : null;
    },

    getCollectionFreshness(orgId) {
      return getCollectionFreshness(db, orgId);
    },

    resetQueue() {
      db.exec(`DELETE FROM amazon_collect_job_queue`);
    },

    /**
     * Snapshot of queue health for the dashboard indicator. Cheap aggregate
     * query — used by `/api/collect/queue-stats` to render the topbar badge
     * without paging through the full job list.
     */
    getQueueStats(orgId) {
      const counts = db.prepare(`
        SELECT
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_recent_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_recent_count
        FROM amazon_collect_job_queue
        WHERE (? IS NULL OR org_id = ?)
      `).get(orgId ?? null, orgId ?? null) as {
        pending_count: number | null;
        processing_count: number | null;
        completed_recent_count: number | null;
        failed_recent_count: number | null;
      };

      const oldest = db.prepare(`
        SELECT created_at FROM amazon_collect_job_queue
        WHERE status = 'pending' AND (? IS NULL OR org_id = ?)
        ORDER BY created_at ASC
        LIMIT 1
      `).get(orgId ?? null, orgId ?? null) as { created_at: string } | undefined;

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
