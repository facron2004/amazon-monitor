import type { JsonValue } from "./types.js";

export const actionExecutionStatuses = ["RUNNING", "SUCCEEDED", "FAILED", "UNCERTAIN", "VERIFIED"] as const;
export type ActionExecutionStatus = (typeof actionExecutionStatuses)[number];

export interface ActionExecution {
  id: number;
  organizationId: number;
  actionProposalId: number;
  idempotencyKey: string;
  executor: string;
  status: ActionExecutionStatus;
  result: JsonValue | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  version: number;
}

export interface CreateActionExecutionInput {
  organizationId: number;
  actionProposalId: number;
  idempotencyKey: string;
  executor: string;
}

export interface UpdateActionExecutionInput {
  status?: ActionExecutionStatus;
  result?: JsonValue | null;
  errorMessage?: string | null;
  completedAt?: string | null;
  expectedVersion?: number;
}

export interface ActionExecutionListFilter {
  organizationId: number;
  actionProposalId?: number;
  status?: ActionExecutionStatus;
  limit?: number;
  offset?: number;
}

export interface ActionExecutionPersistenceAdapter {
  createActionExecution(input: CreateActionExecutionInput): ActionExecution;
  getActionExecution(id: number, organizationId: number): ActionExecution | null;
  getActionExecutionByKey(organizationId: number, idempotencyKey: string): ActionExecution | null;
  listActionExecutions(filter: ActionExecutionListFilter): ActionExecution[];
  updateActionExecution(
    id: number,
    organizationId: number,
    input: UpdateActionExecutionInput,
  ): ActionExecution | null;
}
