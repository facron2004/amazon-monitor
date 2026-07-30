import { describe, expect, it } from "vitest";
import type { AgentRunOutput } from "@amazon-monitor/shared";
import { applyFreshnessPolicy } from "./orchestrator.js";

const output: AgentRunOutput = {
  summary: "Price moved lower",
  conclusions: [{
    text: "Observed a lower price",
    scope: { asin: "B000TEST01", from: "2026-07-22", to: "2026-07-29" },
    evidenceRefs: [{ kind: "price", id: "price:1", label: "Price evidence" }],
    snapshotRefs: [{ kind: "snapshot", id: "snapshot:1", label: "Snapshot" }],
    confidence: 0.88,
  }],
  freshness: {
    status: "fresh",
    checkedAt: "2026-07-29T00:00:00.000Z",
    maxAgeHours: 24,
    oldestEvidenceAt: "2026-07-29",
    staleSources: [],
    dataGaps: [],
    warnings: [],
  },
  riskNotes: [],
  recommendedActions: [
    {
      type: "create_task",
      title: "Review pricing",
      rationale: "Price moved",
      riskLevel: "L2",
      requiresApproval: true,
      payload: {},
    },
    {
      type: "recollect",
      title: "Refresh evidence",
      rationale: "Evidence may be stale",
      riskLevel: "L2",
      requiresApproval: true,
      payload: {},
    },
  ],
};

describe("applyFreshnessPolicy", () => {
  it("caps confidence and keeps only recollection when evidence is unsafe", () => {
    const guarded = applyFreshnessPolicy(output, {
      ...output.freshness,
      status: "stale",
      staleSources: ["price"],
      warnings: ["Price evidence is stale"],
    });

    expect(guarded.conclusions[0]?.confidence).toBe(0.49);
    expect(guarded.recommendedActions).toEqual([
      expect.objectContaining({ type: "recollect" }),
    ]);
    expect(guarded.riskNotes).toContain(
      "Evidence is not fresh enough for a deterministic conclusion or direct execution.",
    );
  });
});
