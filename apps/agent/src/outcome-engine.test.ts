import { describe, expect, it } from "vitest";
import { measureOutcome, toOutcomeMemory } from "./outcome-engine.js";

describe("outcome engine", () => {
  it("measures effective results and writes an outcome memory shape", () => {
    const measurement = measureOutcome({
      metric: "organic_rank",
      before: 18,
      after: 11,
      expectedValue: 12,
      expectedDirection: "decrease",
      evidenceScore: 0.95,
      observationDays: 7,
      plannedObservationDays: 7,
    });

    expect(measurement).toMatchObject({ status: "EFFECTIVE", attribution: "DIRECT", delta: -7, confidence: 0.95 });
    expect(toOutcomeMemory(measurement)).toMatchObject({
      kind: "outcome",
      actualResult: { status: "EFFECTIVE", attribution: "DIRECT" },
    });
  });

  it("does not claim causality for incomplete or confounded evidence", () => {
    expect(measureOutcome({
      metric: "revenue",
      before: 100,
      after: 120,
      expectedDirection: "increase",
      evidenceScore: 0.95,
      observationDays: 3,
      plannedObservationDays: 7,
    }).status).toBe("PENDING");
    expect(measureOutcome({
      metric: "acos",
      before: 0.4,
      after: 0.3,
      expectedDirection: "decrease",
      evidenceScore: 0.92,
      observationDays: 7,
      plannedObservationDays: 7,
      confounders: ["promotion changed"],
    })).toMatchObject({ status: "INCONCLUSIVE", attribution: "CORRELATED" });
  });
});
