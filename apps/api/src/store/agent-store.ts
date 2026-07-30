import type { DatabaseSync } from "node:sqlite";
import {
  buildWhere, clampLimit, clampOffset, nowIso, whereEq, withTransaction,
} from "./sql-utils.js";
import {
  mapActionApproval, mapActionExecution, mapActionProposal, mapAgentMessage,
  mapAgentRun, mapAgentRunEvent, mapAgentSession, mapAgentStep, mapAgentToolCall,
  type ActionApprovalRow,
  type ActionExecutionRow, type ActionProposalRow, type AgentMessageRow,
  type AgentRunEventRow, type AgentRunRow, type AgentSessionRow,
  type AgentStepRow, type AgentToolCallRow,
} from "./agent-store-mappers.js";
import type { Store } from "./types.js";

type AgentStoreMethods = Pick<Store,
  "createAgentSession" | "getAgentSession" | "listAgentSessions" |
  "appendAgentMessage" | "listAgentMessages" | "appendAgentSessionItems" |
  "listAgentSessionItems" | "popAgentSessionItem" | "clearAgentSessionItems" |
  "createAgentRun" | "getAgentRun" | "getAgentRecoveryRunForJob" |
  "listAgentRuns" | "updateAgentRun" | "appendAgentRunEvent" |
  "listAgentRunEvents" | "createAgentStep" | "completeAgentStep" |
  "listAgentSteps" | "createAgentToolCall" | "completeAgentToolCall" |
  "listAgentToolCalls" | "createActionProposal" | "getActionProposal" |
  "listActionProposals" | "updateActionProposal" | "recordActionApproval" |
  "decideActionProposal" | "listActionApprovals" | "modifyActionProposal" |
  "createActionExecution" | "beginActionExecution" |
  "getActionExecutionByKey" | "listActionExecutions" | "updateActionExecution"
  | "finishActionExecution"
>;

