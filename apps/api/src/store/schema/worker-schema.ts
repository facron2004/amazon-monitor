export const workerSchemaSql = `
CREATE TABLE IF NOT EXISTS amazon_worker_heartbeat (
  worker_id TEXT PRIMARY KEY,
  pid INTEGER NOT NULL,
  host TEXT NOT NULL,
  started_at TEXT NOT NULL,
  last_beat_at TEXT NOT NULL,
  version TEXT NOT NULL,
  last_job_id INTEGER,
  last_status TEXT
);
`;
