import type {
  ActionRiskLevel,
  ConstraintOperator,
  ConstraintValues,
  ConstraintEvaluation,
  IntelligenceApprovalDecision,
  IntelligenceConfidenceLevel,
} from "@amazon-monitor/shared";
import { classifyConfidence, type Constraints } from "@amazon-monitor/shared";

export function evaluateIntelligenceConstraints(
  constraints: Constraints,
  values: ConstraintValues | undefined,
): ConstraintEvaluation {
  const checks = constraints.map((constraint) => {
    const actualValue = values?.[constraint.metric] ?? null;
    const satisfied = actualValue !== null && satisfies(
      constraint.operator,
      actualValue,
      constraint.value,
      constraint.upperValue,
    );
    return {
      metric: constraint.metric,
      operator: constraint.operator,
      expectedValue: constraint.value,
      upperValue: constraint.upperValue ?? null,
      actualValue,
      satisfied,
      conflict: !satisfied,
      reason: actualValue === null
        ? `Missing current value for ${constraint.metric}`
        : satisfied
          ? `${constraint.metric} satisfies ${constraint.operator}`
          : `${constraint.metric} violates ${constraint.operator}`,
    };
  });
  return {
    satisfied: checks.every((check) => check.satisfied),
    conflict: checks.some((check) => check.conflict),
    checks,
  };
}

export function intelligenceApproval(
  confidence: number,
  riskLevel: ActionRiskLevel,
): IntelligenceApprovalDecision {
  const level = toIntelligenceLevel(classifyConfidence(confidence));
  if (level === "LOW") {
    return {
      automatic: false,
      requiresApproval: true,
      confidenceLevel: level,
      reason: "low_confidence",
    };
  }
  if (riskLevel !== "low") {
    return {
      automatic: false,
      requiresApproval: true,
      confidenceLevel: level,
      reason: "risk_requires_approval",
    };
  }
  return {
    automatic: true,
    requiresApproval: false,
    confidenceLevel: level,
    reason: "eligible",
  };
}

export function intelligenceScore(
  expectedImpact: number,
  confidence: number,
  executionEase: number,
  risk: number,
  marketPotential = 1,
): number {
  if (![marketPotential, expectedImpact, confidence, executionEase, risk].every(isUnitInterval) || risk <= 0) return 0;
  return round(marketPotential * confidence * expectedImpact * executionEase / risk);
}

export function isEvidenceAllowed(status: "TRUSTED" | "PARTIAL" | "STALE" | "INVALID"): boolean {
  return status === "TRUSTED" || status === "PARTIAL";
}

function satisfies(
  operator: ConstraintOperator,
  actual: number,
  expected: number,
  upperExpected?: number,
): boolean {
  if (operator === "gte") return actual >= expected;
  if (operator === "lte") return actual <= expected;
  if (operator === "eq") return actual === expected;
  return upperExpected !== undefined && actual >= expected && actual <= upperExpected;
}

function toIntelligenceLevel(level: "high" | "medium" | "low"): IntelligenceConfidenceLevel {
  return level.toUpperCase() as IntelligenceConfidenceLevel;
}

function isUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
