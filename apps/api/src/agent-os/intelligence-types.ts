export type JsonPrimitive = string | number | boolean | null;

export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type IntelligenceResourceId = string | number;

export type OpportunityStatus =
  | "IDENTIFIED"
  | "VALIDATING"
  | "READY"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "ARCHIVED";

export type DecisionStatus =
  | "PROPOSED"
  | "REVIEWING"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "COMPLETED"
  | "CANCELLED";

export type ExperimentStatus =
  | "DRAFT"
  | "RUNNING"
  | "OBSERVING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface IntelligenceAssociations {
  targetType: string | null;
  targetId: IntelligenceResourceId | null;
  goalId: number | null;
  sourceType: string | null;
  sourceId: string | null;
  sourceWorkflowRunId: number | null;
  sourceActionProposalId: number | null;
}

export interface IntelligenceAssociationInput {
  targetType?: string | null;
  targetId?: IntelligenceResourceId | null;
  goalId?: number | null;
  sourceType?: string | null;
  sourceId?: string | null;
  sourceWorkflowRunId?: number | null;
  sourceActionProposalId?: number | null;
}

export interface IntelligenceAssociationFilter {
  targetType?: string;
  targetId?: IntelligenceResourceId;
  goalId?: number;
  sourceType?: string;
  sourceId?: string;
  sourceWorkflowRunId?: number;
  sourceActionProposalId?: number;
}

