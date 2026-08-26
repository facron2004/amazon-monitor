import { randomUUID } from "node:crypto";
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
} from "./intelligence-json.js";
import {
  mapDecision,
  mapExperiment,
  mapOpportunity,
  type DecisionRow,
  type ExperimentRow,
  type OpportunityRow,
} from "./intelligence-mappers.js";
import { initializeIntelligenceSchema } from "./intelligence-schema.js";
import type {
  CreateDecisionInput,
  CreateExperimentInput,
  CreateOpportunityInput,
  Decision,
  DecisionListFilter,
  Experiment,
  ExperimentListFilter,
  IntelligenceAssociationFilter,
  IntelligenceAssociationInput,
  IntelligencePersistenceAdapter,
  Opportunity,
  OpportunityListFilter,
  UpdateDecisionInput,
  UpdateExperimentInput,
  UpdateOpportunityInput,
} from "./intelligence-types.js";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 1000;

type IntelligenceRow = OpportunityRow | DecisionRow | ExperimentRow;
type IntelligenceTable =
  | "agent_os_intelligence_opportunities"
  | "agent_os_intelligence_decisions"
  | "agent_os_intelligence_experiments";
type ReferenceTable =
  | IntelligenceTable
  | "agent_os_goals"
  | "agent_os_workflow_runs"
  | "agent_os_action_proposals";

