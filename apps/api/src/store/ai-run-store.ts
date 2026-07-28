import type { DatabaseSync } from "node:sqlite";
import type { AiActionFeedback, AiAgentOutput, AiRun, AiRunListFilter, AiRunStatus } from "@amazon-monitor/shared";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq } from "./sql-utils.js";
import type { Store } from "./types.js";

type AiRunStoreMethods = Pick<
  Store,
  | "createAiRun"
  | "getAiRun"
  | "listAiRuns"
  | "countAiRuns"
  | "upsertAiActionFeedback"
  | "listAiActionFeedback"
  | "listAiActionFeedbackForRuns"
>;

interface AiRunRow {
  id: number;
  org_id: number;
  agent_type: string;
  input_context_json: string;
  output_json: string | null;
  model: string;
  status: string;
  token_usage: number | null;
  error_message: string | null;
  created_at: string;
}

interface AiActionFeedbackRow {
  run_id: number;
  org_id: number;
  user_id: number;
  action_index: number;
  value: string;
  updated_at: string;
}

export function createAiRunStore(db: DatabaseSync): AiRunStoreMethods {
  return {
    createAiRun(input) {
      const outputJson = input.output ? JSON.stringify(input.output) : null;
      const result = db
        .prepare(
          `INSERT INTO ai_runs
           (org_id, agent_type, input_context_json, output_json, model, status, token_usage, error_message, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.orgId,
          input.agentType,
          input.inputContextJson,
          outputJson,
          input.model,
          input.status,
          input.tokenUsage ?? null,
          input.errorMessage ?? null,
          nowIso()
        );
      const row = db.prepare("SELECT * FROM ai_runs WHERE id = ?").get(Number(result.lastInsertRowid)) as unknown as AiRunRow;
      return mapAiRun(row);
    },

    getAiRun(id, orgId) {
      const row = db.prepare("SELECT * FROM ai_runs WHERE id = ? AND org_id = ?").get(id, orgId) as AiRunRow | undefined;
      return row ? mapAiRun(row) : null;
    },

    listAiRuns(filter: AiRunListFilter = {}) {
      const { sql, params } = buildWhere(
        whereEq("org_id", filter.orgId),
        whereEq("agent_type", filter.agentType),
        whereEq("status", filter.status)
      );
      const limit = clampLimit(filter.limit ?? 50);
      const offset = clampOffset(filter.offset);
      const rows = db
        .prepare(`SELECT * FROM ai_runs ${sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset) as unknown as AiRunRow[];
      return rows.map(mapAiRun);
    },

    countAiRuns(filter: AiRunListFilter = {}) {
      const { sql, params } = buildWhere(
        whereEq("org_id", filter.orgId),
        whereEq("agent_type", filter.agentType),
        whereEq("status", filter.status)
      );
      const row = db.prepare(`SELECT COUNT(*) AS total FROM ai_runs ${sql}`).get(...params) as
        | { total: number }
        | undefined;
      return row?.total ?? 0;
    },

    upsertAiActionFeedback(input) {
      const updatedAt = nowIso();
      db.prepare(
        `INSERT INTO ai_action_feedback (run_id, org_id, user_id, action_index, value, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_id, action_index, user_id) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`
      ).run(input.runId, input.orgId, input.userId, input.actionIndex, input.value, updatedAt);
      return {
        ...input,
        updatedAt
      };
    },

    listAiActionFeedback(input) {
      if (input.runIds.length === 0) return [];
      const runIdsJson = JSON.stringify(input.runIds);
      const rows = db.prepare(
        `SELECT * FROM ai_action_feedback
         WHERE org_id = ? AND user_id = ?
           AND run_id IN (SELECT value FROM json_each(?))
         ORDER BY run_id DESC, action_index ASC`
      ).all(input.orgId, input.userId, runIdsJson) as unknown as AiActionFeedbackRow[];
      return rows.map(mapAiActionFeedback);
    },

    listAiActionFeedbackForRuns(input) {
      if (input.runIds.length === 0) return [];
      const runIdsJson = JSON.stringify(input.runIds);
      const rows = db.prepare(
        `SELECT * FROM ai_action_feedback
         WHERE org_id = ?
           AND run_id IN (SELECT value FROM json_each(?))
         ORDER BY run_id DESC, action_index ASC, user_id ASC`
      ).all(input.orgId, runIdsJson) as unknown as AiActionFeedbackRow[];
      return rows.map(mapAiActionFeedback);
    }
  };
}

function mapAiRun(row: AiRunRow): AiRun {
  return {
    id: row.id,
    orgId: row.org_id,
    agentType: row.agent_type as AiRun["agentType"],
    inputContextJson: row.input_context_json,
    outputJson: row.output_json,
    output: row.output_json ? parseAiOutput(row.output_json) : null,
    model: row.model,
    status: mapAiRunStatus(row.status),
    tokenUsage: row.token_usage,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    actionFeedback: []
  };
}

function mapAiActionFeedback(row: AiActionFeedbackRow): AiActionFeedback {
  return {
    runId: row.run_id,
    orgId: row.org_id,
    userId: row.user_id,
    actionIndex: row.action_index,
    value: row.value === "down" ? "down" : "up",
    updatedAt: row.updated_at
  };
}

function mapAiRunStatus(value: string): AiRunStatus {
  return value === "failed" ? "failed" : "success";
}

function parseAiOutput(value: string): AiAgentOutput | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as AiAgentOutput : null;
  } catch {
    return null;
  }
}
