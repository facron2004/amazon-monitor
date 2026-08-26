import type { DatabaseSync } from "node:sqlite";
import { withTransaction } from "../store/sql-utils.js";

export const actionExecutionSchemaSql = `
CREATE TABLE IF NOT EXISTS agent_os_action_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  action_proposal_id INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  executor TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  result_json TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (organization_id, action_proposal_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_os_action_exec_org_status
  ON agent_os_action_executions(organization_id, status, started_at DESC, id DESC);
`;

export function initializeActionExecutionSchema(db: DatabaseSync): void {
  withTransaction(db, () => db.exec(actionExecutionSchemaSql));
}
