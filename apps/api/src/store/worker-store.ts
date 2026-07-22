import { kill } from "node:process";
import type { DatabaseSync } from "node:sqlite";
import type { WorkerStatus } from "@amazon-monitor/shared";
import { nowIso } from "./sql-utils.js";
import type { Store } from "./types.js";

type WorkerStoreMethods = Pick<
  Store,
  "recordWorkerHeartbeat" | "getWorkerStatus"
>;

/**
 * Freshness windows for the topbar "online / stale / offline" indicator.
 *
 * The Worker writes a row on every poll iteration (default 2s), so a gap
 * beyond `liveThresholdMs` means the Worker is alive but slow (e.g. SQLite
 * contention or a long-running job eating the main loop). Beyond
 * `staleThresholdMs` we assume the process is gone — pending jobs will never
 * drain.
 */
const LIVE_THRESHOLD_MS = 15_000;
const STALE_THRESHOLD_MS = 60_000;

export function createWorkerStore(db: DatabaseSync): WorkerStoreMethods {
  const upsertStmt = db.prepare(`
    INSERT INTO amazon_worker_heartbeat
      (worker_id, pid, host, started_at, last_beat_at, version, last_job_id, last_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(worker_id) DO UPDATE SET
      last_beat_at = excluded.last_beat_at,
      last_job_id = excluded.last_job_id,
      last_status = excluded.last_status
  `);

  return {
    /**
     * Write or update a heart-beat row for the running Worker. `startedAt`
     * is captured on first insert only — subsequent calls keep the original
     * process start so the UI can show "uptime since". `lastJobId` /
     * `lastStatus` are advisory — `null` when the Worker hasn't touched a
     * job since startup.
     */
    recordWorkerHeartbeat(input) {
      const beat = nowIso();
      upsertStmt.run(
        input.workerId,
        input.pid,
        input.host,
        input.startedAt,
        beat,
        input.version,
        input.lastJobId ?? null,
        input.lastStatus ?? null
      );
    },

    /**
     * Read the most recent heart-beat and project it into a status object the
     * topbar can render. Returns an "offline" status when no Worker has ever
     * reported — a fresh DB still needs to be flagged so the user doesn't
     * assume the system is healthy before the first beat.
     */
    getWorkerStatus(): WorkerStatus {
      const row = db
        .prepare(`SELECT * FROM amazon_worker_heartbeat ORDER BY last_beat_at DESC LIMIT 1`)
        .get() as
        | {
            worker_id: string;
            pid: number;
            host: string;
            started_at: string;
            last_beat_at: string;
            version: string;
            last_job_id: number | null;
            last_status: string | null;
          }
        | undefined;

      if (!row) {
        return {
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
        };
      }

      const ageMs = Math.max(0, Date.now() - new Date(row.last_beat_at).getTime());
      const pidAlive = isPidAlive(row.pid);
      const alive = pidAlive && ageMs <= LIVE_THRESHOLD_MS;
      const stale = pidAlive && !alive && ageMs <= STALE_THRESHOLD_MS;
      const offline = !pidAlive || (!alive && !stale);

      return {
        alive,
        stale,
        offline,
        ageMs,
        workerId: row.worker_id,
        pid: row.pid,
        host: row.host,
        startedAt: row.started_at,
        lastBeatAt: row.last_beat_at,
        version: row.version,
        lastJobId: row.last_job_id,
        lastStatus: (row.last_status as WorkerStatus["lastStatus"]) ?? null
      };
    }
  };
}

function isPidAlive(pid: number): boolean {
  try {
    kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ESRCH") return false;
    return true;
  }
}
