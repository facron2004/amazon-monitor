import type { ActionProposalStatus, ActionRiskLevel } from "./types.js";

export const lowRiskActionTypes = [
  "RECOLLECT_DATA",
  "CREATE_TASK",
  "CREATE_REPORT",
  "SEND_FEISHU",
  "SEND_EMAIL",
  "EXPORT_CSV",
  "GENERATE_LISTING_DRAFT",
  "GENERATE_ADS_CHANGESET",
  "GENERATE_REPLENISHMENT_PLAN",
] as const;
export type LowRiskActionType = (typeof lowRiskActionTypes)[number];

export interface ActionGatewayPolicyInput {
  type: string;
  riskLevel: ActionRiskLevel;
  confidence: number;
  requiresApproval: boolean;
  status: ActionProposalStatus;
  hasExistingExecution: boolean;
}

export type ActionGatewayPolicyReason =
  | "idempotent"
  | "unsupported_action"
  | "risk_requires_approval"
  | "invalid_confidence"
  | "low_confidence_requires_approval"
  | "approval_required"
  | "invalid_status"
  | "eligible";

export interface ActionGatewayPolicyDecision {
  allowed: boolean;
  idempotent: boolean;
  requiresApproval: boolean;
  reason: ActionGatewayPolicyReason;
  executor: LowRiskActionType | null;
}

export function evaluateActionGatewayPolicy(input: ActionGatewayPolicyInput): ActionGatewayPolicyDecision {
  if (input.hasExistingExecution) return {
    allowed: true, idempotent: true, requiresApproval: false, reason: "idempotent", executor: asLowRisk(input.type),
  };
  const executor = asLowRisk(input.type);
  if (!executor) return denied("unsupported_action");
  if (input.riskLevel !== "LOW") return denied("risk_requires_approval");
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) return denied("invalid_confidence");
  if (input.confidence < 0.7 && !input.requiresApproval) return denied("low_confidence_requires_approval");
  if (input.requiresApproval && input.status !== "APPROVED") return denied("approval_required");
  if (!input.requiresApproval && input.status !== "PROPOSED" && input.status !== "APPROVED") return denied("invalid_status");
  if (input.requiresApproval && input.status === "APPROVED") return {
    allowed: true, idempotent: false, requiresApproval: true, reason: "eligible", executor,
  };
  return { allowed: true, idempotent: false, requiresApproval: false, reason: "eligible", executor };
}

export function isAllowedActionStatusTransition(
  current: ActionProposalStatus,
  next: ActionProposalStatus,
): boolean {
  return actionProposalStatusTransitions[current]?.includes(next) ?? false;
}

export const actionProposalStatusTransitions: Readonly<
  Record<ActionProposalStatus, readonly ActionProposalStatus[]>
> = {
  PROPOSED: ["APPROVED", "CANCELLED", "EXECUTING"],
  APPROVED: ["EXECUTING", "CANCELLED"],
  EXECUTING: ["SUCCEEDED", "FAILED", "CANCELLED"],
  SUCCEEDED: ["VERIFYING"],
  VERIFYING: ["EFFECTIVE", "INEFFECTIVE", "ROLLBACK"],
  FAILED: ["ROLLBACK", "CANCELLED"],
  ROLLBACK: ["PROPOSED", "CANCELLED"],
  CANCELLED: [],
  EFFECTIVE: [],
  INEFFECTIVE: [],
};

function asLowRisk(type: string): LowRiskActionType | null {
  return lowRiskActionTypes.includes(type as LowRiskActionType) ? type as LowRiskActionType : null;
}

function denied(reason: Exclude<ActionGatewayPolicyReason, "eligible" | "idempotent">): ActionGatewayPolicyDecision {
  return { allowed: false, idempotent: false, requiresApproval: true, reason, executor: null };
}
