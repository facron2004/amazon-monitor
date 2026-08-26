import type { DatabaseSync } from "node:sqlite";
import { withTransaction } from "../store/sql-utils.js";

export const agentOsSchemaSql = `
CREATE TABLE IF NOT EXISTS agent_os_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  store_id_json TEXT,
  sku_id_json TEXT,
  goal_type TEXT NOT NULL,
  metric TEXT NOT NULL,
  target_value_json TEXT NOT NULL,
  current_value_json TEXT,
  deadline TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  constraints_json TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_os_goals_org_status
  ON agent_os_goals(organization_id, status, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS agent_os_memory_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  memory_type TEXT NOT NULL,
  subject_type TEXT,
  subject_id_json TEXT,
  title TEXT,
  content_json TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL,
  source_workflow_run_id INTEGER,
  source_action_proposal_id INTEGER,
  idempotency_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_os_memory_org_type
  ON agent_os_memory_entries(organization_id, memory_type, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_agent_os_memory_org_subject
  ON agent_os_memory_entries(organization_id, subject_type, subject_id_json);

CREATE TABLE IF NOT EXISTS agent_os_workflow_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  workflow_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_source TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  started_at TEXT,
  completed_at TEXT,
  current_node TEXT,
  context_json TEXT NOT NULL DEFAULT '{}',
  evidence_json TEXT,
  plan_json TEXT,
  actions_json TEXT,
  result_json TEXT,
  snapshot_json TEXT,
  error_message TEXT,
  idempotency_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_os_workflows_org_status
  ON agent_os_workflow_runs(organization_id, status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_agent_os_workflows_org_workflow
  ON agent_os_workflow_runs(organization_id, workflow_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS agent_os_action_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  workflow_run_id INTEGER,
  goal_id INTEGER,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id_json TEXT,
  current_value_json TEXT,
  proposed_value_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  expected_impact_json TEXT,
  risk_level TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1,
  requires_approval INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PROPOSED',
  idempotency_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_os_actions_org_status
  ON agent_os_action_proposals(organization_id, status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_agent_os_actions_org_workflow
  ON agent_os_action_proposals(organization_id, workflow_run_id, created_at DESC, id DESC);
`;

/**
 * Creates only the agent-os tables. It deliberately does not require or
 * mutate unrelated host-store tables while remaining part of the API store's
 * schema initialization.
 */
export function initializeAgentOsSchema(db: DatabaseSync): void {
  withTransaction(db, () => {
    db.exec(agentOsSchemaSql);
    const columns = db.prepare("PRAGMA table_info(agent_os_workflow_runs)").all() as Array<{ name?: string }>;
    if (!columns.some((column) => column.name === "snapshot_json")) {
      db.exec("ALTER TABLE agent_os_workflow_runs ADD COLUMN snapshot_json TEXT");
    }
    const actionColumns = db.prepare("PRAGMA table_info(agent_os_action_proposals)").all() as Array<{ name?: string }>;
    if (!actionColumns.some((column) => column.name === "confidence")) {
      db.exec("ALTER TABLE agent_os_action_proposals ADD COLUMN confidence REAL NOT NULL DEFAULT 1");
    }
  });
}