export interface IntelligenceVersionedResource {
  id: number;
  organizationId: number;
  idempotencyKey: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity extends IntelligenceVersionedResource, IntelligenceAssociations {
  type: string;
  title: string;
  summary: string | null;
  signal: JsonValue | null;
  score: number | null;
  expectedImpact: JsonValue | null;
  risk: JsonValue | null;
  confidence: number | null;
  status: OpportunityStatus;
  details: JsonValue | null;
}

export interface CreateOpportunityInput extends IntelligenceAssociationInput {
  organizationId: number;
  type: string;
  title: string;
  summary?: string | null;
  signal?: JsonValue | null;
  score?: number | null;
  expectedImpact?: JsonValue | null;
  risk?: JsonValue | null;
  confidence?: number | null;
  status?: OpportunityStatus;
  details?: JsonValue | null;
  idempotencyKey?: string;
}

export interface OpportunityListFilter extends IntelligenceAssociationFilter {
  organizationId: number;
  type?: string;
  status?: OpportunityStatus;
  limit?: number;
  offset?: number;
}

export interface UpdateOpportunityInput extends IntelligenceAssociationInput {
  type?: string;
  title?: string;
  summary?: string | null;
  signal?: JsonValue | null;
  score?: number | null;
  expectedImpact?: JsonValue | null;
  risk?: JsonValue | null;
  confidence?: number | null;
  status?: OpportunityStatus;
  details?: JsonValue | null;
  expectedVersion?: number;
}

export interface Decision extends IntelligenceVersionedResource, IntelligenceAssociations {
  issue: string;
  rootCauses: JsonValue;
  evidence: JsonValue;
  options: JsonValue;
  recommendedOption: JsonValue | null;
  expectedImpact: JsonValue | null;
  risk: JsonValue | null;
  confidence: number | null;
  constraints: JsonValue | null;
  requiredApproval: boolean;
  sourceOpportunityId: number | null;
  status: DecisionStatus;
}

export interface CreateDecisionInput extends IntelligenceAssociationInput {
  organizationId: number;
  issue: string;
  rootCauses: JsonValue;
  evidence: JsonValue;
  options: JsonValue;
  recommendedOption?: JsonValue | null;
  expectedImpact?: JsonValue | null;
  risk?: JsonValue | null;
  confidence?: number | null;
  constraints?: JsonValue | null;
  requiredApproval?: boolean;
  sourceOpportunityId?: number | null;
  status?: DecisionStatus;
  idempotencyKey?: string;
}

export interface DecisionListFilter extends IntelligenceAssociationFilter {
  organizationId: number;
  status?: DecisionStatus;
  sourceOpportunityId?: number;
  limit?: number;
  offset?: number;
}

export interface UpdateDecisionInput extends IntelligenceAssociationInput {
  issue?: string;
  rootCauses?: JsonValue;
  evidence?: JsonValue;
  options?: JsonValue;
  recommendedOption?: JsonValue | null;
  expectedImpact?: JsonValue | null;
  risk?: JsonValue | null;
  confidence?: number | null;
  constraints?: JsonValue | null;
  requiredApproval?: boolean;
  sourceOpportunityId?: number | null;
  status?: DecisionStatus;
  expectedVersion?: number;
}

export interface Experiment extends IntelligenceVersionedResource, IntelligenceAssociations {
  title: string;
  hypothesis: JsonValue;
  action: JsonValue | null;
  observation: JsonValue | null;
  result: JsonValue | null;
  learning: JsonValue | null;
  before: JsonValue | null;
  after: JsonValue | null;
  delta: JsonValue | null;
  confidence: number | null;
  attribution: string | null;
  observationWindowDays: number | null;
  sourceOpportunityId: number | null;
  sourceDecisionId: number | null;
  status: ExperimentStatus;
}

export interface CreateExperimentInput extends IntelligenceAssociationInput {
  organizationId: number;
  title: string;
  hypothesis: JsonValue;
  action?: JsonValue | null;
  observation?: JsonValue | null;
  result?: JsonValue | null;
  learning?: JsonValue | null;
  before?: JsonValue | null;
  after?: JsonValue | null;
  delta?: JsonValue | null;
  confidence?: number | null;
  attribution?: string | null;
  observationWindowDays?: number | null;
  sourceOpportunityId?: number | null;
  sourceDecisionId?: number | null;
  status?: ExperimentStatus;
  idempotencyKey?: string;
}

export interface ExperimentListFilter extends IntelligenceAssociationFilter {
  organizationId: number;
  status?: ExperimentStatus;
  sourceOpportunityId?: number;
  sourceDecisionId?: number;
  limit?: number;
  offset?: number;
}

export interface UpdateExperimentInput extends IntelligenceAssociationInput {
  title?: string;
  hypothesis?: JsonValue;
  action?: JsonValue | null;
  observation?: JsonValue | null;
  result?: JsonValue | null;
  learning?: JsonValue | null;
  before?: JsonValue | null;
  after?: JsonValue | null;
  delta?: JsonValue | null;
  confidence?: number | null;
  attribution?: string | null;
  observationWindowDays?: number | null;
  sourceOpportunityId?: number | null;
  sourceDecisionId?: number | null;
  status?: ExperimentStatus;
  expectedVersion?: number;
}

export interface IntelligencePersistenceAdapter {
  createOpportunity(input: CreateOpportunityInput): Opportunity;
  getOpportunity(id: number, organizationId: number): Opportunity | null;
  listOpportunities(filter: OpportunityListFilter): Opportunity[];
  updateOpportunity(id: number, organizationId: number, input: UpdateOpportunityInput): Opportunity | null;
  deleteOpportunity(id: number, organizationId: number, expectedVersion?: number): boolean;

  createDecision(input: CreateDecisionInput): Decision;
  getDecision(id: number, organizationId: number): Decision | null;
  listDecisions(filter: DecisionListFilter): Decision[];
  updateDecision(id: number, organizationId: number, input: UpdateDecisionInput): Decision | null;
  deleteDecision(id: number, organizationId: number, expectedVersion?: number): boolean;

  createExperiment(input: CreateExperimentInput): Experiment;
  getExperiment(id: number, organizationId: number): Experiment | null;
  listExperiments(filter: ExperimentListFilter): Experiment[];
  updateExperiment(id: number, organizationId: number, input: UpdateExperimentInput): Experiment | null;
  deleteExperiment(id: number, organizationId: number, expectedVersion?: number): boolean;
}
