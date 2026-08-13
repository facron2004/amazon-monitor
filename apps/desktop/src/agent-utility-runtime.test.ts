import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntimePersistence } from "@amazon-monitor/agent";
import type {
  DesktopAgentBridgeMessage,
  DesktopAgentRpcMethod,
  DesktopAgentRpcRequest,
  DesktopAgentRunStart,
  AgentModelRuntimeConnection,
} from "@amazon-monitor/shared";
import { AgentUtilityRuntime, safeAgentErrorMessage } from "./agent-utility-runtime.js";

const { executeAmazonAgentRun } = vi.hoisted(() => ({ executeAmazonAgentRun: vi.fn() }));
vi.mock("@amazon-monitor/agent", () => ({ executeAmazonAgentRun }));

const runtimes: AgentUtilityRuntime[] = [];

afterEach(() => {
  runtimes.splice(0).forEach((runtime) => runtime.close());
  executeAmazonAgentRun.mockReset();
});

describe("AgentUtilityRuntime lifecycle", () => {
  it("redacts credentials from provider errors before returning them to the API", () => {
    const message = safeAgentErrorMessage(new Error(
      "request failed: apiKey=sk-live-1234567890123456 Authorization: Bearer token-value",
    ));

    expect(message).not.toContain("sk-live-1234567890123456");
    expect(message).not.toContain("token-value");
    expect(message).toContain("[REDACTED]");
  });

  it("redacts failures reported through agent persistence", async () => {
    executeAmazonAgentRun.mockImplementationOnce(async (
      _config: unknown,
      _backend: unknown,
      persistence: AgentRuntimePersistence,
    ) => {
      persistence.fail(
        12,
        "apiKey=sk-live-1234567890123456 Authorization: Bearer token-value",
      );
    });
    const send = vi.fn<(message: DesktopAgentBridgeMessage) => void>();
    const runtime = new AgentUtilityRuntime(send);
    runtimes.push(runtime);
    const connection: AgentModelRuntimeConnection = {
      id: "connection-1",
      name: "Test connection",
      provider: "openai",
      apiMode: "responses",
      baseUrl: null,
      primaryModel: "test-model",
      fallbackModel: "fallback-model",
      reasoningEnabled: false,
      configured: true,
      apiKey: "configured-api-key",
    };
    runtime.setConnection(connection);

    runtime.handle({
      type: "agent.run.start",
      config: {
        enabled: true,
        primaryModel: "test-model",
        fallbackModel: "fallback-model",
        reasoningEffort: "low",
        maxTurns: 1,
        tracingDisabled: true,
      },
      run: {
        id: 12,
        sessionId: 2,
        orgId: 3,
        userId: 4,
        input: "test",
        taskType: "query",
        freshnessInput: {},
      },
    } satisfies DesktopAgentRunStart);

    await vi.waitFor(() => {
      expect(send).toHaveBeenCalledWith(expect.objectContaining({
        type: "agent.run.fail",
        runId: 12,
      }));
    });
    const failure = send.mock.calls
      .map(([message]) => message)
      .find((message) => message.type === "agent.run.fail");
    expect(failure).toMatchObject({
      type: "agent.run.fail",
      runId: 12,
      errorMessage: expect.not.stringContaining("sk-live-1234567890123456"),
    });
    expect(failure).toMatchObject({
      errorMessage: expect.not.stringContaining("token-value"),
    });
  });

  it("ignores bridge messages after close", async () => {
    const send = vi.fn<(message: DesktopAgentBridgeMessage) => void>();
    const runtime = new AgentUtilityRuntime(send);
    runtimes.push(runtime);
    runtime.close();

    runtime.handle({
      type: "agent.run.start",
      config: {
        enabled: true,
        primaryModel: "test-model",
        fallbackModel: "fallback-model",
        reasoningEffort: "low",
        maxTurns: 1,
        tracingDisabled: true,
      },
      run: {
        id: 1,
        sessionId: 2,
        orgId: 3,
        userId: 4,
        input: "test",
        taskType: "query",
        freshnessInput: {},
      },
    } satisfies DesktopAgentRunStart);

    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects pending RPCs and does not recreate them after close", async () => {
    const send = vi.fn<(message: DesktopAgentBridgeMessage) => void>();
    const runtime = new AgentUtilityRuntime(send);
    runtimes.push(runtime);
    const request = (runtime as unknown as {
      request: (
        runId: number,
        method: DesktopAgentRpcMethod,
        payload: Record<string, unknown>,
      ) => Promise<unknown>;
    }).request.bind(runtime);

    const pending = request(11, "session.get", {});
    const rpcRequest = send.mock.calls[0]?.[0];
    expect(rpcRequest?.type).toBe("agent.rpc.request");
    runtime.close();

    await expect(pending).rejects.toThrow("Agent utility runtime is closed");
    expect(() => runtime.close()).not.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
    expect(rpcRequest).toMatchObject({
      type: "agent.rpc.request",
      runId: 11,
      method: "session.get",
    } satisfies Partial<DesktopAgentRpcRequest>);
  });
});
