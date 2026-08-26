import type { DatabaseSync } from "node:sqlite";
import { withTransaction } from "../store/sql-utils.js";

export const intelligenceSchemaSql = `
CREATE TABLE IF NOT EXISTS agent_os_intelligence_opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  opportunity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  target_type TEXT,
  target_id_json TEXT,
  goal_id INTEGER,
  source_type TEXT,
  source_id TEXT,
  source_workflow_run_id INTEGER,
  source_action_proposal_id INTEGER,
  signal_json TEXT,
  score REAL,
  expected_impact_json TEXT,
  risk_json TEXT,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'IDENTIFIED',
  details_json TEXT,
  idempotency_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_os_intel_opportunity_org_status
  ON agent_os_intelligence_opportunities(organization_id, status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_agent_os_intel_opportunity_org_target
  ON agent_os_intelligence_opportunities(organization_id, target_type, target_id_json);

CREATE TABLE IF NOT EXISTS agent_os_intelligence_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  issue TEXT NOT NULL,
  root_causes_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  options_json TEXT NOT NULL,
  recommended_option_json TEXT,
  expected_impact_json TEXT,
  risk_json TEXT,
  confidence REAL,
  constraints_json TEXT,
  required_approval INTEGER NOT NULL DEFAULT 1,
  target_type TEXT,
  target_id_json TEXT,
  goal_id INTEGER,
  source_type TEXT,
  source_id TEXT,
  source_workflow_run_id INTEGER,
  source_action_proposal_id INTEGER,
  source_opportunity_id INTEGER,
  status TEXT NOT NULL DEFAULT 'PROPOSED',
  idempotency_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_os_intel_decision_org_status
  ON agent_os_intelligence_decisions(organization_id, status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_agent_os_intel_decision_org_source
  ON agent_os_intelligence_decisions(organization_id, source_opportunity_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS agent_os_intelligence_experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  hypothesis_json TEXT NOT NULL,
  action_json TEXT,
  observation_json TEXT,
  result_json TEXT,
  learning_json TEXT,
  before_json TEXT,
  after_json TEXT,
  delta_json TEXT,
  confidence REAL,
  attribution TEXT,
  observation_window_days INTEGER,
  target_type TEXT,
  target_id_json TEXT,
  goal_id INTEGER,
  source_type TEXT,
  source_id TEXT,
  source_workflow_run_id INTEGER,
  source_action_proposal_id INTEGER,
  source_opportunity_id INTEGER,
  source_decision_id INTEGER,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  idempotency_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_os_intel_experiment_org_status
  ON agent_os_intelligence_experiments(organization_id, status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_agent_os_intel_experiment_org_source
  ON agent_os_intelligence_experiments(organization_id, source_decision_id, created_at DESC, id DESC);
`;

export function initializeIntelligenceSchema(db: DatabaseSync): void {
  withTransaction(db, () => db.exec(intelligenceSchemaSql));
}
