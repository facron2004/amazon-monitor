import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { getCollectionFreshness } from "./collection-freshness-store.js";
import { clampLimit, clampOffset, nowIso, withTransaction } from "./sql-utils.js";
import type { ClaimedCollectJob, CollectJob, Store } from "./types.js";

type QueueStoreMethods = Pick<
  Store,
  | "pushJob"
  | "claimNextJob"
  | "renewJobLease"
  | "isJobLeaseActive"
  | "completeJob"
  | "failJob"
  | "listJobs"
  | "getJobStatus"
  | "getCollectionFreshness"
  | "getQueueStats"
  | "recoverStuckJobs"
  | "recoverExpiredJobLeases"
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
  lease_owner: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
}

export function mapCollectJob(row: CollectJobRow): CollectJob {
  return {
    id: row.id,
    orgId: row.org_id,
    taskType: row.task_type as "keyword" | "category" | "data_source_sync",
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

function mapClaimedCollectJob(row: CollectJobRow): ClaimedCollectJob {
  if (!row.lease_owner || !row.lease_token || !row.lease_expires_at) {
    throw new Error(`Job ${row.id} is missing its execution lease`);
  }
  return {
    ...mapCollectJob(row),
    leaseOwner: row.lease_owner,
    leaseToken: row.lease_token,
    leaseExpiresAt: row.lease_expires_at
  };
}

function leaseExpiry(leaseDurationMs: number): string {
  return new Date(Date.now() + leaseDurationMs).toISOString();
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

    claimNextJob(workerId, leaseDurationMs) {
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
          const leaseToken = randomUUID();
          const leaseExpiresAt = leaseExpiry(leaseDurationMs);
          const claimed = db.prepare(`
            UPDATE amazon_collect_job_queue
            SET status = 'processing', started_at = ?, lease_owner = ?, lease_token = ?, lease_expires_at = ?
            WHERE id = ? AND status = 'pending'
          `).run(now, workerId, leaseToken, leaseExpiresAt, job.id);

          if (claimed.changes === 0) {
            db.exec("COMMIT");
            return null;
          }

          const updatedJob = db.prepare(`
            SELECT * FROM amazon_collect_job_queue WHERE id = ?
          `).get(job.id) as unknown as CollectJobRow;

          db.exec("COMMIT");
          return mapClaimedCollectJob(updatedJob);
        }

        db.exec("COMMIT");
        return null;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },

    renewJobLease(id, leaseOwner, leaseToken, leaseDurationMs) {
      const result = db.prepare(`
        UPDATE amazon_collect_job_queue
        SET lease_expires_at = ?
        WHERE id = ? AND status = 'processing' AND lease_owner = ? AND lease_token = ? AND lease_expires_at > ?
      `).run(leaseExpiry(leaseDurationMs), id, leaseOwner, leaseToken, nowIso());
      return result.changes > 0;
    },

    isJobLeaseActive(id, leaseOwner, leaseToken) {
      const row = db.prepare(`
        SELECT 1 FROM amazon_collect_job_queue
        WHERE id = ? AND status = 'processing' AND lease_owner = ? AND lease_token = ? AND lease_expires_at > ?
      `).get(id, leaseOwner, leaseToken, nowIso());
      return Boolean(row);
    },

    completeJob(id, leaseOwner, leaseToken) {
      const now = nowIso();
      const result = db.prepare(`
        UPDATE amazon_collect_job_queue
        SET status = 'completed', completed_at = ?, error_message = NULL,
          lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
        WHERE id = ? AND status = 'processing' AND lease_owner = ? AND lease_token = ? AND lease_expires_at > ?
      `).run(now, id, leaseOwner, leaseToken, nowIso());
      return result.changes > 0;
    },

    failJob(id, leaseOwner, leaseToken, errorMessage, maxRetries) {
      const job = db.prepare(`
        SELECT * FROM amazon_collect_job_queue WHERE id = ?
      `).get(id) as unknown as CollectJobRow | undefined;

      if (!job) return false;
      if (job.status !== "processing" || job.lease_owner !== leaseOwner || job.lease_token !== leaseToken) return false;

      const nextRetryCount = job.retry_count + 1;
      const now = nowIso();

      if (nextRetryCount >= maxRetries) {
        const result = db.prepare(`
          UPDATE amazon_collect_job_queue
          SET status = 'failed', completed_at = ?, error_message = ?, retry_count = ?,
            lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
          WHERE id = ? AND status = 'processing' AND lease_owner = ? AND lease_token = ? AND lease_expires_at > ?
        `).run(now, errorMessage, nextRetryCount, id, leaseOwner, leaseToken, nowIso());
        return result.changes > 0;
      } else {
        const result = db.prepare(`
          UPDATE amazon_collect_job_queue
          SET status = 'pending', started_at = NULL, error_message = ?, retry_count = ?,
            lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
          WHERE id = ? AND status = 'processing' AND lease_owner = ? AND lease_token = ? AND lease_expires_at > ?
        `).run(errorMessage, nextRetryCount, id, leaseOwner, leaseToken, nowIso());
        return result.changes > 0;
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

    /** Recover only legacy pre-lease processing rows during the upgrade. */
    recoverStuckJobs(reason: string): number[] {
      const stuck = db.prepare(`
        SELECT id FROM amazon_collect_job_queue
        WHERE status = 'processing' AND lease_token IS NULL
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
          SET status = 'failed', completed_at = ?, error_message = ?,
            lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
          WHERE id IN (${placeholders}) AND status = 'processing' AND lease_token IS NULL
        `).run(now, reason, ...ids);
      });

      // Re-query which ids actually landed in 'failed' (defensive against
      // a concurrent status change between SELECT and UPDATE).
      const recoveredRows = db.prepare(`
        SELECT id FROM amazon_collect_job_queue
        WHERE id IN (${placeholders}) AND status = 'failed' AND completed_at = ? AND error_message = ?
      `).all(...ids, now, reason) as Array<{ id: number }>;

      return recoveredRows.map((row) => row.id);
    },

    /**
     * Periodically recover jobs stuck in 'processing' beyond the stale
     * threshold. Unlike recoverStuckJobs (which runs at startup and marks
     * everything failed), this runs at runtime and marks jobs back to
     * 'pending' so they can be retried — unless retry_count is already
     * exhausted, in which case they go to 'failed'.
     */
    recoverExpiredJobLeases(maxRetries) {
      const now = nowIso();
      const stuck = db.prepare(`
        SELECT id, retry_count, lease_token FROM amazon_collect_job_queue
        WHERE status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
        ORDER BY id ASC
        LIMIT 100
      `).all(now) as Array<{ id: number; retry_count: number; lease_token: string }>;

      if (stuck.length === 0) return [];

      const recovered: number[] = [];

      withTransaction(db, () => {
        for (const job of stuck) {
          // Double-check it's still processing (defensive against race)
          const row = db.prepare(`
            SELECT status, retry_count, lease_token FROM amazon_collect_job_queue WHERE id = ?
          `).get(job.id) as { status: string; retry_count: number; lease_token: string | null } | undefined;

          if (!row || row.status !== "processing" || row.lease_token !== job.lease_token) continue;

          const nextRetry = row.retry_count + 1;
          if (nextRetry >= maxRetries) {
            const result = db.prepare(`
              UPDATE amazon_collect_job_queue
              SET status = 'failed', completed_at = ?, error_message = ?,
                lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
              WHERE id = ? AND status = 'processing' AND lease_token = ?
            `).run(now, "任务租约已过期，已自动回收", job.id, job.lease_token);
            if (result.changes > 0) recovered.push(job.id);
          } else {
            const result = db.prepare(`
              UPDATE amazon_collect_job_queue
              SET status = 'pending', started_at = NULL, error_message = ?, retry_count = ?,
                lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
              WHERE id = ? AND status = 'processing' AND lease_token = ?
            `).run("任务租约已过期，已自动回收，准备重试", nextRetry, job.id, job.lease_token);
            if (result.changes > 0) recovered.push(job.id);
          }
        }
      });

      return recovered;
    }
  };
}
