import type { AgentRunOutput } from "@amazon-monitor/shared";
import { describe, expect, it } from "vitest";
import {
  agentGoldLiveScopeSchema,
  runLiveAgentGoldEvaluation,
} from "./eval-gold-set-live.js";
import type { AgentGoldTask } from "./eval-gold-set.js";

const tasks: AgentGoldTask[] = [
  {
    id: "first",
    prompt: "调查 B000TEST01",
    expectedTools: ["check_data_freshness", "get_asin_history"],
    stalePolicy: "recollect_only",
  },
  {
    id: "second",
    prompt: "调查 B000TEST02",
    expectedTools: ["check_data_freshness", "get_asin_history"],
    stalePolicy: "recollect_only",
  },
];

describe("live Agent gold evaluation", () => {
  it("runs tasks sequentially through authenticated Agent routes and records failures", async () => {
    const calls: string[] = [];
    let sessionId = 0;
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/api/auth/login")) {
        return json({}, { headers: { "set-cookie": "session=test; HttpOnly" } });
      }
      if (url.endsWith("/api/agent/sessions")) {
        sessionId += 1;
        return json({ id: sessionId });
      }
      if (url.endsWith("/runs") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { input: string };
        expect(body.input).toContain(sessionId === 1 ? "B000000001" : "B000000002");
        return json(run(sessionId, "created", null));
      }
      const runMatch = /\/api\/agent\/runs\/(\d+)$/.exec(url);
      if (runMatch) {
        const id = Number(runMatch[1]);
        return id === 1
          ? json({
              ...run(id, "completed", output()),
              toolCalls: [
                tool("check_data_freshness", "completed"),
                tool("get_asin_history", "completed"),
              ],
            })
          : json({
              ...run(id, "failed", null),
              errorMessage: "model unavailable",
              toolCalls: [
                tool("check_data_freshness", "completed"),
                tool("get_asin_history", "failed"),
              ],
            });
      }
      if (url.includes("/api/agent/audit?runId=")) {
        return json({ runs: [{ id: Number(new URL(url).searchParams.get("runId")) }] });
      }
      return new Response("Not found", { status: 404 });
    };

    const report = await runLiveAgentGoldEvaluation({
      baseUrl: "http://127.0.0.1:43210/",
      username: "admin",
      password: "secret",
      scope: scope(),
      tasks,
      pollIntervalMs: 1,
      runTimeoutMs: 100,
    }, fetcher);

    expect(report.runs).toHaveLength(2);
    expect(report.runs[1]).toMatchObject({
      taskId: "second",
      status: "failed",
      errorMessage: "model unavailable",
    });
    expect(report.evaluation.tasks[0].result.evidenceSupported).toBe(true);
    expect(report.evaluation.tasks[1].result.evidenceSupported).toBe(false);
    expect(report.evaluation.metrics).toMatchObject({
      dataSupportRate: 0.5,
      toolSuccessRate: 0.75,
    });
    const sessionCalls = calls.flatMap((call, index) =>
      call.endsWith("/api/agent/sessions") ? [index] : []);
    expect(calls.findIndex((call) => call.includes("/audit?runId=1")))
      .toBeLessThan(sessionCalls[1]);
  });

  it("rejects an evaluation scope without ten concrete ASINs", () => {
    expect(() => agentGoldLiveScopeSchema.parse({
      ...scope(),
      asins: ["B000000001"],
    })).toThrow();
  });

  it("continues with later tasks when a live request fails", async () => {
    let sessionId = 0;
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/auth/login")) {
        return json({}, { headers: { "set-cookie": "session=test; HttpOnly" } });
      }
      if (url.endsWith("/api/agent/sessions")) {
        sessionId += 1;
        return json({ id: sessionId });
      }
      if (url.endsWith("/runs") && init?.method === "POST") {
        return json(run(sessionId, "created", null));
      }
      if (url.endsWith("/api/agent/runs/1")) {
        return json({
          ...run(1, "completed", output()),
          toolCalls: [
            tool("check_data_freshness", "completed"),
            tool("get_asin_history", "completed"),
          ],
        });
      }
      if (url.endsWith("/api/agent/runs/2")) {
        throw new Error("temporary network failure");
      }
      if (url.endsWith("/api/agent/runs/2/cancel")) {
        return json(run(2, "failed", null));
      }
      if (url.includes("/api/agent/audit?runId=1")) return json({});
      return new Response("Not found", { status: 404 });
    };

    const report = await runLiveAgentGoldEvaluation({
      baseUrl: "http://127.0.0.1:43210",
      username: "admin",
      password: "secret",
      scope: scope(),
      tasks,
      pollIntervalMs: 1,
      runTimeoutMs: 100,
      requestTimeoutMs: 20,
    }, fetcher);

    expect(report.runs).toHaveLength(2);
    expect(report.runs[1]).toMatchObject({
      taskId: "second",
      runId: 2,
      sessionId: 2,
      status: "failed",
      errorMessage: "temporary network failure",
    });
    expect(report.evaluation.tasks).toHaveLength(2);
  });

  it("discovers a concrete organization scope when no scope file is provided", async () => {
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/auth/login")) {
        return json({}, { headers: { "set-cookie": "session=test; HttpOnly" } });
      }
      if (url.endsWith("/api/categories")) {
        return json([{
          id: 7,
          marketplace: "amazon.com",
          status: "enabled",
        }]);
      }
      if (url.endsWith("/api/keywords")) {
        return json([{
          id: 8,
          marketplace: "amazon.com",
          status: "enabled",
        }]);
      }
      if (url.endsWith("/api/competitors")) {
        return json(Array.from({ length: 10 }, (_, index) => ({
          asin: `B${String(index + 1).padStart(9, "0")}`,
          brand: index % 2 === 0 ? "Alpha" : "Beta",
          marketplace: "amazon.com",
          status: "active",
        })));
      }
      if (url.endsWith("/api/agent/sessions")) return json({ id: 1 });
      if (url.endsWith("/runs") && init?.method === "POST") {
        return json(run(1, "created", null));
      }
      if (url.endsWith("/api/agent/runs/1")) {
        return json({
          ...run(1, "completed", output()),
          toolCalls: [
            tool("check_data_freshness", "completed"),
            tool("get_asin_history", "completed"),
          ],
        });
      }
      if (url.includes("/api/agent/audit?runId=1")) {
        return json({ runs: [{ id: 1 }] });
      }
      return new Response("Not found", { status: 404 });
    };

    const report = await runLiveAgentGoldEvaluation({
      baseUrl: "http://127.0.0.1:43210",
      username: "admin",
      password: "secret",
      tasks: [tasks[0]],
      pollIntervalMs: 1,
      runTimeoutMs: 100,
    }, fetcher);

    expect(report.scope).toMatchObject({
      categoryId: 7,
      keywordId: 8,
      brands: ["Alpha", "Beta"],
    });
    expect(report.scope.asins).toHaveLength(10);
  });
});

