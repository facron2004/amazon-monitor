import type { AgentRunEvent } from "@amazon-monitor/shared";
import { describe, expect, it } from "vitest";
import {
  classifyAgentTask,
  executeAmazonAgentRun,
  mergeAgentFreshness,
} from "./orchestrator.js";
import type {
  AgentRuntimePersistence,
  AgentToolBackend,
} from "./runtime-types.js";

describe("Agent planning sequence", () => {
  it("downgrades the effective freshness when a scoped evidence tool is missing", () => {
    const merged = mergeAgentFreshness(
      {
        status: "fresh",
        checkedAt: "2026-08-01T00:00:00.000Z",
        maxAgeHours: 24,
        oldestEvidenceAt: "2026-08-01",
        staleSources: [],
        dataGaps: [],
        warnings: [],
      },
      [{
        toolName: "get_price_history",
        envelope: {
          data: [],
          evidenceRefs: [],
          freshness: {
            status: "missing",
            checkedAt: "2026-08-01T00:00:00.000Z",
            maxAgeHours: 24,
            oldestEvidenceAt: null,
            staleSources: [],
            dataGaps: ["No price evidence"],
            warnings: [],
          },
          dataGaps: ["No price evidence"],
          warnings: [],
        },
      }],
    );
    expect(merged.status).toBe("missing");
    expect(merged.staleSources).toContain("get_price_history");
    expect(merged.dataGaps).toContain("No price evidence");
  });

  it("classifies common Amazon operations tasks deterministically", () => {
    expect(classifyAgentTask("最近 7 天哪些新品进入 Top50")).toBe("investigation");
    expect(classifyAgentTask("执行每日巡检")).toBe("patrol");
    expect(classifyAgentTask("导出分析报告")).toBe("report");
    expect(classifyAgentTask("What is the current rank?")).toBe("query");
  });

  it("emits a readable plan before the mandatory freshness call", async () => {
    const events: string[] = [];
    const persistence: AgentRuntimePersistence = {
      appendEvent: (_runId, type) => {
        events.push(type);
        return {} as AgentRunEvent;
      },
      complete: () => undefined,
      fail: () => undefined,
    };
    const backend: AgentToolBackend = {
      execute: async () => {
        throw new Error("invalid input");
      },
    };

    await expect(executeAmazonAgentRun(
      {
        enabled: true,
        primaryModel: "gpt-5.6-sol",
        fallbackModel: "gpt-5.6-terra",
        reasoningEffort: "medium",
        maxTurns: 10,
        tracingDisabled: true,
      },
      backend,
      persistence,
      {
        input: "Investigate B000TEST01",
        freshnessInput: { datasets: ["category"] },
        context: { orgId: 1, userId: 1, runId: 1 },
      },
    )).rejects.toThrow("invalid input");

    expect(events.slice(0, 4)).toEqual([
      "planning.started",
      "plan.created",
      "freshness.started",
      "tool.started",
    ]);
  });
});
