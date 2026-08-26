import { describe, expect, it } from "vitest";
import { evaluateExperiment } from "./experiment-engine.js";

function experiment(overrides: Record<string, unknown> = {}) {
  return {
    id: "exp-1",
    hypothesis: "A better keyword bid improves organic rank",
    action: "Increase exact bid",
    metric: "organic_rank",
    expectedDirection: "decrease" as const,
    expectedValue: 12,
    before: 18,
    after: 11,
    evidenceScore: 0.95,
    observationDays: 7,
    plannedObservationDays: 7,
    riskLevel: "low" as const,
    confidence: 0.95,
    constraints: [],
    status: "COMPLETED" as const,
    ...overrides,
  };
}

describe("experiment engine", () => {
  it("measures Before to After, attributes direct evidence, and records learning", () => {
    const result = evaluateExperiment({ experiment: experiment() });

    expect(result).toMatchObject({
      outcome: { status: "EFFECTIVE", attribution: "DIRECT", delta: -7 },
      attribution: "DIRECT",
      learning: { kind: "learning", nextAction: "REUSE" },
      automaticExecutionEligible: true,
    });
  });

  it("keeps incomplete observation in learning mode and blocks automatic execution", () => {
    const result = evaluateExperiment({
      experiment: experiment({ after: null, observationDays: 2, status: "OBSERVING" }),
    });

    expect(result).toMatchObject({
      outcome: { status: "PENDING", attribution: "UNKNOWN" },
      learning: { nextAction: "CONTINUE_OBSERVING" },
      automaticExecutionEligible: false,
    });
  });

  it("does not auto-execute a low-confidence or constraint-conflicted experiment", () => {
    expect(evaluateExperiment({ experiment: experiment({ confidence: 0.69 }) }).automaticExecutionEligible).toBe(false);
    expect(evaluateExperiment({
      experiment: experiment({ constraints: [{ metric: "acos", operator: "lte", value: 0.3, unit: "percent" }] }),
    }).automaticExecutionEligible).toBe(false);
  });
});
