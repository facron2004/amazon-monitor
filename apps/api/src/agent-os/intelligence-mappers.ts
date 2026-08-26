import {
  parseJsonValue,
  parseRequiredJson,
  parseResourceId,
} from "./intelligence-json.js";
import type {
  Decision,
  Experiment,
  Opportunity,
} from "./intelligence-types.js";

interface CommonIntelligenceRow {
  id: number;
  organization_id: number;
  target_type: string | null;
  target_id_json: string | null;
  goal_id: number | null;
  source_type: string | null;
  source_id: string | null;
  source_workflow_run_id: number | null;
  source_action_proposal_id: number | null;
  status: string;
  idempotency_key: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface OpportunityRow extends CommonIntelligenceRow {
  opportunity_type: string;
  title: string;
  summary: string | null;
  signal_json: string | null;
  score: number | null;
  expected_impact_json: string | null;
  risk_json: string | null;
  confidence: number | null;
  details_json: string | null;
}

export interface DecisionRow extends CommonIntelligenceRow {
  issue: string;
  root_causes_json: string;
  evidence_json: string;
  options_json: string;
  recommended_option_json: string | null;
  expected_impact_json: string | null;
  risk_json: string | null;
  confidence: number | null;
  constraints_json: string | null;
  required_approval: number;
  source_opportunity_id: number | null;
}

export interface ExperimentRow extends CommonIntelligenceRow {
  title: string;
  hypothesis_json: string;
  action_json: string | null;
  observation_json: string | null;
  result_json: string | null;
  learning_json: string | null;
  before_json: string | null;
  after_json: string | null;
  delta_json: string | null;
  confidence: number | null;
  attribution: string | null;
  observation_window_days: number | null;
  source_opportunity_id: number | null;
  source_decision_id: number | null;
}

function mapAssociations(row: CommonIntelligenceRow) {
  return {
    targetType: row.target_type,
    targetId: parseResourceId(row.target_id_json, "targetId"),
    goalId: row.goal_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceWorkflowRunId: row.source_workflow_run_id,
    sourceActionProposalId: row.source_action_proposal_id,
  };
}

export function mapOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    organizationId: row.organization_id,
    ...mapAssociations(row),
    type: row.opportunity_type,
    title: row.title,
    summary: row.summary,
    signal: parseJsonValue(row.signal_json, "opportunity.signal"),
    score: row.score,
    expectedImpact: parseJsonValue(row.expected_impact_json, "opportunity.expectedImpact"),
    risk: parseJsonValue(row.risk_json, "opportunity.risk"),
    confidence: row.confidence,
    status: row.status as Opportunity["status"],
    details: parseJsonValue(row.details_json, "opportunity.details"),
    idempotencyKey: row.idempotency_key,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDecision(row: DecisionRow): Decision {
  return {
    id: row.id,
    organizationId: row.organization_id,
    ...mapAssociations(row),
    issue: row.issue,
    rootCauses: parseRequiredJson(row.root_causes_json, "decision.rootCauses"),
    evidence: parseRequiredJson(row.evidence_json, "decision.evidence"),
    options: parseRequiredJson(row.options_json, "decision.options"),
    recommendedOption: parseJsonValue(row.recommended_option_json, "decision.recommendedOption"),
    expectedImpact: parseJsonValue(row.expected_impact_json, "decision.expectedImpact"),
    risk: parseJsonValue(row.risk_json, "decision.risk"),
    confidence: row.confidence,
    constraints: parseJsonValue(row.constraints_json, "decision.constraints"),
    requiredApproval: row.required_approval !== 0,
    sourceOpportunityId: row.source_opportunity_id,
    status: row.status as Decision["status"],
    idempotencyKey: row.idempotency_key,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapExperiment(row: ExperimentRow): Experiment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    ...mapAssociations(row),
    title: row.title,
    hypothesis: parseRequiredJson(row.hypothesis_json, "experiment.hypothesis"),
    action: parseJsonValue(row.action_json, "experiment.action"),
    observation: parseJsonValue(row.observation_json, "experiment.observation"),
    result: parseJsonValue(row.result_json, "experiment.result"),
    learning: parseJsonValue(row.learning_json, "experiment.learning"),
    before: parseJsonValue(row.before_json, "experiment.before"),
    after: parseJsonValue(row.after_json, "experiment.after"),
    delta: parseJsonValue(row.delta_json, "experiment.delta"),
    confidence: row.confidence,
    attribution: row.attribution,
    observationWindowDays: row.observation_window_days,
    sourceOpportunityId: row.source_opportunity_id,
    sourceDecisionId: row.source_decision_id,
    status: row.status as Experiment["status"],
    idempotencyKey: row.idempotency_key,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
