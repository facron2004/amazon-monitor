import { randomUUID } from "node:crypto";
import {
  executeAmazonAgentRun,
  type AgentExecutionContext,
  type AgentInputItem,
  type AgentRuntimePersistence,
  type AgentSdkSession,
  type AgentToolBackend,
} from "@amazon-monitor/agent";
import type {
  AgentModelRuntimeConnection,
  AgentRunEvent,
  AgentToolEnvelope,
  AgentToolName,
  DesktopAgentBridgeMessage,
  DesktopAgentRpcMethod,
  DesktopAgentRpcResult,
  DesktopAgentRunStart,
} from "@amazon-monitor/shared";
import type { AgentOAuthCommand } from "./desktop-agent-control.js";
import { CodexAppServerClient } from "./codex-app-server-client.js";
import { redactLogMessage } from "./log-redaction.js";
import { executeOAuthAgentRun } from "./oauth-agent-runner.js";

type MessageSender = (message: DesktopAgentBridgeMessage) => void;

interface PendingRpc {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class AgentUtilityRuntime {
  private connection: AgentModelRuntimeConnection | null = null;
  private codexClient: CodexAppServerClient | null = null;
  private readonly controllers = new Map<number, AbortController>();
  private readonly pending = new Map<string, PendingRpc>();
  private closed = false;

  constructor(private readonly send: MessageSender) {}

  setConnection(connection: AgentModelRuntimeConnection | null): void {
    if (this.closed) return;
    this.connection = connection;
    if (connection?.provider !== "chatgpt-oauth") {
      this.codexClient?.close();
      this.codexClient = null;
    }
  }

  async handleOAuthCommand(command: AgentOAuthCommand) {
    if (this.closed) throw new Error("Agent utility runtime is closed");
    const client = this.getCodexClient();
    if (command === "start") return client.startOAuth();
    if (command === "logout") {
      await client.logout();
      return null;
    }
    return client.getOAuthStatus();
  }

  handle(message: DesktopAgentBridgeMessage): void {
    if (this.closed) return;
    if (message.type === "agent.run.start") {
      void this.start(message);
    } else if (message.type === "agent.run.cancel") {
      this.controllers.get(message.runId)?.abort();
    } else if (message.type === "agent.rpc.result") {
      this.resolveRpc(message);
    }
  }

  private async start(message: DesktopAgentRunStart): Promise<void> {
    if (this.closed) return;
    if (this.controllers.has(message.run.id)) return;
    if (!this.connection) {
      this.send({
        type: "agent.run.fail",
        runId: message.run.id,
        errorMessage: "No active model connection is configured",
      });
      return;
    }
    if (this.connection.provider !== "chatgpt-oauth" && !this.connection.apiKey) {
      this.send({
        type: "agent.run.fail",
        runId: message.run.id,
        errorMessage: "The active model connection has no API key",
      });
      return;
    }

    const controller = new AbortController();
    this.controllers.set(message.run.id, controller);
    let terminalSent = false;
    const persistence: AgentRuntimePersistence = {
      appendEvent: (runId, eventType, payload = {}) => {
        if (this.closed) return {} as AgentRunEvent;
        this.send({
          type: "agent.run.event",
          runId,
          eventType,
          payload,
        });
        return {} as AgentRunEvent;
      },
      complete: (runId, output) => {
        if (this.closed) return;
        terminalSent = true;
        this.send({ type: "agent.run.complete", runId, output });
      },
      fail: (runId, errorMessage) => {
        if (this.closed) return;
        terminalSent = true;
        this.send({
          type: "agent.run.fail",
          runId,
          errorMessage: safeAgentErrorMessage(errorMessage),
        });
      },
    };
    try {
      const connection = this.connection;
      const backend = new RemoteAgentToolBackend(
        message.run.id,
        this.request.bind(this),
      );
      if (connection.provider === "chatgpt-oauth") {
        await executeOAuthAgentRun(
          this.getCodexClient(),
          connection,
          message.config,
          backend,
          persistence,
          message,
          requiredEnvironment("AMAZON_MONITOR_AGENT_SANDBOX"),
          controller.signal,
        );
      } else {
        await executeAmazonAgentRun(
          {
            ...message.config,
            primaryModel: connection.primaryModel,
            fallbackModel: connection.fallbackModel,
            modelProvider: {
              apiKey: connection.apiKey!,
              baseURL: connection.baseUrl ?? undefined,
              useResponses: connection.apiMode === "responses",
              reasoningEnabled: connection.reasoningEnabled,
            },
          },
          backend,
          persistence,
          {
            input: message.run.input,
            taskType: message.run.taskType,
            freshnessInput: message.run.freshnessInput,
            context: {
              orgId: message.run.orgId,
              userId: message.run.userId,
              runId: message.run.id,
              signal: controller.signal,
            },
            session: new RemoteAgentSession(
              message.run.id,
              message.run.sessionId,
              this.request.bind(this),
            ),
          },
        );
      }
    } catch (error) {
      if (!terminalSent && !this.closed) {
        this.send({
          type: "agent.run.fail",
          runId: message.run.id,
          errorMessage: safeAgentErrorMessage(error),
        });
      }
    } finally {
      this.controllers.delete(message.run.id);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.connection = null;
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Agent utility runtime is closed"));
      this.pending.delete(requestId);
    }
    this.codexClient?.close();
    this.codexClient = null;
  }

