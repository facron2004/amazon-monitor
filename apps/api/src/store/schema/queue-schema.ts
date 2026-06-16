export const queueSchemaSql = `
CREATE TABLE IF NOT EXISTS amazon_collect_job_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL,
  target_id INTEGER,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);
`;
