import type { DatabaseSync } from "node:sqlite";
import { clampLimit, clampOffset, nowIso } from "./sql-utils.js";
import type { CollectJob, Store } from "./types.js";

type QueueStoreMethods = Pick<
  Store,
  | "pushJob"
  | "claimNextJob"
  | "completeJob"
  | "failJob"
  | "listJobs"
  | "getJobStatus"
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
      
      // Check if there is already a pending or processing job for the same target, date, and taskType
      const existing = db.prepare(`
        SELECT * FROM amazon_collect_job_queue
        WHERE task_type = ? AND target_id = ? AND date = ? AND status IN ('pending', 'processing')
        LIMIT 1
      `).get(taskType, targetId, date) as any;

      if (existing) {
        return mapCollectJob(existing);
      }

      const result = db.prepare(`
        INSERT INTO amazon_collect_job_queue
        (task_type, target_id, date, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
      `).run(taskType, targetId, date, now);

      const newJob = db.prepare(`
        SELECT * FROM amazon_collect_job_queue WHERE id = ?
      `).get(Number(result.lastInsertRowid)) as any;

      return mapCollectJob(newJob);
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
      db.prepare(`
        UPDATE amazon_collect_job_queue
        SET status = 'completed', completed_at = ?
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

    resetQueue() {
      db.exec(`DELETE FROM amazon_collect_job_queue`);
    }
  };
}
