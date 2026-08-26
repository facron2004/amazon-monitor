import { afterEach, describe, expect, it, vi } from "vitest";
import { agentOsApi } from "./api-agent-os";
import { clearRequestCache } from "./api-base";
import { beginSessionBoundary } from "./session-boundary";

afterEach(() => {
  beginSessionBoundary(null);
  clearRequestCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Agent OS API", () => {
  it("connects intelligence, data-quality, and action gateway endpoints", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      new Response(JSON.stringify({}), { status: 200 })
    ));
    vi.stubGlobal("fetch", fetchMock);

    await agentOsApi.listSignals({ limit: 5, offset: 1 });
    await agentOsApi.listOpportunities({ limit: 5, offset: 2 });
    await agentOsApi.listDecisions({ limit: 5 });
    await agentOsApi.listExperiments({ limit: 5 });
    await agentOsApi.getDataQuality({ maxAgeHours: 24 });
    await agentOsApi.approveAction(12, 3);
    await agentOsApi.executeAction(12);
    await agentOsApi.verifyAction(12);
    await agentOsApi.updateSignalStatus("signal-1", "IGNORED");
    await agentOsApi.investigateSignal("signal-1");

    const calls = fetchMock.mock.calls.map(([input, init]) => ({
      path: String(input),
      method: init?.method ?? "GET",
      body: init?.body,
    }));
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /api/agent-os/signals?limit=5&offset=1",
      "GET /api/agent-os/opportunities?limit=5&offset=2",
      "GET /api/agent-os/decisions?limit=5",
      "GET /api/agent-os/experiments?limit=5",
      "GET /api/agent-os/data-quality?maxAgeHours=24",
      "PATCH /api/agent-os/actions/12",
      "POST /api/agent-os/actions/12/execute",
      "POST /api/agent-os/actions/12/verify",
      "PATCH /api/agent-os/signals/signal-1",
      "POST /api/agent-os/signals/signal-1/investigate",
    ]);
    expect(calls[5]?.body).toBe(JSON.stringify({ status: "APPROVED", expectedVersion: 3 }));
    expect(calls[8]?.body).toBe(JSON.stringify({ status: "IGNORED" }));
  });
});