function scope() {
  return agentGoldLiveScopeSchema.parse({
    categoryId: 1,
    keywordId: 2,
    marketplace: "amazon.com",
    asins: Array.from(
      { length: 10 },
      (_, index) => `B${String(index + 1).padStart(9, "0")}`,
    ),
    brands: ["Alpha Brand", "Beta Brand"],
  });
}

function run(
  id: number,
  status: "created" | "completed" | "failed",
  runOutput: AgentRunOutput | null,
) {
  return {
    id,
    sessionId: id,
    orgId: 1,
    userId: 1,
    taskType: "investigation",
    input: "Investigate",
    status,
    model: "primary",
    fallbackModel: "fallback",
    output: runOutput,
    errorMessage: null,
    recoveryOfRunId: null,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    completedAt: status === "created" ? null : "2026-07-30T00:01:00.000Z",
  };
}

function tool(
  toolName: "check_data_freshness" | "get_asin_history",
  status: "completed" | "failed",
) {
  return {
    id: 1,
    runId: 1,
    stepId: null,
    toolName,
    arguments: {},
    result: null,
    status,
    startedAt: "2026-07-30T00:00:00.000Z",
    completedAt: "2026-07-30T00:00:01.000Z",
    errorMessage: status === "failed" ? "failed" : null,
  };
}

function output(): AgentRunOutput {
  return {
    summary: "Summary",
    conclusions: [{
      text: "Supported",
      scope: {
        marketplace: null,
        asin: "B000000001",
        categoryId: null,
        categoryName: null,
        from: null,
        to: null,
      },
      evidenceRefs: [{
        kind: "snapshot",
        id: "1",
        label: "Evidence",
        observedAt: null,
      }],
      snapshotRefs: [{
        kind: "snapshot",
        id: "1",
        label: "Snapshot",
        observedAt: null,
      }],
      confidence: 0.8,
    }],
    freshness: {
      status: "fresh",
      checkedAt: "2026-07-30T00:00:00.000Z",
      maxAgeHours: 24,
      oldestEvidenceAt: "2026-07-30T00:00:00.000Z",
      staleSources: [],
      dataGaps: [],
      warnings: [],
    },
    riskNotes: [],
    recommendedActions: [],
  };
}

function json(
  value: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}
