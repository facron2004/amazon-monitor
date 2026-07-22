export const reportSchemaSql = `
CREATE TABLE IF NOT EXISTS workflow_daily_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_date TEXT NOT NULL,
  markdown TEXT NOT NULL,
  coverage_status TEXT NOT NULL CHECK (coverage_status IN ('complete', 'partial', 'empty')),
  coverage_json TEXT NOT NULL,
  signal_count INTEGER NOT NULL DEFAULT 0,
  risk_count INTEGER NOT NULL DEFAULT 0,
  task_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_workflow_daily_reports_org_date
  ON workflow_daily_reports(org_id, report_date DESC);

CREATE TABLE IF NOT EXISTS workflow_period_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('weekly', 'monthly')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  markdown TEXT NOT NULL,
  coverage_status TEXT NOT NULL CHECK (coverage_status IN ('complete', 'partial', 'empty')),
  coverage_json TEXT NOT NULL,
  sales_marketplace_count INTEGER NOT NULL DEFAULT 0,
  insight_count INTEGER NOT NULL DEFAULT 0,
  completed_task_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_id, period, end_date)
);

CREATE INDEX IF NOT EXISTS idx_workflow_period_reports_org_period_date
  ON workflow_period_reports(org_id, period, end_date DESC);
`;
