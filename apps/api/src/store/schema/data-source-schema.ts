export const dataSourceSchemaSql = `
CREATE TABLE IF NOT EXISTS data_source_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  marketplace TEXT,
  status TEXT NOT NULL DEFAULT 'not_connected',
  sync_status TEXT NOT NULL DEFAULT 'manual',
  last_synced_at TEXT,
  last_success_at TEXT,
  sync_error TEXT,
  owner_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, name),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_data_sources_org_type ON data_source_configs(org_id, source_type);
CREATE INDEX IF NOT EXISTS idx_data_sources_org_status ON data_source_configs(org_id, status);

CREATE TABLE IF NOT EXISTS data_source_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  data_source_id INTEGER NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  created_records INTEGER NOT NULL DEFAULT 0,
  updated_records INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  initiated_by_id INTEGER,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (data_source_id) REFERENCES data_source_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (initiated_by_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_data_source_runs_source_started
  ON data_source_sync_runs(org_id, data_source_id, started_at DESC, id DESC);
`;
