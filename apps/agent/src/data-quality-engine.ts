/**
 * Deterministic evidence gate shared by the Agent Supervisor workflows.
 * It intentionally returns a decision instead of fetching or mutating data.
 */

export const dataQualityStatuses = ["TRUSTED", "PARTIAL", "STALE", "INVALID"] as const;
export type DataQualityStatus = (typeof dataQualityStatuses)[number];

export type CollectionStatus = "success" | "partial" | "running" | "failed" | "missing";

export interface DataQualitySourceCheck {
  source: string;
  ageHours?: number | null;
  maxAgeHours?: number | null;
  completeness?: number | null;
  collectionStatus?: CollectionStatus;
  mapped?: boolean | null;
  outlier?: boolean | null;
  apiError?: string | null;
}

export interface DataQualityReport {
  status: DataQualityStatus;
  score: number;
  checkedAt: string;
  staleSources: string[];
  missingSources: string[];
  invalidSources: string[];
  warnings: string[];
  refreshRequired: boolean;
}

export interface EvidenceGateDecision {
  allowed: boolean;
  action: "ANALYZE" | "REFRESH" | "STOP";
  reason: string;
  status: DataQualityStatus;
}

export interface OpportunityScoreInput {
  marketPotential: number;
  confidence: number;
  expectedImpact: number;
  executionEase: number;
  risk: number;
}

export interface OpportunityScore {
  score: number;
  eligible: boolean;
  reason: "scored" | "invalid_input" | "zero_risk_without_evidence";
}

export type AgentConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type ApprovalRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface ApprovalPolicyDecision {
  automatic: boolean;
  requiresApproval: boolean;
  confidenceLevel: AgentConfidenceLevel;
  reason: "low_confidence" | "medium_or_high_risk" | "low_risk_eligible";
}

export function assessDataQuality(
  checks: readonly DataQualitySourceCheck[],
  checkedAt: string,
): DataQualityReport {
  const staleSources: string[] = [];
  const missingSources: string[] = [];
  const invalidSources: string[] = [];
  const warnings: string[] = [];
  let totalScore = 0;

  for (const check of checks) {
    let sourceScore = 1;
    const maxAgeHours = check.maxAgeHours ?? 24;
    const ageHours = check.ageHours;
    if (ageHours === null || ageHours === undefined || ageHours > maxAgeHours) {
      staleSources.push(check.source);
      sourceScore -= 0.35;
    }
    if ((check.completeness ?? 1) < 1) {
      sourceScore -= 0.2;
      warnings.push(`${check.source}: completeness is below 100%`);
    }
    if (check.collectionStatus === "missing" || check.collectionStatus === "failed") {
      missingSources.push(check.source);
      sourceScore -= 0.45;
    } else if (check.collectionStatus === "partial" || check.collectionStatus === "running") {
      sourceScore -= 0.2;
    }
    if (check.mapped === false) {
      invalidSources.push(check.source);
      sourceScore -= 0.35;
      warnings.push(`${check.source}: source mapping is incomplete`);
    }
    if (check.outlier === true) {
      sourceScore -= 0.15;
      warnings.push(`${check.source}: outlier detected`);
    }
    if (check.apiError) {
      invalidSources.push(check.source);
      sourceScore -= 0.5;
      warnings.push(`${check.source}: ${check.apiError}`);
    }
    totalScore += Math.max(0, sourceScore);
  }

  const score = checks.length === 0 ? 0 : roundScore(totalScore / checks.length);
  const status = resolveStatus(checks.length, staleSources, missingSources, invalidSources, score);
  return {
    status,
    score,
    checkedAt,
    staleSources: unique(staleSources),
    missingSources: unique(missingSources),
    invalidSources: unique(invalidSources),
    warnings: unique(warnings),
    refreshRequired: status === "STALE" || status === "INVALID",
  };
}

export function applyEvidenceGate(report: DataQualityReport): EvidenceGateDecision {
  if (report.status === "TRUSTED") {
    return { allowed: true, action: "ANALYZE", reason: "Evidence is fresh and complete", status: report.status };
  }
  if (report.status === "PARTIAL") {
    return { allowed: true, action: "ANALYZE", reason: "Evidence is usable with documented gaps", status: report.status };
  }
  if (report.status === "STALE") {
    return { allowed: false, action: "REFRESH", reason: "Refresh stale evidence before analysis", status: report.status };
  }
  return { allowed: false, action: "STOP", reason: "Invalid or missing evidence blocks analysis", status: report.status };
}

export function scoreOpportunity(input: OpportunityScoreInput): OpportunityScore {
  const values = [
    input.marketPotential,
    input.confidence,
    input.expectedImpact,
    input.executionEase,
    input.risk,
  ];
  if (values.some((value) => !isUnitInterval(value))) {
    return { score: 0, eligible: false, reason: "invalid_input" };
  }
  if (input.risk === 0) {
    return { score: 0, eligible: false, reason: "zero_risk_without_evidence" };
  }
  const score = roundScore(
    input.marketPotential
      * input.confidence
      * input.expectedImpact
      * input.executionEase
      / input.risk,
  );
  return { score, eligible: score > 0 && input.confidence >= 0.7, reason: "scored" };
}

export function classifyAgentConfidence(confidence: number): AgentConfidenceLevel {
  if (!isUnitInterval(confidence)) throw new RangeError("confidence must be between 0 and 1");
  if (confidence >= 0.9) return "HIGH";
  if (confidence >= 0.7) return "MEDIUM";
  return "LOW";
}

export function resolveApprovalPolicy(
  confidence: number,
  riskLevel: ApprovalRiskLevel,
): ApprovalPolicyDecision {
  const confidenceLevel = classifyAgentConfidence(confidence);
  if (confidenceLevel === "LOW") {
    return {
      automatic: false,
      requiresApproval: true,
      confidenceLevel,
      reason: "low_confidence",
    };
  }
  if (riskLevel !== "LOW") {
    return {
      automatic: false,
      requiresApproval: true,
      confidenceLevel,
      reason: "medium_or_high_risk",
    };
  }
  return {
    automatic: true,
    requiresApproval: false,
    confidenceLevel,
    reason: "low_risk_eligible",
  };
}

function resolveStatus(
  checkCount: number,
  staleSources: readonly string[],
  missingSources: readonly string[],
  invalidSources: readonly string[],
  score: number,
): DataQualityStatus {
  if (checkCount === 0 || missingSources.length > 0 || invalidSources.length > 0) return "INVALID";
  if (invalidSources.length > 0 || staleSources.length > 0) return "STALE";
  if (score < 0.95) return "PARTIAL";
  return "TRUSTED";
}

function isUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
