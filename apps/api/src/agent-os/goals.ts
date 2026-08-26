import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  buildWhere,
  clampLimit,
  clampOffset,
  nowIso,
  whereEq,
  withTransaction,
} from "../store/sql-utils.js";
import {
  serializeJson,
  serializeRequiredJson,
  serializeResourceId,
} from "./json.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, requireCreated, resolveIdempotencyKey } from "./helpers.js";
import { mapGoal, type GoalRow } from "./mappers.js";
import type {
  AgentOsPersistenceAdapter,
  CreateGoalInput,
  Goal,
  GoalListFilter,
  UpdateGoalInput,
} from "./types.js";

type GoalStore = Pick<AgentOsPersistenceAdapter, "createGoal" | "getGoal" | "listGoals" | "updateGoal">;

export function createGoalStore(db: DatabaseSync): GoalStore {
  function getRow(id: number, organizationId: number): GoalRow | undefined {
    return db.prepare(
      "SELECT * FROM agent_os_goals WHERE id = ? AND organization_id = ?",
    ).get(id, organizationId) as GoalRow | undefined;
  }

  function getByKey(organizationId: number, idempotencyKey: string): GoalRow | undefined {
    return db.prepare(
      "SELECT * FROM agent_os_goals WHERE organization_id = ? AND idempotency_key = ?",
    ).get(organizationId, idempotencyKey) as GoalRow | undefined;
  }

  return {
    createGoal(input: CreateGoalInput): Goal {
      const idempotencyKey = resolveIdempotencyKey(input.idempotencyKey);
      let goal: Goal | undefined;
      withTransaction(db, () => {
        const existing = getByKey(input.organizationId, idempotencyKey);
        if (existing) {
          goal = mapGoal(existing);
          return;
        }
        const timestamp = nowIso();
        const result = db.prepare(
          `INSERT INTO agent_os_goals
           (organization_id, store_id_json, sku_id_json, goal_type, metric,
            target_value_json, current_value_json, deadline, priority, status,
            constraints_json, idempotency_key, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).run(
          input.organizationId,
          serializeResourceId(input.storeId),
          serializeResourceId(input.skuId),
          input.type,
          input.metric,
          serializeRequiredJson(input.targetValue),
          serializeJson(input.currentValue),
          input.deadline ?? null,
          input.priority ?? 0,
          input.status ?? "ACTIVE",
          serializeRequiredJson(input.constraints ?? {}),
          idempotencyKey,
          timestamp,
          timestamp,
        );
        goal = mapGoal(requireCreated(
          getRow(Number(result.lastInsertRowid), input.organizationId),
          "goal",
        ));
      });
      return requireCreated(goal, "goal");
    },

    getGoal(id: number, organizationId: number): Goal | null {
      const row = getRow(id, organizationId);
      return row ? mapGoal(row) : null;
    },

    listGoals(filter: GoalListFilter): Goal[] {
      const { sql, params } = buildWhere(
        whereEq("organization_id", filter.organizationId),
        whereEq("goal_type", filter.type),
        whereEq("status", filter.status),
        filter.storeId === undefined
          ? null
          : whereEq("store_id_json", serializeResourceId(filter.storeId)),
        filter.skuId === undefined
          ? null
          : whereEq("sku_id_json", serializeResourceId(filter.skuId)),
      );
      const rows = db.prepare(
        `SELECT * FROM agent_os_goals ${sql}
         ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      ).all(
        ...params,
        clampLimit(filter.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
        clampOffset(filter.offset),
      ) as unknown as GoalRow[];
      return rows.map(mapGoal);
    },

    updateGoal(id: number, organizationId: number, input: UpdateGoalInput): Goal | null {
      let goal: Goal | null = null;
      withTransaction(db, () => {
        const sets: string[] = [];
        const params: SQLInputValue[] = [];
        if (input.storeId !== undefined) {
          sets.push("store_id_json = ?");
          params.push(serializeResourceId(input.storeId));
        }
        if (input.skuId !== undefined) {
          sets.push("sku_id_json = ?");
          params.push(serializeResourceId(input.skuId));
        }
        if (input.type !== undefined) {
          sets.push("goal_type = ?");
          params.push(input.type);
        }
        if (input.metric !== undefined) {
          sets.push("metric = ?");
          params.push(input.metric);
        }
        if (input.targetValue !== undefined) {
          sets.push("target_value_json = ?");
          params.push(serializeRequiredJson(input.targetValue));
        }
        if (input.currentValue !== undefined) {
          sets.push("current_value_json = ?");
          params.push(serializeJson(input.currentValue));
        }
        if (input.deadline !== undefined) {
          sets.push("deadline = ?");
          params.push(input.deadline);
        }
        if (input.priority !== undefined) {
          sets.push("priority = ?");
          params.push(input.priority);
        }
        if (input.status !== undefined) {
          sets.push("status = ?");
          params.push(input.status);
        }
        if (input.constraints !== undefined) {
          sets.push("constraints_json = ?");
          params.push(serializeRequiredJson(input.constraints));
        }
        if (sets.length === 0) {
          const row = getRow(id, organizationId);
          if (row && input.expectedVersion !== undefined && row.version !== input.expectedVersion) {
            return;
          }
          goal = row ? mapGoal(row) : null;
          return;
        }
        sets.push("version = version + 1", "updated_at = ?");
        params.push(nowIso(), id, organizationId);
        let sql = `UPDATE agent_os_goals SET ${sets.join(", ")} WHERE id = ? AND organization_id = ?`;
        if (input.expectedVersion !== undefined) {
          sql += " AND version = ?";
          params.push(input.expectedVersion);
        }
        const result = db.prepare(sql).run(...params);
        if (result.changes !== 0) {
          const row = getRow(id, organizationId);
          goal = row ? mapGoal(row) : null;
        }
      });
      return goal;
    },
  };
}
