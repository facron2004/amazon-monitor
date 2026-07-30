import { appendFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  MessageChannelMain,
  utilityProcess,
  type MessagePortMain,
  type UtilityProcess,
} from "electron";
import type {
  AgentModelRuntimeConnection,
  AgentOAuthStartResult,
  AgentOAuthStatus,
} from "@amazon-monitor/shared";
import { BoundedRestartPolicy } from "./restart-policy.js";
import type {
  AgentOAuthCommand,
  AgentOAuthResultMessage,
} from "./desktop-agent-control.js";

export const desktopProcessNames = ["api", "agent", "crawler"] as const;
export type DesktopProcessName = (typeof desktopProcessNames)[number];
export type DesktopProcessStatus = "starting" | "running" | "stopped" | "crashed";

interface ManagedProcess {
  child: UtilityProcess;
  port: MessagePortMain;
}

export interface SupervisorOptions {
  entryPoint: string;
  environment: Record<string, string>;
  logsPath: string;
}

export class DesktopProcessSupervisor {
  private activeConnection: AgentModelRuntimeConnection | null = null;
  private readonly oauthRequests = new Map<string, {
    reject(error: Error): void;
    resolve(value: AgentOAuthStartResult | AgentOAuthStatus | null): void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private readonly processes = new Map<DesktopProcessName, ManagedProcess>();
  private readonly statuses = new Map<DesktopProcessName, DesktopProcessStatus>();
  private stopping = false;

  constructor(
    private readonly options: SupervisorOptions,
    private readonly restartPolicy = new BoundedRestartPolicy(),
  ) {}

  startAll(): void {
    desktopProcessNames.forEach((name) => this.start(name));
  }

  start(name: DesktopProcessName): void {
    this.statuses.set(name, "starting");
    const child = utilityProcess.fork(this.options.entryPoint, [], {
      env: {
        ...process.env,
        ...this.options.environment,
        DESKTOP_PROCESS_ROLE: name,
      },
      serviceName: `amazon-monitor-${name}`,
      stdio: "pipe",
    });
    const channel = new MessageChannelMain();
    channel.port1.start();
    channel.port1.on("message", ({ data }) => {
      if (isReadyMessage(data)) {
        this.statuses.set(name, "running");
        if (name === "agent") this.sendAgentConnection(channel.port1);
        if (name === "api") this.sendPublicConnection(channel.port1);
      } else if (isAgentOAuthResult(data)) {
        this.resolveOAuthRequest(data);
      } else if (isAgentBridgeMessage(data)) {
        const target = name === "api" ? "agent" : "api";
        if (target) this.processes.get(target)?.port.postMessage(data);
      }
    });
    child.postMessage({ type: "connect" }, [channel.port2]);
    child.stderr?.on("data", (chunk: Buffer) => this.log(name, String(chunk)));
    child.on("exit", (code) => this.handleExit(name, code));
    this.processes.set(name, { child, port: channel.port1 });
  }

  async setAgentConnection(
    connection: AgentModelRuntimeConnection | null,
  ): Promise<void> {
    this.activeConnection = connection;
    const agent = this.processes.get("agent");
    if (agent) this.sendAgentConnection(agent.port);
    const api = this.processes.get("api");
    if (api) this.sendPublicConnection(api.port);
  }

  requestOAuth(
    command: AgentOAuthCommand,
  ): Promise<AgentOAuthStartResult | AgentOAuthStatus | null> {
    const agent = this.processes.get("agent");
    if (!agent || this.statuses.get("agent") !== "running") {
      return Promise.reject(new Error("Agent process is unavailable"));
    }
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.oauthRequests.delete(requestId);
        reject(new Error(`OAuth ${command} request timed out`));
      }, 30_000);
      this.oauthRequests.set(requestId, { reject, resolve, timeout });
      agent.port.postMessage({
        type: "agent.oauth.request",
        requestId,
        command,
      });
    });
  }

  getStatuses(): Record<DesktopProcessName, DesktopProcessStatus> {
    return Object.fromEntries(desktopProcessNames.map((name) => [
      name,
      this.statuses.get(name) ?? "stopped",
    ])) as Record<DesktopProcessName, DesktopProcessStatus>;
  }

  stopAll(): void {
    this.stopping = true;
    this.processes.forEach(({ child, port }, name) => {
      port.close();
      child.kill();
      this.statuses.set(name, "stopped");
    });
    this.processes.clear();
  }

  private handleExit(name: DesktopProcessName, code: number): void {
    this.processes.get(name)?.port.close();
    this.processes.delete(name);
    if (this.stopping) return;
    this.statuses.set(name, "crashed");
    this.log(name, `process exited with code ${code}`);
    if (name === "agent") {
      const error = new Error("Agent process stopped during OAuth request");
      this.oauthRequests.forEach(({ reject, timeout }) => {
        clearTimeout(timeout);
        reject(error);
      });
      this.oauthRequests.clear();
      this.processes.get("api")?.port.postMessage({
        type: "agent.process.unavailable",
        role: "agent",
        errorMessage:
          `Agent process exited with code ${code}; active runs stopped without replay`,
      });
    }
    const decision = this.restartPolicy.recordFailure(name);
    if (decision.restart) {
      setTimeout(() => this.start(name), decision.delayMs);
    }
  }

  private sendAgentConnection(port: MessagePortMain): void {
    port.postMessage({
      connection: this.activeConnection,
      type: "agent.connection.runtime",
    });
  }

  private sendPublicConnection(port: MessagePortMain): void {
    const connection = this.activeConnection
      ? publicConnection(this.activeConnection)
      : null;
    port.postMessage({
      type: "agent.connection.active",
      connection,
    });
  }

  private resolveOAuthRequest(message: AgentOAuthResultMessage): void {
    const pending = this.oauthRequests.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.oauthRequests.delete(message.requestId);
    if (message.ok) pending.resolve(message.result ?? null);
    else pending.reject(new Error(message.errorMessage ?? "OAuth request failed"));
  }

  private log(name: DesktopProcessName, message: string): void {
    mkdirSync(this.options.logsPath, { recursive: true });
    appendFileSync(
      join(this.options.logsPath, `${name}.log`),
      `${new Date().toISOString()} ${message.trim()}\n`,
    );
  }
}

function publicConnection(connection: AgentModelRuntimeConnection) {
  const { apiKey: _apiKey, ...summary } = connection;
  return summary;
}

function isReadyMessage(value: unknown): value is { type: "ready" } {
  return typeof value === "object"
    && value !== null
    && "type" in value
    && value.type === "ready";
}

function isAgentBridgeMessage(value: unknown): value is { type: string } {
  return typeof value === "object"
    && value !== null
    && "type" in value
    && typeof value.type === "string"
    && value.type.startsWith("agent.")
    && value.type !== "agent.connection.runtime"
    && value.type !== "agent.oauth.result";
}

function isAgentOAuthResult(value: unknown): value is AgentOAuthResultMessage {
  return typeof value === "object"
    && value !== null
    && "type" in value
    && value.type === "agent.oauth.result"
    && "requestId" in value
    && typeof value.requestId === "string"
    && "ok" in value
    && typeof value.ok === "boolean";
}