  private getCodexClient(): CodexAppServerClient {
    this.codexClient ??= new CodexAppServerClient(
      requiredEnvironment("AMAZON_MONITOR_CODEX_HOME"),
    );
    return this.codexClient;
  }

  private request(
    runId: number,
    method: DesktopAgentRpcMethod,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("Agent utility runtime is closed"));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Desktop Agent RPC timed out: ${method}`));
      }, 30_000);
      this.pending.set(requestId, { reject, resolve, timeout });
      this.send({
        type: "agent.rpc.request",
        requestId,
        runId,
        method,
        payload,
      });
    });
  }

  private resolveRpc(message: DesktopAgentRpcResult): void {
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(message.requestId);
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.errorMessage ?? "Desktop Agent RPC failed"));
  }
}

class RemoteAgentToolBackend implements AgentToolBackend {
  constructor(
    private readonly runId: number,
    private readonly request: (
      runId: number,
      method: DesktopAgentRpcMethod,
      payload: Record<string, unknown>,
    ) => Promise<unknown>,
  ) {}

  async execute(
    toolName: AgentToolName,
    input: Record<string, unknown>,
    _context: AgentExecutionContext,
  ): Promise<AgentToolEnvelope> {
    return await this.request(this.runId, "tool.execute", {
      toolName,
      input,
    }) as AgentToolEnvelope;
  }
}

class RemoteAgentSession implements AgentSdkSession {
  constructor(
    private readonly runId: number,
    private readonly sessionId: number,
    private readonly request: (
      runId: number,
      method: DesktopAgentRpcMethod,
      payload: Record<string, unknown>,
    ) => Promise<unknown>,
  ) {}

  async getSessionId(): Promise<string> {
    return String(this.sessionId);
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    const result = await this.request(this.runId, "session.get", {
      ...(limit === undefined ? {} : { limit }),
    });
    return Array.isArray(result) ? result as AgentInputItem[] : [];
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    await this.request(this.runId, "session.add", { items });
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    const result = await this.request(this.runId, "session.pop", {});
    return isRecord(result) ? result as AgentInputItem : undefined;
  }

  async clearSession(): Promise<void> {
    await this.request(this.runId, "session.clear", {});
  }
}

export function safeAgentErrorMessage(error: unknown): string {
  return redactLogMessage(
    error instanceof Error ? error.message : "Desktop Agent run failed",
  ).slice(0, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