export function createIntelligenceStore(db: DatabaseSync): IntelligencePersistenceAdapter {
  initializeIntelligenceSchema(db);

  function getOpportunityRow(id: number, organizationId: number): OpportunityRow | undefined {
    return getRow<OpportunityRow>(db, "agent_os_intelligence_opportunities", id, organizationId);
  }

  function getDecisionRow(id: number, organizationId: number): DecisionRow | undefined {
    return getRow<DecisionRow>(db, "agent_os_intelligence_decisions", id, organizationId);
  }

  function getExperimentRow(id: number, organizationId: number): ExperimentRow | undefined {
    return getRow<ExperimentRow>(db, "agent_os_intelligence_experiments", id, organizationId);
  }

  function getOpportunityByKey(organizationId: number, key: string): OpportunityRow | undefined {
    return getByIdempotencyKey<OpportunityRow>(db, "agent_os_intelligence_opportunities", organizationId, key);
  }

  function getDecisionByKey(organizationId: number, key: string): DecisionRow | undefined {
    return getByIdempotencyKey<DecisionRow>(db, "agent_os_intelligence_decisions", organizationId, key);
  }

  function getExperimentByKey(organizationId: number, key: string): ExperimentRow | undefined {
    return getByIdempotencyKey<ExperimentRow>(db, "agent_os_intelligence_experiments", organizationId, key);
  }

  return {
    createOpportunity(input: CreateOpportunityInput): Opportunity {
      const idempotencyKey = resolveIdempotencyKey(input.idempotencyKey);
      let opportunity: Opportunity | undefined;
      withTransaction(db, () => {
        const existing = getOpportunityByKey(input.organizationId, idempotencyKey);
        if (existing) {
          opportunity = mapOpportunity(existing);
          return;
        }
        assertCommonReferences(db, input.organizationId, input);
        const timestamp = nowIso();
        const result = db.prepare(
          `INSERT INTO agent_os_intelligence_opportunities
           (organization_id, opportunity_type, title, summary, target_type, target_id_json,
            goal_id, source_type, source_id, source_workflow_run_id, source_action_proposal_id,
            signal_json, score, expected_impact_json, risk_json, confidence, status, details_json,
            idempotency_key, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).run(
          input.organizationId,
          input.type,
          input.title,
          input.summary ?? null,
          input.targetType ?? null,
          serializeResourceId(input.targetId),
          input.goalId ?? null,
          input.sourceType ?? null,
          input.sourceId ?? null,
          input.sourceWorkflowRunId ?? null,
          input.sourceActionProposalId ?? null,
          serializeJson(input.signal),
          input.score ?? null,
          serializeJson(input.expectedImpact),
          serializeJson(input.risk),
          input.confidence ?? null,
          input.status ?? "IDENTIFIED",
          serializeJson(input.details),
          idempotencyKey,
          timestamp,
          timestamp,
        );
        opportunity = mapOpportunity(requireCreated(
          getOpportunityRow(Number(result.lastInsertRowid), input.organizationId),
          "opportunity",
        ));
      });
      return requireCreated(opportunity, "opportunity");
    },

    getOpportunity(id: number, organizationId: number): Opportunity | null {
      const row = getOpportunityRow(id, organizationId);
      return row ? mapOpportunity(row) : null;
    },

    listOpportunities(filter: OpportunityListFilter): Opportunity[] {
      const { sql, params } = buildWhere(
        ...associationConditions(filter),
        whereEq("opportunity_type", filter.type),
        whereEq("status", filter.status),
      );
      return selectRows<OpportunityRow>(db, "agent_os_intelligence_opportunities", sql, params, filter.limit, filter.offset)
        .map(mapOpportunity);
    },

    updateOpportunity(id: number, organizationId: number, input: UpdateOpportunityInput): Opportunity | null {
      let opportunity: Opportunity | null = null;
      withTransaction(db, () => {
        const sets: string[] = [];
        const params: SQLInputValue[] = [];
        appendCommonUpdates(db, organizationId, input, sets, params);
        if (input.type !== undefined) addUpdate(sets, params, "opportunity_type", input.type);
        if (input.title !== undefined) addUpdate(sets, params, "title", input.title);
        if (input.summary !== undefined) addUpdate(sets, params, "summary", input.summary);
        if (input.signal !== undefined) addUpdate(sets, params, "signal_json", serializeJson(input.signal));
        if (input.score !== undefined) addUpdate(sets, params, "score", input.score);
        if (input.expectedImpact !== undefined) addUpdate(sets, params, "expected_impact_json", serializeJson(input.expectedImpact));
        if (input.risk !== undefined) addUpdate(sets, params, "risk_json", serializeJson(input.risk));
        if (input.confidence !== undefined) addUpdate(sets, params, "confidence", input.confidence);
        if (input.status !== undefined) addUpdate(sets, params, "status", input.status);
        if (input.details !== undefined) addUpdate(sets, params, "details_json", serializeJson(input.details));
        opportunity = updateRecord(
          db,
          "agent_os_intelligence_opportunities",
          id,
          organizationId,
          input.expectedVersion,
          sets,
          params,
          mapOpportunity,
        );
      });
      return opportunity;
    },

    deleteOpportunity(id: number, organizationId: number, expectedVersion?: number): boolean {
      return deleteRecord(db, "agent_os_intelligence_opportunities", id, organizationId, expectedVersion);
    },

    createDecision(input: CreateDecisionInput): Decision {
      const idempotencyKey = resolveIdempotencyKey(input.idempotencyKey);
      let decision: Decision | undefined;
      withTransaction(db, () => {
        const existing = getDecisionByKey(input.organizationId, idempotencyKey);
        if (existing) {
          decision = mapDecision(existing);
          return;
        }
        assertCommonReferences(db, input.organizationId, input);
        assertReference(db, "agent_os_intelligence_opportunities", input.sourceOpportunityId, input.organizationId, "sourceOpportunityId");
        const timestamp = nowIso();
        const result = db.prepare(
          `INSERT INTO agent_os_intelligence_decisions
           (organization_id, issue, root_causes_json, evidence_json, options_json,
            recommended_option_json, expected_impact_json, risk_json, confidence, constraints_json,
            required_approval, target_type, target_id_json, goal_id, source_type, source_id,
            source_workflow_run_id, source_action_proposal_id, source_opportunity_id, status,
            idempotency_key, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).run(
          input.organizationId,
          input.issue,
          serializeRequiredJson(input.rootCauses),
          serializeRequiredJson(input.evidence),
          serializeRequiredJson(input.options),
          serializeJson(input.recommendedOption),
          serializeJson(input.expectedImpact),
          serializeJson(input.risk),
          input.confidence ?? null,
          serializeJson(input.constraints),
          input.requiredApproval === false ? 0 : 1,
          input.targetType ?? null,
          serializeResourceId(input.targetId),
          input.goalId ?? null,
          input.sourceType ?? null,
          input.sourceId ?? null,
          input.sourceWorkflowRunId ?? null,
          input.sourceActionProposalId ?? null,
          input.sourceOpportunityId ?? null,
          input.status ?? "PROPOSED",
          idempotencyKey,
          timestamp,
          timestamp,
        );
        decision = mapDecision(requireCreated(
          getDecisionRow(Number(result.lastInsertRowid), input.organizationId),
          "decision",
        ));
      });
      return requireCreated(decision, "decision");
    },

    getDecision(id: number, organizationId: number): Decision | null {
      const row = getDecisionRow(id, organizationId);
      return row ? mapDecision(row) : null;
    },

    listDecisions(filter: DecisionListFilter): Decision[] {
      const { sql, params } = buildWhere(
        ...associationConditions(filter),
        whereEq("status", filter.status),
        whereEq("source_opportunity_id", filter.sourceOpportunityId),
      );
      return selectRows<DecisionRow>(db, "agent_os_intelligence_decisions", sql, params, filter.limit, filter.offset)
        .map(mapDecision);
    },

    updateDecision(id: number, organizationId: number, input: UpdateDecisionInput): Decision | null {
      let decision: Decision | null = null;
      withTransaction(db, () => {
        const sets: string[] = [];
        const params: SQLInputValue[] = [];
        appendCommonUpdates(db, organizationId, input, sets, params);
        if (input.issue !== undefined) addUpdate(sets, params, "issue", input.issue);
        if (input.rootCauses !== undefined) addUpdate(sets, params, "root_causes_json", serializeRequiredJson(input.rootCauses));
        if (input.evidence !== undefined) addUpdate(sets, params, "evidence_json", serializeRequiredJson(input.evidence));
        if (input.options !== undefined) addUpdate(sets, params, "options_json", serializeRequiredJson(input.options));
        if (input.recommendedOption !== undefined) addUpdate(sets, params, "recommended_option_json", serializeJson(input.recommendedOption));
        if (input.expectedImpact !== undefined) addUpdate(sets, params, "expected_impact_json", serializeJson(input.expectedImpact));
        if (input.risk !== undefined) addUpdate(sets, params, "risk_json", serializeJson(input.risk));
        if (input.confidence !== undefined) addUpdate(sets, params, "confidence", input.confidence);
        if (input.constraints !== undefined) addUpdate(sets, params, "constraints_json", serializeJson(input.constraints));
        if (input.requiredApproval !== undefined) addUpdate(sets, params, "required_approval", input.requiredApproval ? 1 : 0);
        if (input.sourceOpportunityId !== undefined) {
          assertReference(db, "agent_os_intelligence_opportunities", input.sourceOpportunityId, organizationId, "sourceOpportunityId");
          addUpdate(sets, params, "source_opportunity_id", input.sourceOpportunityId);
        }
        if (input.status !== undefined) addUpdate(sets, params, "status", input.status);
        decision = updateRecord(
          db,
          "agent_os_intelligence_decisions",
          id,
          organizationId,
          input.expectedVersion,
          sets,
          params,
          mapDecision,
        );
      });
      return decision;
    },

    deleteDecision(id: number, organizationId: number, expectedVersion?: number): boolean {
      return deleteRecord(db, "agent_os_intelligence_decisions", id, organizationId, expectedVersion);
    },

    createExperiment(input: CreateExperimentInput): Experiment {
      const idempotencyKey = resolveIdempotencyKey(input.idempotencyKey);
      let experiment: Experiment | undefined;
      withTransaction(db, () => {
        const existing = getExperimentByKey(input.organizationId, idempotencyKey);
        if (existing) {
          experiment = mapExperiment(existing);
          return;
        }
        assertCommonReferences(db, input.organizationId, input);
        assertReference(db, "agent_os_intelligence_opportunities", input.sourceOpportunityId, input.organizationId, "sourceOpportunityId");
        assertReference(db, "agent_os_intelligence_decisions", input.sourceDecisionId, input.organizationId, "sourceDecisionId");
        const timestamp = nowIso();
        const result = db.prepare(
          `INSERT INTO agent_os_intelligence_experiments
           (organization_id, title, hypothesis_json, action_json, observation_json, result_json,
            learning_json, before_json, after_json, delta_json, confidence, attribution,
            observation_window_days, target_type, target_id_json, goal_id, source_type, source_id,
            source_workflow_run_id, source_action_proposal_id, source_opportunity_id,
            source_decision_id, status, idempotency_key, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ).run(
          input.organizationId,
          input.title,
          serializeRequiredJson(input.hypothesis),
          serializeJson(input.action),
          serializeJson(input.observation),
          serializeJson(input.result),
          serializeJson(input.learning),
          serializeJson(input.before),
          serializeJson(input.after),
          serializeJson(input.delta),
          input.confidence ?? null,
          input.attribution ?? null,
          input.observationWindowDays ?? null,
          input.targetType ?? null,
          serializeResourceId(input.targetId),
          input.goalId ?? null,
          input.sourceType ?? null,
          input.sourceId ?? null,
          input.sourceWorkflowRunId ?? null,
          input.sourceActionProposalId ?? null,
          input.sourceOpportunityId ?? null,
          input.sourceDecisionId ?? null,
          input.status ?? "DRAFT",
          idempotencyKey,
          timestamp,
          timestamp,
        );
        experiment = mapExperiment(requireCreated(
          getExperimentRow(Number(result.lastInsertRowid), input.organizationId),
          "experiment",
        ));
      });
      return requireCreated(experiment, "experiment");
    },

    getExperiment(id: number, organizationId: number): Experiment | null {
      const row = getExperimentRow(id, organizationId);
      return row ? mapExperiment(row) : null;
    },

    listExperiments(filter: ExperimentListFilter): Experiment[] {
      const { sql, params } = buildWhere(
        ...associationConditions(filter),
        whereEq("status", filter.status),
        whereEq("source_opportunity_id", filter.sourceOpportunityId),
        whereEq("source_decision_id", filter.sourceDecisionId),
      );
      return selectRows<ExperimentRow>(db, "agent_os_intelligence_experiments", sql, params, filter.limit, filter.offset)
        .map(mapExperiment);
    },

    updateExperiment(id: number, organizationId: number, input: UpdateExperimentInput): Experiment | null {
      let experiment: Experiment | null = null;
      withTransaction(db, () => {
        const sets: string[] = [];
        const params: SQLInputValue[] = [];
        appendCommonUpdates(db, organizationId, input, sets, params);
        if (input.title !== undefined) addUpdate(sets, params, "title", input.title);
        if (input.hypothesis !== undefined) addUpdate(sets, params, "hypothesis_json", serializeRequiredJson(input.hypothesis));
        if (input.action !== undefined) addUpdate(sets, params, "action_json", serializeJson(input.action));
        if (input.observation !== undefined) addUpdate(sets, params, "observation_json", serializeJson(input.observation));
        if (input.result !== undefined) addUpdate(sets, params, "result_json", serializeJson(input.result));
        if (input.learning !== undefined) addUpdate(sets, params, "learning_json", serializeJson(input.learning));
        if (input.before !== undefined) addUpdate(sets, params, "before_json", serializeJson(input.before));
        if (input.after !== undefined) addUpdate(sets, params, "after_json", serializeJson(input.after));
        if (input.delta !== undefined) addUpdate(sets, params, "delta_json", serializeJson(input.delta));
        if (input.confidence !== undefined) addUpdate(sets, params, "confidence", input.confidence);
        if (input.attribution !== undefined) addUpdate(sets, params, "attribution", input.attribution);
        if (input.observationWindowDays !== undefined) addUpdate(sets, params, "observation_window_days", input.observationWindowDays);
        if (input.sourceOpportunityId !== undefined) {
          assertReference(db, "agent_os_intelligence_opportunities", input.sourceOpportunityId, organizationId, "sourceOpportunityId");
          addUpdate(sets, params, "source_opportunity_id", input.sourceOpportunityId);
        }
        if (input.sourceDecisionId !== undefined) {
          assertReference(db, "agent_os_intelligence_decisions", input.sourceDecisionId, organizationId, "sourceDecisionId");
          addUpdate(sets, params, "source_decision_id", input.sourceDecisionId);
        }
        if (input.status !== undefined) addUpdate(sets, params, "status", input.status);
        experiment = updateRecord(
          db,
          "agent_os_intelligence_experiments",
          id,
          organizationId,
          input.expectedVersion,
          sets,
          params,
          mapExperiment,
        );
      });
      return experiment;
    },

    deleteExperiment(id: number, organizationId: number, expectedVersion?: number): boolean {
      return deleteRecord(db, "agent_os_intelligence_experiments", id, organizationId, expectedVersion);
    },
  } satisfies IntelligencePersistenceAdapter;
}

function getRow<T extends IntelligenceRow>(
  db: DatabaseSync,
  table: IntelligenceTable,
  id: number,
  organizationId: number,
): T | undefined {
  return db.prepare(`SELECT * FROM ${table} WHERE id = ? AND organization_id = ?`).get(id, organizationId) as T | undefined;
}

function getByIdempotencyKey<T extends IntelligenceRow>(
  db: DatabaseSync,
  table: IntelligenceTable,
  organizationId: number,
  idempotencyKey: string,
): T | undefined {
  return db.prepare(
    `SELECT * FROM ${table} WHERE organization_id = ? AND idempotency_key = ?`,
  ).get(organizationId, idempotencyKey) as T | undefined;
}

function selectRows<T extends IntelligenceRow>(
  db: DatabaseSync,
  table: IntelligenceTable,
  whereSql: string,
  whereParams: SQLInputValue[],
  limit: number | undefined,
  offset: number | undefined,
): T[] {
  return db.prepare(
    `SELECT * FROM ${table} ${whereSql}
     ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
  ).all(
    ...whereParams,
    clampLimit(limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    clampOffset(offset),
  ) as unknown as T[];
}

function associationConditions(filter: IntelligenceAssociationFilter & { organizationId: number }) {
  return [
    whereEq("organization_id", filter.organizationId),
    whereEq("target_type", filter.targetType),
    filter.targetId === undefined ? null : whereEq("target_id_json", serializeResourceId(filter.targetId)),
    whereEq("goal_id", filter.goalId),
    whereEq("source_type", filter.sourceType),
    whereEq("source_id", filter.sourceId),
    whereEq("source_workflow_run_id", filter.sourceWorkflowRunId),
    whereEq("source_action_proposal_id", filter.sourceActionProposalId),
  ];
}

function appendCommonUpdates(
  db: DatabaseSync,
  organizationId: number,
  input: IntelligenceAssociationInput,
  sets: string[],
  params: SQLInputValue[],
): void {
  if (input.targetType !== undefined) addUpdate(sets, params, "target_type", input.targetType);
  if (input.targetId !== undefined) addUpdate(sets, params, "target_id_json", serializeResourceId(input.targetId));
  if (input.goalId !== undefined) {
    assertReference(db, "agent_os_goals", input.goalId, organizationId, "goalId");
    addUpdate(sets, params, "goal_id", input.goalId);
  }
  if (input.sourceType !== undefined) addUpdate(sets, params, "source_type", input.sourceType);
  if (input.sourceId !== undefined) addUpdate(sets, params, "source_id", input.sourceId);
  if (input.sourceWorkflowRunId !== undefined) {
    assertReference(db, "agent_os_workflow_runs", input.sourceWorkflowRunId, organizationId, "sourceWorkflowRunId");
    addUpdate(sets, params, "source_workflow_run_id", input.sourceWorkflowRunId);
  }
  if (input.sourceActionProposalId !== undefined) {
    assertReference(db, "agent_os_action_proposals", input.sourceActionProposalId, organizationId, "sourceActionProposalId");
    addUpdate(sets, params, "source_action_proposal_id", input.sourceActionProposalId);
  }
}

function assertCommonReferences(
  db: DatabaseSync,
  organizationId: number,
  input: IntelligenceAssociationInput,
): void {
  assertReference(db, "agent_os_goals", input.goalId, organizationId, "goalId");
  assertReference(db, "agent_os_workflow_runs", input.sourceWorkflowRunId, organizationId, "sourceWorkflowRunId");
  assertReference(db, "agent_os_action_proposals", input.sourceActionProposalId, organizationId, "sourceActionProposalId");
}

function assertReference(
  db: DatabaseSync,
  table: ReferenceTable,
  id: number | null | undefined,
  organizationId: number,
  field: string,
): void {
  if (id === undefined || id === null) return;
  const tableRow = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = ? AND name = ?",
  ).get("table", table) as { name?: string } | undefined;
  if (!tableRow) {
    throw Object.assign(new Error(`${field} reference table is unavailable`), { statusCode: 400 });
  }
  const row = db.prepare(
    `SELECT organization_id FROM ${table} WHERE id = ?`,
  ).get(id) as { organization_id?: number } | undefined;
  if (!row || row.organization_id !== organizationId) {
    throw Object.assign(new Error(`${field} must belong to the current organization`), { statusCode: 400 });
  }
}

function addUpdate(sets: string[], params: SQLInputValue[], column: string, value: SQLInputValue): void {
  sets.push(`${column} = ?`);
  params.push(value);
}

function updateRecord<T extends IntelligenceRow, R>(
  db: DatabaseSync,
  table: IntelligenceTable,
  id: number,
  organizationId: number,
  expectedVersion: number | undefined,
  sets: string[],
  params: SQLInputValue[],
  mapper: (row: T) => R,
): R | null {
  const current = getRow<T>(db, table, id, organizationId);
  if (sets.length === 0) {
    if (current && expectedVersion !== undefined && current.version !== expectedVersion) return null;
    return current ? mapper(current) : null;
  }

  sets.push("version = version + 1", "updated_at = ?");
  const updateParams: SQLInputValue[] = [...params, nowIso(), id, organizationId];
  let sql = `UPDATE ${table} SET ${sets.join(", ")} WHERE id = ? AND organization_id = ?`;
  if (expectedVersion !== undefined) {
    sql += " AND version = ?";
    updateParams.push(expectedVersion);
  }
  const result = db.prepare(sql).run(...updateParams);
  if (result.changes === 0) return null;
  const updated = getRow<T>(db, table, id, organizationId);
  return updated ? mapper(updated) : null;
}

function deleteRecord(
  db: DatabaseSync,
  table: IntelligenceTable,
  id: number,
  organizationId: number,
  expectedVersion: number | undefined,
): boolean {
  let deleted = false;
  withTransaction(db, () => {
    let sql = `DELETE FROM ${table} WHERE id = ? AND organization_id = ?`;
    const params: SQLInputValue[] = [id, organizationId];
    if (expectedVersion !== undefined) {
      sql += " AND version = ?";
      params.push(expectedVersion);
    }
    deleted = db.prepare(sql).run(...params).changes !== 0;
  });
  return deleted;
}

function resolveIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized || randomUUID();
}

function requireCreated<T>(value: T | undefined, entity: string): T {
  if (value === undefined) throw new Error(`Failed to read created ${entity}`);
  return value;
}
