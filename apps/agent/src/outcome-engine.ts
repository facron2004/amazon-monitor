/**
 * Deterministic Before -> After -> Attribution measurement for Action Gateway
 * and Experiment / Learning Center workflows. It never claims causality when
 * the observation window or evidence quality is insufficient.
 */

export const outcomeStatuses = ["EFFECTIVE", "INEFFECTIVE", "INCONCLUSIVE", "PENDING"] as const;
export type OutcomeStatus = (typeof outcomeStatuses)[number];
export type OutcomeAttribution = "DIRECT" | "CORRELATED" | "UNKNOWN";
export type OutcomeDirection = "increase" | "decrease" | "maintain";

export interface OutcomeInput {
  metric: string;
  before: number | null;
  after: number | null;
  expectedValue?: number | null;
  expectedDirection: OutcomeDirection;
  evidenceScore: number;
  observationDays: number;
  plannedObservationDays: number;
  confounders?: readonly string[];
}

export interface OutcomeMeasurement {
  metric: string;
  status: OutcomeStatus;
  attribution: OutcomeAttribution;
  before: number | null;
  after: number | null;
  delta: number | null;
  deltaPercent: number | null;
  expectedValue: number | null;
  observationDays: number;
  conclusion: string;
  confidence: number;
  confounders: string[];
}

export interface OutcomeMemory {
  kind: "outcome";
  metric: string;
  context: { before: number | null; after: number | null; delta: number | null };
  actualResult: { status: OutcomeStatus; attribution: OutcomeAttribution };
  conclusion: string;
  confidence: number;
}

export function measureOutcome(input: OutcomeInput): OutcomeMeasurement {
  validateInput(input);
  const confounders = [...new Set(input.confounders ?? [])];
  const delta = input.before === null || input.after === null ? null : input.after - input.before;
  const deltaPercent = delta === null || input.before === null || input.before === 0
    ? null
    : round(delta / Math.abs(input.before));
  const quality = clampUnit(input.evidenceScore);
  const durationComplete = input.observationDays >= input.plannedObservationDays;

  if (input.before === null || input.after === null) {
    return result(input, "PENDING", "UNKNOWN", delta, deltaPercent, 0, "需要 Before 和 After 数据后才能复核结果", confounders);
  }
  if (!durationComplete) {
    return result(input, "PENDING", "UNKNOWN", delta, deltaPercent, round(quality * 0.5), "观察窗口尚未完成，暂不下结论", confounders);
  }

  const directionMet = input.expectedDirection === "increase"
    ? input.after > input.before
    : input.expectedDirection === "decrease"
      ? input.after < input.before
      : input.after === input.before;
  const targetMet = input.expectedValue === undefined || input.expectedValue === null
    ? directionMet
    : input.expectedDirection === "increase"
      ? input.after >= input.expectedValue
      : input.expectedDirection === "decrease"
        ? input.after <= input.expectedValue
        : Math.abs(input.after - input.expectedValue) <= Math.max(Math.abs(input.expectedValue) * 0.02, 0.0001);
  const status: OutcomeStatus = quality < 0.7 || confounders.length > 0
    ? "INCONCLUSIVE"
    : targetMet ? "EFFECTIVE" : "INEFFECTIVE";
  const attribution: OutcomeAttribution = quality >= 0.9 && confounders.length === 0
    ? "DIRECT"
    : quality >= 0.7 ? "CORRELATED" : "UNKNOWN";
  const conclusion = status === "EFFECTIVE"
    ? "Observed result met the planned outcome."
    : status === "INEFFECTIVE"
      ? "Observed result did not meet the planned outcome."
      : "Evidence or observation conditions are insufficient for a causal conclusion.";
  return result(input, status, attribution, delta, deltaPercent, round(quality * (attribution === "DIRECT" ? 1 : 0.8)), conclusion, confounders);
}

export function toOutcomeMemory(measurement: OutcomeMeasurement): OutcomeMemory {
  return {
    kind: "outcome",
    metric: measurement.metric,
    context: {
      before: measurement.before,
      after: measurement.after,
      delta: measurement.delta,
    },
    actualResult: {
      status: measurement.status,
      attribution: measurement.attribution,
    },
    conclusion: measurement.conclusion,
    confidence: measurement.confidence,
  };
}

function result(
  input: OutcomeInput,
  status: OutcomeStatus,
  attribution: OutcomeAttribution,
  delta: number | null,
  deltaPercent: number | null,
  confidence: number,
  conclusion: string,
  confounders: string[],
): OutcomeMeasurement {
  return {
    metric: input.metric,
    status,
    attribution,
    before: input.before,
    after: input.after,
    delta,
    deltaPercent,
    expectedValue: input.expectedValue ?? null,
    observationDays: input.observationDays,
    conclusion,
    confidence,
    confounders,
  };
}

function validateInput(input: OutcomeInput): void {
  if (!input.metric.trim()) throw new Error("metric is required");
  if (!Number.isInteger(input.observationDays) || input.observationDays < 0) throw new Error("observationDays must be non-negative");
  if (!Number.isInteger(input.plannedObservationDays) || input.plannedObservationDays < 1) throw new Error("plannedObservationDays must be positive");
  if (!Number.isFinite(input.evidenceScore) || input.evidenceScore < 0 || input.evidenceScore > 1) throw new Error("evidenceScore must be between 0 and 1");
  for (const value of [input.before, input.after, input.expectedValue ?? null]) {
    if (value !== null && !Number.isFinite(value)) throw new Error("outcome values must be finite numbers or null");
  }
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