export function createAgentStore(db: DatabaseSync): AgentStoreMethods {
  return {
    createAgentSession(input) {
      const timestamp = nowIso();
      const result = db.prepare(
        `INSERT INTO agent_sessions (org_id, user_id, title, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`,
      ).run(input.orgId, input.userId, input.title, timestamp, timestamp);
      return getSessionRow(db, Number(result.lastInsertRowid));
    },
    getAgentSession(id, orgId) {
      const row = db.prepare("SELECT * FROM agent_sessions WHERE id = ? AND org_id = ?")
        .get(id, orgId) as AgentSessionRow | undefined;
      return row ? mapAgentSession(row) : null;
    },
    listAgentSessions(filter) {
      const { sql, params } = buildWhere(
        whereEq("org_id", filter.orgId), whereEq("user_id", filter.userId),
      );
      const rows = db.prepare(
        `SELECT * FROM agent_sessions ${sql}
         ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      ).all(...params, clampLimit(filter.limit ?? 50), clampOffset(filter.offset)) as
        unknown as AgentSessionRow[];
      return rows.map(mapAgentSession);
    },
    appendAgentMessage(input) {
      const result = db.prepare(
        `INSERT INTO agent_messages (session_id, run_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(input.sessionId, input.runId ?? null, input.role, input.content, nowIso());
      const row = db.prepare("SELECT * FROM agent_messages WHERE id = ?")
        .get(Number(result.lastInsertRowid)) as unknown as AgentMessageRow;
      return mapAgentMessage(row);
    },
    listAgentMessages(sessionId, limit = 200, offset = 0) {
      const rows = db.prepare(
        `SELECT * FROM agent_messages WHERE session_id = ?
         ORDER BY id ASC LIMIT ? OFFSET ?`,
      ).all(sessionId, clampLimit(limit, 500), clampOffset(offset)) as
        unknown as AgentMessageRow[];
      return rows.map(mapAgentMessage);
    },
    appendAgentSessionItems(sessionId, itemJson) {
      const insert = db.prepare(
        `INSERT INTO agent_messages
         (session_id, run_id, role, content, sdk_item_json, created_at)
         VALUES (?, NULL, 'system', '[sdk session item]', ?, ?)`,
      );
      for (const item of itemJson) insert.run(sessionId, item, nowIso());
    },
    listAgentSessionItems(sessionId, limit = 1000) {
      const rows = db.prepare(
        `SELECT sdk_item_json FROM (
           SELECT id, sdk_item_json FROM agent_messages
           WHERE session_id = ? AND sdk_item_json IS NOT NULL
           ORDER BY id DESC LIMIT ?
         ) ORDER BY id ASC`,
      ).all(sessionId, clampLimit(limit, 1000)) as unknown as Array<{
        sdk_item_json: string;
      }>;
      return rows.map((row) => row.sdk_item_json);
    },
    popAgentSessionItem(sessionId) {
      const row = db.prepare(
        `SELECT id, sdk_item_json FROM agent_messages
         WHERE session_id = ? AND sdk_item_json IS NOT NULL
         ORDER BY id DESC LIMIT 1`,
      ).get(sessionId) as unknown as { id: number; sdk_item_json: string } | undefined;
      if (!row) return null;
      db.prepare("DELETE FROM agent_messages WHERE id = ?").run(row.id);
      return row.sdk_item_json;
    },
    clearAgentSessionItems(sessionId) {
      db.prepare(
        "DELETE FROM agent_messages WHERE session_id = ? AND sdk_item_json IS NOT NULL",
      ).run(sessionId);
    },
    createAgentRun(input) {
      const timestamp = nowIso();
      const result = db.prepare(
        `INSERT INTO agent_runs
         (session_id, org_id, user_id, task_type, input_text, status, model,
          fallback_model, recovery_of_run_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?, ?)`,
      ).run(
        input.sessionId, input.orgId, input.userId, input.taskType, input.input,
        input.model, input.fallbackModel, input.recoveryOfRunId ?? null,
        timestamp, timestamp,
      );
      return getRunRow(db, Number(result.lastInsertRowid));
    },
    getAgentRun(id, orgId) {
      const row = db.prepare("SELECT * FROM agent_runs WHERE id = ? AND org_id = ?")
        .get(id, orgId) as AgentRunRow | undefined;
      return row ? mapAgentRun(row) : null;
    },
    listAgentRuns(filter) {
      const { sql, params } = buildWhere(
        whereEq("org_id", filter.orgId), whereEq("session_id", filter.sessionId),
        whereEq("status", filter.status),
      );
      const rows = db.prepare(
        `SELECT * FROM agent_runs ${sql}
         ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      ).all(...params, clampLimit(filter.limit ?? 50), clampOffset(filter.offset)) as
        unknown as AgentRunRow[];
      return rows.map(mapAgentRun);
    },
    getAgentRecoveryRunForJob(jobId) {
      const row = db.prepare(
        `SELECT r.*, e.payload_json AS recovery_payload_json
         FROM agent_runs r
         INNER JOIN agent_run_events e ON e.run_id = r.id
         WHERE r.task_type = 'recovery' AND r.status = 'created'
           AND e.event_type = 'recovery.waiting_for_collection'
           AND CAST(json_extract(e.payload_json, '$.jobId') AS INTEGER) = ?
         ORDER BY r.id DESC LIMIT 1`,
      ).get(jobId) as (AgentRunRow & { recovery_payload_json: string }) | undefined;
      if (!row) return null;
      const payload = parseJsonRecord(row.recovery_payload_json);
      return {
        run: mapAgentRun(row),
        freshnessInput: isRecord(payload.freshnessInput)
          ? payload.freshnessInput
          : {},
      };
    },
    updateAgentRun(id, orgId, input) {
      const hasOutput = Object.hasOwn(input, "output");
      const hasError = Object.hasOwn(input, "errorMessage");
      const hasCompletedAt = Object.hasOwn(input, "completedAt");
      db.prepare(
        `UPDATE agent_runs SET status = COALESCE(?, status),
         output_json = CASE WHEN ? = 1 THEN ? ELSE output_json END,
         error_message = CASE WHEN ? = 1 THEN ? ELSE error_message END,
         completed_at = CASE WHEN ? = 1 THEN ? ELSE completed_at END,
         updated_at = ? WHERE id = ? AND org_id = ?`,
      ).run(
        input.status ?? null, hasOutput ? 1 : 0,
        input.output ? JSON.stringify(input.output) : null,
        hasError ? 1 : 0, input.errorMessage ?? null,
        hasCompletedAt ? 1 : 0, input.completedAt ?? null,
        nowIso(), id, orgId,
      );
      return this.getAgentRun(id, orgId);
    },
    appendAgentRunEvent(input) {
      const result = db.prepare(
        `INSERT INTO agent_run_events
         (run_id, sequence, event_type, payload_json, created_at)
         SELECT ?, COALESCE(MAX(sequence), 0) + 1, ?, ?, ?
         FROM agent_run_events WHERE run_id = ?`,
      ).run(input.runId, input.type, JSON.stringify(input.payload ?? {}), nowIso(), input.runId);
      const row = db.prepare("SELECT * FROM agent_run_events WHERE id = ?")
        .get(Number(result.lastInsertRowid)) as unknown as AgentRunEventRow;
      return mapAgentRunEvent(row);
    },
    listAgentRunEvents(runId, afterSequence = 0) {
      const rows = db.prepare(
        `SELECT * FROM agent_run_events WHERE run_id = ? AND sequence > ?
         ORDER BY sequence ASC LIMIT 1000`,
      ).all(runId, Math.max(0, Math.floor(afterSequence))) as unknown as AgentRunEventRow[];
      return rows.map(mapAgentRunEvent);
    },
    createAgentStep(input) {
      const timestamp = nowIso();
      const result = db.prepare(
        `INSERT INTO agent_steps
         (run_id, sequence, title, status, started_at)
         SELECT ?, COALESCE(MAX(sequence), 0) + 1, ?, 'running', ?
         FROM agent_steps WHERE run_id = ?`,
      ).run(input.runId, input.title, timestamp, input.runId);
      const row = db.prepare("SELECT * FROM agent_steps WHERE id = ?")
        .get(Number(result.lastInsertRowid)) as unknown as AgentStepRow;
      return mapAgentStep(row);
    },
    completeAgentStep(id, status, errorMessage = null) {
      db.prepare(
        `UPDATE agent_steps SET status = ?, completed_at = ?, error_message = ?
         WHERE id = ? AND status = 'running'`,
      ).run(status, nowIso(), errorMessage, id);
      const row = db.prepare("SELECT * FROM agent_steps WHERE id = ?")
        .get(id) as AgentStepRow | undefined;
      return row ? mapAgentStep(row) : null;
    },
    listAgentSteps(runId) {
      const rows = db.prepare(
        "SELECT * FROM agent_steps WHERE run_id = ? ORDER BY sequence ASC LIMIT 1000",
      ).all(runId) as unknown as AgentStepRow[];
      return rows.map(mapAgentStep);
    },
    createAgentToolCall(input) {
      const result = db.prepare(
        `INSERT INTO agent_tool_calls
         (run_id, step_id, tool_name, arguments_json, status, started_at)
         VALUES (?, ?, ?, ?, 'running', ?)`,
      ).run(
        input.runId, input.stepId ?? null, input.toolName,
        JSON.stringify(input.arguments), nowIso(),
      );
      const row = db.prepare("SELECT * FROM agent_tool_calls WHERE id = ?")
        .get(Number(result.lastInsertRowid)) as unknown as AgentToolCallRow;
      return mapAgentToolCall(row);
    },
    completeAgentToolCall(id, input) {
      db.prepare(
        `UPDATE agent_tool_calls SET status = ?, result_json = ?,
         completed_at = ?, error_message = ? WHERE id = ? AND status = 'running'`,
      ).run(
        input.status, input.result ? JSON.stringify(input.result) : null,
        nowIso(), input.errorMessage ?? null, id,
      );
      const row = db.prepare("SELECT * FROM agent_tool_calls WHERE id = ?")
        .get(id) as AgentToolCallRow | undefined;
      return row ? mapAgentToolCall(row) : null;
    },
    listAgentToolCalls(runId) {
      const rows = db.prepare(
        "SELECT * FROM agent_tool_calls WHERE run_id = ? ORDER BY id ASC LIMIT 1000",
      ).all(runId) as unknown as AgentToolCallRow[];
      return rows.map(mapAgentToolCall);
    },
    createActionProposal(input) {
      const existing = db.prepare(
        `SELECT * FROM action_proposals
         WHERE org_id = ? AND idempotency_key = ? AND version = 1`,
      ).get(input.orgId, input.idempotencyKey) as ActionProposalRow | undefined;
      if (existing) return mapActionProposal(existing);
      const timestamp = nowIso();
      const result = db.prepare(
        `INSERT INTO action_proposals
         (run_id, org_id, action_type, title, payload_json, risk_level, status,
          version, idempotency_key, expected_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 1, ?, 1, ?, ?)`,
      ).run(
        input.runId, input.orgId, input.actionType, input.title,
        JSON.stringify(input.payload), input.riskLevel, input.idempotencyKey,
        timestamp, timestamp,
      );
      return getProposalRow(db, Number(result.lastInsertRowid));
    },
    getActionProposal(id, orgId) {
      const row = db.prepare("SELECT * FROM action_proposals WHERE id = ? AND org_id = ?")
        .get(id, orgId) as ActionProposalRow | undefined;
      return row ? mapActionProposal(row) : null;
    },
    listActionProposals(filter) {
      const { sql, params } = buildWhere(
        whereEq("org_id", filter.orgId), whereEq("run_id", filter.runId),
        whereEq("status", filter.status),
      );
      const rows = db.prepare(
        `SELECT * FROM action_proposals ${sql}
         ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      ).all(...params, clampLimit(filter.limit ?? 50), clampOffset(filter.offset)) as
        unknown as ActionProposalRow[];
      return rows.map(mapActionProposal);
    },
    updateActionProposal(id, orgId, expectedVersion, input) {
      const hasTitle = Object.hasOwn(input, "title");
      const hasPayload = Object.hasOwn(input, "payload");
      const result = db.prepare(
        `UPDATE action_proposals SET status = COALESCE(?, status),
         title = CASE WHEN ? = 1 THEN ? ELSE title END,
         payload_json = CASE WHEN ? = 1 THEN ? ELSE payload_json END,
         expected_version = expected_version + 1, updated_at = ?
         WHERE id = ? AND org_id = ? AND expected_version = ?`,
      ).run(
        input.status ?? null, hasTitle ? 1 : 0, input.title ?? "",
        hasPayload ? 1 : 0, JSON.stringify(input.payload ?? {}),
        nowIso(), id, orgId, expectedVersion,
      );
      return result.changes === 0 ? null : this.getActionProposal(id, orgId);
    },
    modifyActionProposal(id, orgId, expectedVersion, input) {
      const current = this.getActionProposal(id, orgId);
      if (!current || current.status !== "pending" || current.expectedVersion !== expectedVersion) {
        return null;
      }
      let replacementId = 0;
      let approvalId = 0;
      const timestamp = nowIso();
      withTransaction(db, () => {
        const expired = db.prepare(
          `UPDATE action_proposals SET status = 'expired',
           expected_version = expected_version + 1, updated_at = ?
           WHERE id = ? AND org_id = ? AND status = 'pending' AND expected_version = ?`,
        ).run(timestamp, id, orgId, expectedVersion);
        if (expired.changes !== 1) throw new Error("Action proposal version conflict");
        const replacement = db.prepare(
          `INSERT INTO action_proposals
           (run_id, org_id, action_type, title, payload_json, risk_level, status,
            version, supersedes_proposal_id, idempotency_key, expected_version,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 1, ?, ?)`,
        ).run(
          current.runId, current.orgId, current.actionType, input.title,
          JSON.stringify(input.payload), current.riskLevel, current.version + 1,
          current.id, current.idempotencyKey, timestamp, timestamp,
        );
        replacementId = Number(replacement.lastInsertRowid);
        const approval = db.prepare(
          `INSERT INTO action_approvals
           (proposal_id, user_id, decision, modification_json, created_at)
           VALUES (?, ?, 'modified', ?, ?)`,
        ).run(current.id, input.userId, JSON.stringify({
          title: input.title,
          payload: input.payload,
          replacementProposalId: replacementId,
        }), timestamp);
        approvalId = Number(approval.lastInsertRowid);
      });
      const previous = this.getActionProposal(id, orgId);
      if (!previous) throw new Error("Modified proposal disappeared");
      return {
        previous,
        replacement: getProposalRow(db, replacementId),
        approval: mapActionApproval(
          db.prepare("SELECT * FROM action_approvals WHERE id = ?")
            .get(approvalId) as unknown as ActionApprovalRow,
        ),
      };
    },
    recordActionApproval(input) {
      const result = db.prepare(
        `INSERT INTO action_approvals
         (proposal_id, user_id, decision, modification_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        input.proposalId, input.userId, input.decision,
        input.modification ? JSON.stringify(input.modification) : null, nowIso(),
      );
      const row = db.prepare("SELECT * FROM action_approvals WHERE id = ?")
        .get(Number(result.lastInsertRowid)) as unknown as ActionApprovalRow;
      return mapActionApproval(row);
    },
    decideActionProposal(id, orgId, expectedVersion, input) {
      let approvalId = 0;
      const timestamp = nowIso();
      try {
        withTransaction(db, () => {
          const updated = db.prepare(
            `UPDATE action_proposals SET status = ?,
             expected_version = expected_version + 1, updated_at = ?
             WHERE id = ? AND org_id = ? AND status = 'pending'
             AND expected_version = ?`,
          ).run(
            input.decision, timestamp, id, orgId, expectedVersion,
          );
          if (updated.changes !== 1) {
            throw new ActionProposalConflictError();
          }
          const approval = db.prepare(
            `INSERT INTO action_approvals
             (proposal_id, user_id, decision, modification_json, created_at)
             VALUES (?, ?, ?, NULL, ?)`,
          ).run(id, input.userId, input.decision, timestamp);
          approvalId = Number(approval.lastInsertRowid);
        });
      } catch (error) {
        if (error instanceof ActionProposalConflictError) return null;
        throw error;
      }
      const proposal = this.getActionProposal(id, orgId);
      if (!proposal) throw new Error("Decided proposal disappeared");
      const approval = db.prepare("SELECT * FROM action_approvals WHERE id = ?")
        .get(approvalId) as unknown as ActionApprovalRow;
      return { proposal, approval: mapActionApproval(approval) };
    },
    listActionApprovals(proposalId) {
      const rows = db.prepare(
        "SELECT * FROM action_approvals WHERE proposal_id = ? ORDER BY id ASC",
      ).all(proposalId) as unknown as ActionApprovalRow[];
      return rows.map(mapActionApproval);
    },
    createActionExecution(input) {
      const timestamp = nowIso();
      db.prepare(
        `INSERT OR IGNORE INTO action_executions
         (proposal_id, idempotency_key, status, created_at, updated_at)
         VALUES (?, ?, 'executing', ?, ?)`,
      ).run(input.proposalId, input.idempotencyKey, timestamp, timestamp);
      const execution = this.getActionExecutionByKey(input.idempotencyKey);
      if (!execution) throw new Error("Failed to create action execution");
      return execution;
    },
    beginActionExecution(input) {
      let executionId = 0;
      const timestamp = nowIso();
      try {
        withTransaction(db, () => {
          const updated = db.prepare(
            `UPDATE action_proposals SET status = 'executing',
             expected_version = expected_version + 1, updated_at = ?
             WHERE id = ? AND org_id = ? AND status = 'approved'
             AND expected_version = ?`,
          ).run(
            timestamp, input.proposalId, input.orgId, input.expectedVersion,
          );
          if (updated.changes !== 1) throw new ActionProposalConflictError();
          const inserted = db.prepare(
            `INSERT INTO action_executions
             (proposal_id, idempotency_key, status, created_at, updated_at)
             VALUES (?, ?, 'executing', ?, ?)`,
          ).run(
            input.proposalId, input.idempotencyKey, timestamp, timestamp,
          );
          executionId = Number(inserted.lastInsertRowid);
        });
      } catch (error) {
        if (error instanceof ActionProposalConflictError) return null;
        throw error;
      }
      const proposal = this.getActionProposal(input.proposalId, input.orgId);
      const row = db.prepare("SELECT * FROM action_executions WHERE id = ?")
        .get(executionId) as ActionExecutionRow | undefined;
      if (!proposal || !row) throw new Error("Started action execution disappeared");
      return { proposal, execution: mapActionExecution(row) };
    },
    getActionExecutionByKey(idempotencyKey) {
      const row = db.prepare("SELECT * FROM action_executions WHERE idempotency_key = ?")
        .get(idempotencyKey) as ActionExecutionRow | undefined;
      return row ? mapActionExecution(row) : null;
    },
    listActionExecutions(proposalId) {
      const rows = db.prepare(
        "SELECT * FROM action_executions WHERE proposal_id = ? ORDER BY id ASC",
      ).all(proposalId) as unknown as ActionExecutionRow[];
      return rows.map(mapActionExecution);
    },
    updateActionExecution(id, input) {
      db.prepare(
        `UPDATE action_executions SET status = ?, result_json = ?,
         error_message = ?, updated_at = ? WHERE id = ?`,
      ).run(
        input.status, input.result ? JSON.stringify(input.result) : null,
        input.errorMessage ?? null, nowIso(), id,
      );
      const row = db.prepare("SELECT * FROM action_executions WHERE id = ?")
        .get(id) as ActionExecutionRow | undefined;
      return row ? mapActionExecution(row) : null;
    },
    finishActionExecution(input) {
      const timestamp = nowIso();
      try {
        withTransaction(db, () => {
          const execution = db.prepare(
            `UPDATE action_executions SET status = ?, result_json = ?,
             error_message = ?, updated_at = ?
             WHERE id = ? AND proposal_id = ? AND status = 'executing'`,
          ).run(
            input.executionStatus,
            input.result ? JSON.stringify(input.result) : null,
            input.errorMessage ?? null,
            timestamp,
            input.executionId,
            input.proposalId,
          );
          if (execution.changes !== 1) throw new ActionProposalConflictError();
          const proposal = db.prepare(
            `UPDATE action_proposals SET status = ?,
             expected_version = expected_version + 1, updated_at = ?
             WHERE id = ? AND org_id = ? AND status = 'executing'
             AND expected_version = ?`,
          ).run(
            input.proposalStatus,
            timestamp,
            input.proposalId,
            input.orgId,
            input.expectedVersion,
          );
          if (proposal.changes !== 1) throw new ActionProposalConflictError();
        });
      } catch (error) {
        if (error instanceof ActionProposalConflictError) return null;
        throw error;
      }
      const proposal = this.getActionProposal(input.proposalId, input.orgId);
      const row = db.prepare("SELECT * FROM action_executions WHERE id = ?")
        .get(input.executionId) as ActionExecutionRow | undefined;
      if (!proposal || !row) throw new Error("Finished action execution disappeared");
      return { proposal, execution: mapActionExecution(row) };
    },
  };
}

class ActionProposalConflictError extends Error {}

function getSessionRow(db: DatabaseSync, id: number) {
  return mapAgentSession(db.prepare("SELECT * FROM agent_sessions WHERE id = ?")
    .get(id) as unknown as AgentSessionRow);
}
function getRunRow(db: DatabaseSync, id: number) {
  return mapAgentRun(db.prepare("SELECT * FROM agent_runs WHERE id = ?")
    .get(id) as unknown as AgentRunRow);
}
function getProposalRow(db: DatabaseSync, id: number) {
  return mapActionProposal(db.prepare("SELECT * FROM action_proposals WHERE id = ?")
    .get(id) as unknown as ActionProposalRow);
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
