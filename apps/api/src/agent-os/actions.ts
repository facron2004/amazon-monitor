import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { isAllowedActionStatusTransition } from "./action-gateway-policy.js";
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
import {
  assertOrganizationReference,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  requireCreated,
  resolveIdempotencyKey,
} from "./helpers.js";
import { mapActionProposal, type ActionProposalRow } from "./mappers.js";
import type {
  ActionProposal,
  ActionProposalListFilter,
  AgentOsPersistenceAdapter,
  CreateActionProposalInput,
  UpdateActionProposalInput,
} from "./types.js";

type ActionStore = Pick<
  AgentOsPersistenceAdapter,
  "createActionProposal" | "getActionProposal" | "listActionProposals" | "updateActionProposal"
>;

export function createActionStore(db: DatabaseSync): ActionStore {
  function getRow(id: number, organizationId: number): ActionProposalRow | undefined {
    return db.prepare(
      "SELECT * FROM agent_os_action_proposals WHERE id = ? AND organization_id = ?",
    ).get(id, organizationId) as ActionProposalRow | undefined;
  }

  function getByKey(organizationId: number, idempotencyKey: string): ActionProposalRow | undefined {
    return db.prepare(
      "SELECT * FROM agent_os_action_proposals WHERE organization_id = ? AND idempotency_key = ?",
    ).get(organizationId, idempotencyKey) as ActionProposalRow | undefined;
  }

  return {
    createActionProposal(input: CreateActionProposalInput): ActionProposal {
      const idempotencyKey = resolveIdempotencyKey(input.idempotencyKey);
      let proposal: ActionProposal | undefined;
      withTransaction(db, () => {
        const existing = getByKey(input.organizationId, idempotencyKey);
        if (existing) {
          proposal = mapActionProposal(existing);
          return;
        }
        assertOrganizationReference(db, "agent_os_workflow_runs", input.workflowRunId, input.organizationId, "workflowRunId");
        assertOrganizationReference(db, "agent_os_goals", input.goalId, input.organizationId, "goalId");
        const timestamp = nowIso();
        const result = db.prepare(
          `INSERT INTO agent_os_action_proposals
           (organization_id, workflow_run_id, goal_id, action_type, target_type,
            target_id_json, current_value_json, proposed_value_json, reason,
            evidence_json, expected_impact_json, risk_level, requires_approval,
            confidence, status, idempotency_key, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).run(
          input.organizationId,
          input.workflowRunId ?? null,
          input.goalId ?? null,
          input.type,
          input.targetType,
          serializeResourceId(input.targetId),
          serializeJson(input.currentValue),
          serializeRequiredJson(input.proposedValue),
          input.reason,
          serializeRequiredJson(input.evidence),
          serializeJson(input.expectedImpact),
          input.riskLevel,
          input.riskLevel === "LOW" && input.requiresApproval === false ? 0 : 1,
          input.confidence ?? 1,
          "PROPOSED",
          idempotencyKey,
          timestamp,
          timestamp,
        );
        proposal = mapActionProposal(requireCreated(
          getRow(Number(result.lastInsertRowid), input.organizationId),
          "action proposal",
        ));
      });
      return requireCreated(proposal, "action proposal");
    },

    getActionProposal(id: number, organizationId: number): ActionProposal | null {
      const row = getRow(id, organizationId);
      return row ? mapActionProposal(row) : null;
    },

    listActionProposals(filter: ActionProposalListFilter): ActionProposal[] {
      const { sql, params } = buildWhere(
        whereEq("organization_id", filter.organizationId),
        whereEq("workflow_run_id", filter.workflowRunId),
        whereEq("goal_id", filter.goalId),
        whereEq("action_type", filter.type),
        whereEq("status", filter.status),
        whereEq("risk_level", filter.riskLevel),
      );
      const rows = db.prepare(
        `SELECT * FROM agent_os_action_proposals ${sql}
         ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      ).all(
        ...params,
        clampLimit(filter.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
        clampOffset(filter.offset),
      ) as unknown as ActionProposalRow[];
      return rows.map(mapActionProposal);
    },

    updateActionProposal(
      id: number,
      organizationId: number,
      input: UpdateActionProposalInput,
    ): ActionProposal | null {
      let proposal: ActionProposal | null = null;
      withTransaction(db, () => {
        const sets: string[] = [];
        const params: SQLInputValue[] = [];
        if (input.workflowRunId !== undefined) {
          assertOrganizationReference(db, "agent_os_workflow_runs", input.workflowRunId, organizationId, "workflowRunId");
          sets.push("workflow_run_id = ?");
          params.push(input.workflowRunId);
        }
        if (input.goalId !== undefined) {
          assertOrganizationReference(db, "agent_os_goals", input.goalId, organizationId, "goalId");
          sets.push("goal_id = ?");
          params.push(input.goalId);
        }
        if (input.type !== undefined) {
          sets.push("action_type = ?");
          params.push(input.type);
        }
        if (input.targetType !== undefined) {
          sets.push("target_type = ?");
          params.push(input.targetType);
        }
        if (input.targetId !== undefined) {
          sets.push("target_id_json = ?");
          params.push(serializeResourceId(input.targetId));
        }
        if (input.currentValue !== undefined) {
          sets.push("current_value_json = ?");
          params.push(serializeJson(input.currentValue));
        }
        if (input.proposedValue !== undefined) {
          sets.push("proposed_value_json = ?");
          params.push(serializeRequiredJson(input.proposedValue));
        }
        if (input.reason !== undefined) {
          sets.push("reason = ?");
          params.push(input.reason);
        }
        if (input.evidence !== undefined) {
          sets.push("evidence_json = ?");
          params.push(serializeRequiredJson(input.evidence));
        }
        if (input.expectedImpact !== undefined) {
          sets.push("expected_impact_json = ?");
          params.push(serializeJson(input.expectedImpact));
        }
        if (input.riskLevel !== undefined) {
          sets.push("risk_level = ?");
          params.push(input.riskLevel);
        }
        if (input.confidence !== undefined) {
          sets.push("confidence = ?");
          params.push(input.confidence);
        }
        if (input.requiresApproval !== undefined) {
          const current = getRow(id, organizationId);
          const effectiveRisk = input.riskLevel ?? current?.risk_level;
          sets.push("requires_approval = ?");
          params.push(input.requiresApproval === false && effectiveRisk === "LOW" ? 0 : 1);
        }
        if (input.status !== undefined) {
          const current = getRow(id, organizationId);
          if (current && current.status !== input.status && !isAllowedActionStatusTransition(current.status as ActionProposal["status"], input.status)) {
            throw Object.assign(new Error(`Invalid action status transition ${current.status} -> ${input.status}`), { statusCode: 409 });
          }
          sets.push("status = ?");
          params.push(input.status);
        }
        if (sets.length === 0) {
          const row = getRow(id, organizationId);
          if (row && input.expectedVersion !== undefined && row.version !== input.expectedVersion) {
            return;
          }
          proposal = row ? mapActionProposal(row) : null;
          return;
        }
        sets.push("version = version + 1", "updated_at = ?");
        params.push(nowIso(), id, organizationId);
        let sql = `UPDATE agent_os_action_proposals SET ${sets.join(", ")} WHERE id = ? AND organization_id = ?`;
        if (input.expectedVersion !== undefined) {
          sql += " AND version = ?";
          params.push(input.expectedVersion);
        }
        const result = db.prepare(sql).run(...params);
        if (result.changes !== 0) {
          const row = getRow(id, organizationId);
          proposal = row ? mapActionProposal(row) : null;
        }
      });
      return proposal;
    },
  };
}
