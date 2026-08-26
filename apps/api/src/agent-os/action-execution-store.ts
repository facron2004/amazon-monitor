import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  buildWhere,
  clampLimit,
  clampOffset,
  nowIso,
  whereEq,
  withTransaction,
} from "../store/sql-utils.js";
import { parseJsonValue, serializeJson } from "./json.js";
import { initializeActionExecutionSchema } from "./action-execution-schema.js";
import {
  actionExecutionStatuses,
  type ActionExecution,
  type ActionExecutionListFilter,
  type ActionExecutionPersistenceAdapter,
  type CreateActionExecutionInput,
  type UpdateActionExecutionInput,
} from "./action-execution-types.js";
import type { JsonValue } from "./types.js";

interface ActionExecutionRow {
  id: number;
  organization_id: number;
  action_proposal_id: number;
  idempotency_key: string;
  executor: string;
  status: string;
  result_json: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  version: number;
}

export function createActionExecutionStore(db: DatabaseSync): ActionExecutionPersistenceAdapter {
  initializeActionExecutionSchema(db);
  const getRow = (id: number, organizationId: number): ActionExecutionRow | undefined => db.prepare(
    "SELECT * FROM agent_os_action_executions WHERE id = ? AND organization_id = ?",
  ).get(id, organizationId) as ActionExecutionRow | undefined;

  return {
    createActionExecution(input: CreateActionExecutionInput): ActionExecution {
      let execution: ActionExecution | undefined;
      withTransaction(db, () => {
        const existing = db.prepare(
          "SELECT * FROM agent_os_action_executions WHERE organization_id = ? AND idempotency_key = ?",
        ).get(input.organizationId, input.idempotencyKey) as ActionExecutionRow | undefined;
        if (existing) {
          execution = mapExecution(existing);
          return;
        }
        const startedAt = nowIso();
        const result = db.prepare(
          `INSERT INTO agent_os_action_executions
             (organization_id, action_proposal_id, idempotency_key, executor, status, started_at)
           VALUES (?, ?, ?, ?, 'RUNNING', ?)`,
        ).run(input.organizationId, input.actionProposalId, input.idempotencyKey, input.executor, startedAt);
        execution = mapExecution(getRow(Number(result.lastInsertRowid), input.organizationId));
      });
      if (!execution) throw new Error("Action execution could not be created");
      return execution;
    },

    getActionExecution(id: number, organizationId: number): ActionExecution | null {
      const row = getRow(id, organizationId);
      return row ? mapExecution(row) : null;
    },

    getActionExecutionByKey(organizationId: number, idempotencyKey: string): ActionExecution | null {
      const row = db.prepare(
        "SELECT * FROM agent_os_action_executions WHERE organization_id = ? AND idempotency_key = ?",
      ).get(organizationId, idempotencyKey) as ActionExecutionRow | undefined;
      return row ? mapExecution(row) : null;
    },

    listActionExecutions(filter: ActionExecutionListFilter): ActionExecution[] {
      const { sql, params } = buildWhere(
        whereEq("organization_id", filter.organizationId),
        whereEq("action_proposal_id", filter.actionProposalId),
        whereEq("status", filter.status),
      );
      const rows = db.prepare(
        `SELECT * FROM agent_os_action_executions ${sql}
         ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?`,
      ).all(
        ...params,
        clampLimit(filter.limit ?? 50, 1000),
        clampOffset(filter.offset),
      ) as unknown as ActionExecutionRow[];
      return rows.map(mapExecution);
    },

    updateActionExecution(
      id: number,
      organizationId: number,
      input: UpdateActionExecutionInput,
    ): ActionExecution | null {
      let execution: ActionExecution | null = null;
      withTransaction(db, () => {
        const current = getRow(id, organizationId);
        if (!current) return;
        if (input.status !== undefined && input.status !== current.status && !allowedTransition(current.status, input.status)) {
          throw Object.assign(new Error(`Invalid execution status transition ${current.status} -> ${input.status}`), { statusCode: 409 });
        }
        const sets: string[] = [];
        const params: SQLInputValue[] = [];
        if (input.status !== undefined) sets.push("status = ?"), params.push(input.status);
        if (input.result !== undefined) sets.push("result_json = ?"), params.push(serializeJson(input.result));
        if (input.errorMessage !== undefined) sets.push("error_message = ?"), params.push(input.errorMessage);
        if (input.completedAt !== undefined) sets.push("completed_at = ?"), params.push(input.completedAt);
        if (sets.length === 0) {
          if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) return;
          execution = mapExecution(current);
          return;
        }
        sets.push("version = version + 1");
        params.push(id, organizationId);
        let sql = `UPDATE agent_os_action_executions SET ${sets.join(", ")} WHERE id = ? AND organization_id = ?`;
        if (input.expectedVersion !== undefined) {
          sql += " AND version = ?";
          params.push(input.expectedVersion);
        }
        const result = db.prepare(sql).run(...params);
        if (result.changes !== 0) {
          const row = getRow(id, organizationId);
          execution = row ? mapExecution(row) : null;
        }
      });
      return execution;
    },
  };
}

function mapExecution(row: ActionExecutionRow | undefined): ActionExecution {
  if (!row) throw new Error("Action execution row not found");
  if (!actionExecutionStatuses.includes(row.status as ActionExecution["status"])) {
    throw new Error(`Invalid action execution status ${row.status}`);
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    actionProposalId: row.action_proposal_id,
    idempotencyKey: row.idempotency_key,
    executor: row.executor,
    status: row.status as ActionExecution["status"],
    result: parseJsonValue(row.result_json, "actionExecution.result") as JsonValue | null,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    version: row.version,
  };
}

function allowedTransition(current: string, next: string): boolean {
  const transitions: Record<string, readonly string[]> = {
    RUNNING: ["SUCCEEDED", "FAILED", "UNCERTAIN"],
    SUCCEEDED: ["VERIFIED", "FAILED"],
    FAILED: [],
    UNCERTAIN: ["RUNNING", "FAILED"],
    VERIFIED: [],
  };
  return transitions[current]?.includes(next) ?? false;
}
