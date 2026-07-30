import { describe, expect, it, vi } from "vitest";
import type {
  AgentRunEvent,
  AgentToolEnvelope,
} from "@amazon-monitor/shared";
import { executeToolWithRetry } from "./orchestrator.js";

const envelope: AgentToolEnvelope = {
  data: { rows: [] },
  evidenceRefs: [],
  freshness: {
    status: "fresh",
    checkedAt: "2026-07-29T00:00:00.000Z",
    maxAgeHours: 24,
    oldestEvidenceAt: "2026-07-29T00:00:00.000Z",
    staleSources: [],
    dataGaps: [],
    warnings: [],
  },
  dataGaps: [],
  warnings: [],
};

describe("Agent tool retry", () => {
  it("retries one transient failure and records both attempts", async () => {
    const execute = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("temporary outage"), {
        statusCode: 503,
      }))
      .mockResolvedValueOnce(envelope);
    const events: Array<{ type: string; payload?: Record<string, unknown> }> = [];

    const result = await executeToolWithRetry(
      "check_data_freshness",
      { datasets: ["category"] },
      { execute },
      { orgId: 1, userId: 1, runId: 7 },
      {
        appendEvent: (_runId, type, payload) => {
          events.push({ type, payload });
          return {} as AgentRunEvent;
        },
        complete: vi.fn(),
        fail: vi.fn(),
      },
    );

    expect(result).toEqual(envelope);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(events.map((event) => event.type)).toEqual([
      "tool.started",
      "tool.failed",
      "tool.started",
      "tool.completed",
    ]);
    expect(events[1]?.payload).toMatchObject({ attempt: 1, willRetry: true });
  });
});
