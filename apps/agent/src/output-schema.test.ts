import { describe, expect, it } from "vitest";
import { agentRunOutputSchema } from "./output-schema.js";
import {
  getAgentDynamicToolSpecs,
  getAgentRunOutputJsonSchema,
} from "./json-schema.js";

describe("Agent structured output schema", () => {
  it("uses required nullable scope fields accepted by strict structured output", () => {
    const output = completeOutput();

    expect(agentRunOutputSchema.parse(output)).toEqual(output);
    expect(() => agentRunOutputSchema.parse({
      ...output,
      conclusions: [{
        ...output.conclusions[0],
        scope: { asin: "B000TEST01" },
      }],
    })).toThrow();
  });

  it("uses fixed action payloads instead of an unconstrained object", () => {
    const output = completeOutput();

    expect(() => agentRunOutputSchema.parse({
      ...output,
      recommendedActions: [{
        ...output.recommendedActions[0],
        payload: {},
      }],
    })).toThrow();
  });

  it("exports strict JSON schemas for the OAuth app-server bridge", () => {
    const tools = getAgentDynamicToolSpecs();
    const outputSchema = getAgentRunOutputJsonSchema();

    expect(tools).toHaveLength(15);
    expect(tools[0]).toMatchObject({
      type: "function",
      inputSchema: { type: "object" },
    });
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(15);
    expect(outputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
  });
});

function completeOutput() {
  return {
    summary: "Create a follow-up task",
    conclusions: [{
      text: "Evidence supports a pricing review",
      scope: {
        marketplace: "amazon.com",
        asin: "B000TEST01",
        categoryId: null,
        categoryName: null,
        from: "2026-07-23",
        to: "2026-07-30",
      },
      evidenceRefs: [{
        kind: "price",
        id: "price:1",
        label: "Price history",
        observedAt: "2026-07-30T00:00:00.000Z",
      }],
      snapshotRefs: [{
        kind: "snapshot",
        id: "snapshot:1",
        label: "Price snapshot",
        observedAt: "2026-07-30T00:00:00.000Z",
      }],
      confidence: 0.8,
    }],
    freshness: {
      status: "fresh" as const,
      checkedAt: "2026-07-30T00:00:00.000Z",
      maxAgeHours: 24,
      oldestEvidenceAt: "2026-07-30T00:00:00.000Z",
      staleSources: [],
      dataGaps: [],
      warnings: [],
    },
    riskNotes: [],
    recommendedActions: [{
      type: "create_task" as const,
      title: "Review price",
      rationale: "The observed price moved",
      riskLevel: "L2" as const,
      requiresApproval: true as const,
      payload: {
        title: "Review price",
        description: null,
        taskType: "price" as const,
        priority: "P1" as const,
        relatedAsin: "B000TEST01",
        relatedCategoryId: null,
      },
    }],
  };
}
