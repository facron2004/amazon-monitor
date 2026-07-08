import type { DatabaseSync } from "node:sqlite";
import type { AiAgentOutput, AiRun, AiRunListFilter, AiRunStatus } from "@amazon-monitor/shared";
import { buildWhere, clampLimit, clampOffset, nowIso, whereEq } from "./sql-utils.js";
import type { Store } from "./types.js";

type AiRunStoreMethods = Pick<Store, "createAiRun" | "getAiRun" | "listAiRuns">;

interface AiRunRow {
  id: number;
  agent_type: string;
  input_context_json: string;
  output_json: string | null;
  model: string;
  status: string;
  token_usage: number | null;
  error_message: string | null;
  created_at: string;
}

export function createAiRunStore(db: DatabaseSync): AiRunStoreMethods {
  return {
    createAiRun(input) {
      const outputJson = input.output ? JSON.stringify(input.output) : null;
      const result = db
        .prepare(
          `INSERT INTO ai_runs
           (agent_type, input_context_json, output_json, model, status, token_usage, error_message, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
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

    getAiRun(id) {
      const row = db.prepare("SELECT * FROM ai_runs WHERE id = ?").get(id) as AiRunRow | undefined;
      return row ? mapAiRun(row) : null;
    },

    listAiRuns(filter: AiRunListFilter = {}) {
      const { sql, params } = buildWhere(
        whereEq("agent_type", filter.agentType),
        whereEq("status", filter.status)
      );
      const limit = clampLimit(filter.limit ?? 50);
      const offset = clampOffset(filter.offset);
      const rows = db
        .prepare(`SELECT * FROM ai_runs ${sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset) as unknown as AiRunRow[];
      return rows.map(mapAiRun);
    }
  };
}

function mapAiRun(row: AiRunRow): AiRun {
  return {
    id: row.id,
    agentType: row.agent_type as AiRun["agentType"],
    inputContextJson: row.input_context_json,
    outputJson: row.output_json,
    output: row.output_json ? parseAiOutput(row.output_json) : null,
    model: row.model,
    status: mapAiRunStatus(row.status),
    tokenUsage: row.token_usage,
    errorMessage: row.error_message,
    createdAt: row.created_at
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
