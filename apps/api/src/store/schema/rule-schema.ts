export const ruleSchemaSql = `
CREATE TABLE IF NOT EXISTS alert_rule_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  rule_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  severity TEXT NOT NULL,
  conditions_json TEXT NOT NULL,
  cooldown_hours INTEGER NOT NULL DEFAULT 24,
  notes TEXT,
  updated_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, rule_id),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_alert_rule_configs_org ON alert_rule_configs(org_id);
CREATE INDEX IF NOT EXISTS idx_alert_rule_configs_rule ON alert_rule_configs(rule_id);
`;
