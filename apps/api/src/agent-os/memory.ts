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
  serializeStringArray,
} from "./json.js";
import {
  assertOrganizationReference,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  requireCreated,
  resolveIdempotencyKey,
} from "./helpers.js";
import { mapMemoryEntry, type MemoryEntryRow } from "./mappers.js";
import type {
  AgentOsPersistenceAdapter,
  CreateMemoryEntryInput,
  MemoryEntry,
  MemoryEntryListFilter,
  UpdateMemoryEntryInput,
} from "./types.js";

type MemoryStore = Pick<
  AgentOsPersistenceAdapter,
  "createMemoryEntry" | "getMemoryEntry" | "listMemoryEntries" | "updateMemoryEntry"
>;

export function createMemoryStore(db: DatabaseSync): MemoryStore {
  function getRow(id: number, organizationId: number): MemoryEntryRow | undefined {
    return db.prepare(
      "SELECT * FROM agent_os_memory_entries WHERE id = ? AND organization_id = ?",
    ).get(id, organizationId) as MemoryEntryRow | undefined;
  }

  function getByKey(organizationId: number, idempotencyKey: string): MemoryEntryRow | undefined {
    return db.prepare(
      "SELECT * FROM agent_os_memory_entries WHERE organization_id = ? AND idempotency_key = ?",
    ).get(organizationId, idempotencyKey) as MemoryEntryRow | undefined;
  }

  return {
    createMemoryEntry(input: CreateMemoryEntryInput): MemoryEntry {
      const idempotencyKey = resolveIdempotencyKey(input.idempotencyKey);
      let entry: MemoryEntry | undefined;
      withTransaction(db, () => {
        const existing = getByKey(input.organizationId, idempotencyKey);
        if (existing) {
          entry = mapMemoryEntry(existing);
          return;
        }
        assertOrganizationReference(db, "agent_os_workflow_runs", input.sourceWorkflowRunId, input.organizationId, "sourceWorkflowRunId");
        assertOrganizationReference(db, "agent_os_action_proposals", input.sourceActionProposalId, input.organizationId, "sourceActionProposalId");
        const timestamp = nowIso();
        const result = db.prepare(
          `INSERT INTO agent_os_memory_entries
           (organization_id, memory_type, subject_type, subject_id_json, title,
            content_json, tags_json, confidence, source_workflow_run_id,
            source_action_proposal_id, idempotency_key, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).run(
          input.organizationId,
          input.memoryType,
          input.subjectType ?? null,
          serializeResourceId(input.subjectId),
          input.title ?? null,
          serializeRequiredJson(input.content),
          serializeStringArray(input.tags),
          input.confidence ?? null,
          input.sourceWorkflowRunId ?? null,
          input.sourceActionProposalId ?? null,
          idempotencyKey,
          timestamp,
          timestamp,
        );
        entry = mapMemoryEntry(requireCreated(
          getRow(Number(result.lastInsertRowid), input.organizationId),
          "memory entry",
        ));
      });
      return requireCreated(entry, "memory entry");
    },

    getMemoryEntry(id: number, organizationId: number): MemoryEntry | null {
      const row = getRow(id, organizationId);
      return row ? mapMemoryEntry(row) : null;
    },

    listMemoryEntries(filter: MemoryEntryListFilter): MemoryEntry[] {
      const { sql, params } = buildWhere(
        whereEq("organization_id", filter.organizationId),
        whereEq("memory_type", filter.memoryType),
        whereEq("subject_type", filter.subjectType),
        filter.subjectId === undefined
          ? null
          : whereEq("subject_id_json", serializeResourceId(filter.subjectId)),
        whereEq("source_workflow_run_id", filter.sourceWorkflowRunId),
      );
      const rows = db.prepare(
        `SELECT * FROM agent_os_memory_entries ${sql}
         ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
      ).all(
        ...params,
        clampLimit(filter.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
        clampOffset(filter.offset),
      ) as unknown as MemoryEntryRow[];
      return rows.map(mapMemoryEntry);
    },

    updateMemoryEntry(
      id: number,
      organizationId: number,
      input: UpdateMemoryEntryInput,
    ): MemoryEntry | null {
      let entry: MemoryEntry | null = null;
      withTransaction(db, () => {
        const sets: string[] = [];
        const params: SQLInputValue[] = [];
        if (input.memoryType !== undefined) {
          sets.push("memory_type = ?");
          params.push(input.memoryType);
        }
        if (input.subjectType !== undefined) {
          sets.push("subject_type = ?");
          params.push(input.subjectType);
        }
        if (input.subjectId !== undefined) {
          sets.push("subject_id_json = ?");
          params.push(serializeResourceId(input.subjectId));
        }
        if (input.title !== undefined) {
          sets.push("title = ?");
          params.push(input.title);
        }
        if (input.content !== undefined) {
          sets.push("content_json = ?");
          params.push(serializeRequiredJson(input.content));
        }
        if (input.tags !== undefined) {
          sets.push("tags_json = ?");
          params.push(serializeStringArray(input.tags));
        }
        if (input.confidence !== undefined) {
          sets.push("confidence = ?");
          params.push(input.confidence);
        }
        if (input.sourceWorkflowRunId !== undefined) {
          assertOrganizationReference(db, "agent_os_workflow_runs", input.sourceWorkflowRunId, organizationId, "sourceWorkflowRunId");
          sets.push("source_workflow_run_id = ?");
          params.push(input.sourceWorkflowRunId);
        }
        if (input.sourceActionProposalId !== undefined) {
          assertOrganizationReference(db, "agent_os_action_proposals", input.sourceActionProposalId, organizationId, "sourceActionProposalId");
          sets.push("source_action_proposal_id = ?");
          params.push(input.sourceActionProposalId);
        }
        if (sets.length === 0) {
          const row = getRow(id, organizationId);
          if (row && input.expectedVersion !== undefined && row.version !== input.expectedVersion) {
            return;
          }
          entry = row ? mapMemoryEntry(row) : null;
          return;
        }
        sets.push("version = version + 1", "updated_at = ?");
        params.push(nowIso(), id, organizationId);
        let sql = `UPDATE agent_os_memory_entries SET ${sets.join(", ")} WHERE id = ? AND organization_id = ?`;
        if (input.expectedVersion !== undefined) {
          sql += " AND version = ?";
          params.push(input.expectedVersion);
        }
        const result = db.prepare(sql).run(...params);
        if (result.changes !== 0) {
          const row = getRow(id, organizationId);
          entry = row ? mapMemoryEntry(row) : null;
        }
      });
      return entry;
    },
  };
}
