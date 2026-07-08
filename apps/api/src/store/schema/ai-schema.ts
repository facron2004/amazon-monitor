export const aiSchemaSql = `
CREATE TABLE IF NOT EXISTS ai_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
`;
