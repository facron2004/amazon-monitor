export const queueSchemaSql = `
CREATE TABLE IF NOT EXISTS amazon_collect_job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL DEFAULT 1,
  task_type TEXT NOT NULL,
  target_id INTEGER,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_token TEXT,
  lease_expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_queue_status_id ON amazon_collect_job_queue(status, id ASC);
CREATE INDEX IF NOT EXISTS idx_queue_pending_age ON amazon_collect_job_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_queue_org_status_id ON amazon_collect_job_queue(org_id, status, id DESC);
CREATE INDEX IF NOT EXISTS idx_queue_processing_lease ON amazon_collect_job_queue(status, lease_expires_at, id ASC);
CREATE INDEX IF NOT EXISTS idx_queue_dedup ON amazon_collect_job_queue(org_id, task_type, target_id, date, status);
DELETE FROM amazon_collect_job_queue
WHERE id NOT IN (
  SELECT MIN(id) FROM amazon_collect_job_queue
  WHERE status IN ('pending', 'processing')
  GROUP BY org_id, task_type, target_id, date
) AND status IN ('pending', 'processing');
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_dedup_active ON amazon_collect_job_queue(org_id, task_type, target_id, date) WHERE status IN ('pending', 'processing');
`;
