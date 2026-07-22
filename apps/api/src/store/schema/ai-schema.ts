export const aiSchemaSql = `
CREATE TABLE IF NOT EXISTS ai_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL DEFAULT 1,
  agent_type TEXT NOT NULL,
  input_context_json TEXT NOT NULL,
  output_json TEXT,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  token_usage INTEGER,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_agent_created ON ai_runs(agent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_status ON ai_runs(status);
CREATE TABLE IF NOT EXISTS ai_action_feedback (
  run_id INTEGER NOT NULL,
  org_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  action_index INTEGER NOT NULL,
  value TEXT NOT NULL CHECK (value IN ('up', 'down')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, action_index, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ai_action_feedback_org_run ON ai_action_feedback(org_id, run_id);
`;
