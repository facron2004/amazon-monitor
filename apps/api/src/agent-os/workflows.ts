import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  buildWhere,
  clampLimit,
  clampOffset,
  nowIso,
  whereEq,
  withTransaction,
} from "../store/sql-utils.js";
import { serializeJson, serializeRequiredJson } from "./json.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, requireCreated, resolveIdempotencyKey } from "./helpers.js";
import { mapWorkflowRun, type WorkflowRunRow } from "./mappers.js";
import type {
  AgentOsPersistenceAdapter,
  CreateWorkflowRunInput,
  UpdateWorkflowRunInput,
  WorkflowRun,
  WorkflowRunListFilter,
} from "./types.js";

type WorkflowStore = Pick<
  AgentOsPersistenceAdapter,
  "createWorkflowRun" | "getWorkflowRun" | "listWorkflowRuns" | "updateWorkflowRun"
>;

export function createWorkflowStore(db: DatabaseSync): WorkflowStore {
  function getRow(id: number, organizationId: number): WorkflowRunRow | undefined {
    return db.prepare(
      "SELECT * FROM agent_os_workflow_runs WHERE id = ? AND organization_id = ?",
    ).get(id, organizationId) as WorkflowRunRow | undefined;
  }

  function getByKey(organizationId: number, idempotencyKey: string): WorkflowRunRow | undefined {
    return db.prepare(
      "SELECT * FROM agent_os_workflow_runs WHERE organization_id = ? AND idempotency_key = ?",
    ).get(organizationId, idempotencyKey) as WorkflowRunRow | undefined;
  }

  return {
    createWorkflowRun(input: CreateWorkflowRunInput): WorkflowRun {
      const idempotencyKey = resolveIdempotencyKey(input.idempotencyKey);
      let run: WorkflowRun | undefined;
      withTransaction(db, () => {
        const existing = getByKey(input.organizationId, idempotencyKey);
        if (existing) {
          run = mapWorkflowRun(existing);
          return;
        }
        const timestamp = nowIso();
        const result = db.prepare(
          `INSERT INTO agent_os_workflow_runs
           (organization_id, workflow_id, trigger_type, trigger_source, status,
            started_at, completed_at, current_node, context_json, evidence_json,
            plan_json, actions_json, result_json, snapshot_json, error_message,
            idempotency_key, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).run(
          input.organizationId,
          input.workflowId,
          input.triggerType,
          input.triggerSource ?? null,
          input.status ?? "PENDING",
          input.startedAt ?? null,
          input.currentNode ?? null,
          serializeRequiredJson(input.context ?? {}),
          serializeJson(input.evidence),
          serializeJson(input.plan),
          serializeJson(input.actions),
          serializeJson(input.result),
          serializeJson(input.snapshot),
          input.errorMessage ?? null,
          idempotencyKey,
          timestamp,
          timestamp,
        );
        run = mapWorkflowRun(requireCreated(
          getRow(Number(result.lastInsertRowid), input.organizationId),
          "workflow run",
        ));
      });
      return requireCreated(run, "workflow run");
    },

    getWorkflowRun(id: number, organizationId: number): WorkflowRun | null {
      const row = getRow(id, organizationId);
      return row ? mapWorkflowRun(row) : null;
    },

    listWorkflowRuns(filter: WorkflowRunListFilter): WorkflowRun[] {
      const { sql, params } = buildWhere(
        whereEq("organization_id", filter.organizationId),
        whereEq("workflow_id", filter.workflowId),
        whereEq("status", filter.status),
        whereEq("trigger_type", filter.triggerType),
      );
      const rows = db.prepare(
        `SELECT * FROM agent_os_workflow_runs ${sql}
         ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      ).all(
        ...params,
        clampLimit(filter.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
        clampOffset(filter.offset),
      ) as unknown as WorkflowRunRow[];
      return rows.map(mapWorkflowRun);
    },

    updateWorkflowRun(
      id: number,
      organizationId: number,
      input: UpdateWorkflowRunInput,
    ): WorkflowRun | null {
      let run: WorkflowRun | null = null;
      withTransaction(db, () => {
        const sets: string[] = [];
        const params: SQLInputValue[] = [];
        if (input.workflowId !== undefined) {
          sets.push("workflow_id = ?");
          params.push(input.workflowId);
        }
        if (input.triggerType !== undefined) {
          sets.push("trigger_type = ?");
          params.push(input.triggerType);
        }
        if (input.triggerSource !== undefined) {
          sets.push("trigger_source = ?");
          params.push(input.triggerSource);
        }
        if (input.status !== undefined) {
          sets.push("status = ?");
          params.push(input.status);
        }
        if (input.startedAt !== undefined) {
          sets.push("started_at = ?");
          params.push(input.startedAt);
        }
        if (input.completedAt !== undefined) {
          sets.push("completed_at = ?");
          params.push(input.completedAt);
        }
        if (input.currentNode !== undefined) {
          sets.push("current_node = ?");
          params.push(input.currentNode);
        }
        if (input.context !== undefined) {
          sets.push("context_json = ?");
          params.push(serializeRequiredJson(input.context));
        }
        if (input.evidence !== undefined) {
          sets.push("evidence_json = ?");
          params.push(serializeJson(input.evidence));
        }
        if (input.plan !== undefined) {
          sets.push("plan_json = ?");
          params.push(serializeJson(input.plan));
        }
        if (input.actions !== undefined) {
          sets.push("actions_json = ?");
          params.push(serializeJson(input.actions));
        }
        if (input.result !== undefined) {
          sets.push("result_json = ?");
          params.push(serializeJson(input.result));
        }
        if (input.snapshot !== undefined) {
          sets.push("snapshot_json = ?");
          params.push(serializeJson(input.snapshot));
        }
        if (input.errorMessage !== undefined) {
          sets.push("error_message = ?");
          params.push(input.errorMessage);
        }
        if (sets.length === 0) {
          const row = getRow(id, organizationId);
          if (row && input.expectedVersion !== undefined && row.version !== input.expectedVersion) {
            return;
          }
          run = row ? mapWorkflowRun(row) : null;
          return;
        }
        sets.push("version = version + 1", "updated_at = ?");
        params.push(nowIso(), id, organizationId);
        let sql = `UPDATE agent_os_workflow_runs SET ${sets.join(", ")} WHERE id = ? AND organization_id = ?`;
        if (input.expectedVersion !== undefined) {
          sql += " AND version = ?";
          params.push(input.expectedVersion);
        }
        const result = db.prepare(sql).run(...params);
        if (result.changes !== 0) {
          const row = getRow(id, organizationId);
          run = row ? mapWorkflowRun(row) : null;
        }
      });
      return run;
    },
  };
}
