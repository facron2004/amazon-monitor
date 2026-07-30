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
  AgentRunEvent,
  AgentToolEnvelope,
  AgentToolName,
  DesktopAgentBridgeMessage,
  DesktopAgentRpcMethod,
  DesktopAgentRpcResult,
  DesktopAgentRunStart,
} from "@amazon-monitor/shared";

type MessageSender = (message: DesktopAgentBridgeMessage) => void;

interface PendingRpc {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class AgentUtilityRuntime {
  private apiKey: string | null = null;
  private readonly controllers = new Map<number, AbortController>();
  private readonly pending = new Map<string, PendingRpc>();

  constructor(private readonly send: MessageSender) {}

  setApiKey(apiKey: string | null): void {
    this.apiKey = apiKey;
    if (apiKey) process.env.OPENAI_API_KEY = apiKey;
    else delete process.env.OPENAI_API_KEY;
  }

  handle(message: DesktopAgentBridgeMessage): void {
    if (message.type === "agent.run.start") {
      void this.start(message);
    } else if (message.type === "agent.run.cancel") {
      this.controllers.get(message.runId)?.abort();
    } else if (message.type === "agent.rpc.result") {
      this.resolveRpc(message);
    }
  }

  private async start(message: DesktopAgentRunStart): Promise<void> {
    if (this.controllers.has(message.run.id)) return;
    if (!this.apiKey) {
      this.send({
        type: "agent.run.fail",
        runId: message.run.id,
        errorMessage: "OpenAI API key is not configured in desktop safeStorage",
      });
      return;
    }

    const controller = new AbortController();
    this.controllers.set(message.run.id, controller);
    let terminalSent = false;
    const persistence: AgentRuntimePersistence = {
      appendEvent: (runId, eventType, payload = {}) => {
        this.send({
          type: "agent.run.event",
          runId,
          eventType,
          payload,
        });
        return {} as AgentRunEvent;
      },
      complete: (runId, output) => {
        terminalSent = true;
        this.send({ type: "agent.run.complete", runId, output });
      },
      fail: (runId, errorMessage) => {
        terminalSent = true;
        this.send({ type: "agent.run.fail", runId, errorMessage });
      },
    };
    try {
      await executeAmazonAgentRun(
        message.config,
        new RemoteAgentToolBackend(message.run.id, this.request.bind(this)),
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
    } catch (error) {
      if (!terminalSent) {
        this.send({
          type: "agent.run.fail",
          runId: message.run.id,
          errorMessage: safeErrorMessage(error),
        });
      }
    } finally {
      this.controllers.delete(message.run.id);
    }
  }

  private request(
    runId: number,
    method: DesktopAgentRpcMethod,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
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

function safeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Desktop Agent run failed")
    .slice(0, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
