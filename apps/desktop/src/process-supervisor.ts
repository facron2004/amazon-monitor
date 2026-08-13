import { appendFile, mkdir } from "node:fs/promises";
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
import { redactLogMessage } from "./log-redaction.js";
import {
  buildProcessEnvironment,
  pinApiPort,
  resolveProcessInitialization,
} from "./process-environment.js";
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

export interface DesktopProcessReadyMessage {
  type: "ready";
  role: DesktopProcessName;
  port?: number;
  bootId?: string;
}

interface DesktopProcessShutdownAck {
  type: "shutdown.ack";
  requestId: string;
  role: DesktopProcessName;
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
  private readonly initializations = new Map<DesktopProcessName, Record<string, string>>();
  private readonly restartTimers = new Map<DesktopProcessName, ReturnType<typeof setTimeout>>();
  private readonly statuses = new Map<DesktopProcessName, DesktopProcessStatus>();
  private readonly shutdownRequests = new Map<string, {
    name: DesktopProcessName;
    resolve(): void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private readonly logQueues = new Map<DesktopProcessName, Promise<void>>();
  private stopping = false;

  constructor(
    private readonly options: SupervisorOptions,
    private readonly restartPolicy = new BoundedRestartPolicy(),
  ) {}

  async startAll(
    initialization: Record<string, string> = {},
  ): Promise<Record<DesktopProcessName, DesktopProcessReadyMessage>> {
    const ready = {} as Record<DesktopProcessName, DesktopProcessReadyMessage>;
    for (const name of desktopProcessNames) {
      ready[name] = await this.start(name, name === "api" ? initialization : {});
    }
    return ready;
  }

  start(
    name: DesktopProcessName,
    initialization: Record<string, string> = {},
  ): Promise<DesktopProcessReadyMessage> {
    if (this.stopping) {
      return Promise.reject(new Error("Desktop process supervisor is stopping"));
    }
    const pendingRestart = this.restartTimers.get(name);
    if (pendingRestart) {
      clearTimeout(pendingRestart);
      this.restartTimers.delete(name);
    }
    const storedInitialization = this.initializations.get(name);
    const effectiveInitialization = resolveProcessInitialization(
      storedInitialization,
      initialization,
    );
    this.initializations.set(name, effectiveInitialization);
    this.statuses.set(name, "starting");
    const child = utilityProcess.fork(this.options.entryPoint, [], {
      env: buildProcessEnvironment(name, process.env, this.options.environment),
      serviceName: `amazon-monitor-${name}`,
      stdio: "pipe",
    });
    const channel = new MessageChannelMain();
    channel.port1.start();
    const ready = new Promise<DesktopProcessReadyMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`${name} process did not become ready within 30 seconds`));
        child.kill();
      }, 30_000);
      channel.port1.on("message", ({ data }) => {
        if (isReadyMessage(data) && data.role === name) {
          this.statuses.set(name, "running");
          this.restartPolicy.reset(name);
          if (name === "api") pinApiPort(this.options.environment, data.port);
          if (name === "agent") this.sendAgentConnection(channel.port1);
          if (name === "api") this.sendPublicConnection(channel.port1);
          clearTimeout(timeout);
          resolve(data);
        } else if (isShutdownAck(data)) {
          this.resolveShutdown(data);
        } else if (isAgentOAuthResult(data)) {
          this.resolveOAuthRequest(data);
        } else if (isAgentBridgeMessage(data)) {
          const target = name === "api" ? "agent" : "api";
          const targetProcess = this.processes.get(target);
          if (!targetProcess || !postMessageSafely(targetProcess.port, data)) {
            if (name === "api" && target === "agent") {
              this.notifyAgentUnavailable(
                `Agent process unavailable while forwarding ${data.type}`,
              );
            }
          }
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`${name} process exited before ready with code ${code}`));
      });
    });
    this.processes.set(name, { child, port: channel.port1 });
    child.postMessage({ type: "connect", initialization: effectiveInitialization }, [channel.port2]);
    child.stdout?.on("data", (chunk: Buffer) => this.log(name, String(chunk)));
    child.stderr?.on("data", (chunk: Buffer) => this.log(name, String(chunk)));
    child.on("exit", (code) => this.handleExit(name, code, child));
    return ready;
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
      if (!postMessageSafely(agent.port, {
        type: "agent.oauth.request",
        requestId,
        command,
      })) {
        clearTimeout(timeout);
        this.oauthRequests.delete(requestId);
        reject(new Error("Agent process is unavailable"));
      }
    });
  }

  getStatuses(): Record<DesktopProcessName, DesktopProcessStatus> {
    return Object.fromEntries(desktopProcessNames.map((name) => [
      name,
      this.statuses.get(name) ?? "stopped",
    ])) as Record<DesktopProcessName, DesktopProcessStatus>;
  }

  async stopAll(): Promise<void> {
    this.stopping = true;
    this.restartTimers.forEach((timer) => clearTimeout(timer));
    this.restartTimers.clear();
    this.rejectOAuthRequests(new Error("Agent process stopped during desktop shutdown"));
    const entries = [...this.processes.entries()];
    await Promise.all(entries.map(([name, { port }]) => this.requestShutdown(name, port)));
    entries.forEach(([name, { child, port }]) => {
      port.close();
      child.kill();
      this.statuses.set(name, "stopped");
    });
    this.processes.clear();
    this.initializations.clear();
  }

  private handleExit(
    name: DesktopProcessName,
    code: number,
    exitingChild: UtilityProcess,
  ): void {
    const current = this.processes.get(name);
    if (!shouldHandleProcessExit(current?.child, exitingChild)) return;
    current?.port.close();
    this.processes.delete(name);
    this.shutdownRequests.forEach((pending, requestId) => {
      if (pending.name !== name) return;
      clearTimeout(pending.timeout);
      this.shutdownRequests.delete(requestId);
      pending.resolve();
    });
    if (this.stopping) return;
    this.statuses.set(name, "crashed");
    this.log(name, `process exited with code ${code}`);
    if (name === "agent") {
      this.rejectOAuthRequests(new Error("Agent process stopped during OAuth request"));
      this.notifyAgentUnavailable(
        `Agent process exited with code ${code}; active runs stopped without replay`,
      );
    }
    const decision = this.restartPolicy.recordFailure(name);
    if (decision.restart) {
      const timer = setTimeout(() => {
        this.restartTimers.delete(name);
        if (this.stopping) return;
        void this.start(name).catch((error: unknown) => {
          this.log(name, error instanceof Error ? error.stack ?? error.message : String(error));
        });
      }, decision.delayMs);
      this.restartTimers.set(name, timer);
    }
  }

  private requestShutdown(name: DesktopProcessName, port: MessagePortMain): Promise<void> {
    const requestId = randomUUID();
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.shutdownRequests.delete(requestId);
        resolve();
      }, 35_000);
      this.shutdownRequests.set(requestId, { name, resolve, timeout });
      try {
        port.postMessage({ type: "shutdown.request", requestId });
      } catch {
        clearTimeout(timeout);
        this.shutdownRequests.delete(requestId);
        resolve();
      }
    });
  }

  private resolveShutdown(message: DesktopProcessShutdownAck): void {
    const pending = this.shutdownRequests.get(message.requestId);
    if (!pending || pending.name !== message.role) return;
    clearTimeout(pending.timeout);
    this.shutdownRequests.delete(message.requestId);
    pending.resolve();
  }

  private sendAgentConnection(port: MessagePortMain): void {
    postMessageSafely(port, {
      connection: this.activeConnection,
      type: "agent.connection.runtime",
    });
  }

  private sendPublicConnection(port: MessagePortMain): void {
    const connection = this.activeConnection
      ? publicConnection(this.activeConnection)
      : null;
    postMessageSafely(port, {
      type: "agent.connection.active",
      connection,
    });
  }

  private notifyAgentUnavailable(errorMessage: string): void {
    const api = this.processes.get("api");
    if (!api) return;
    postMessageSafely(api.port, {
      type: "agent.process.unavailable",
      role: "agent",
      errorMessage,
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

  private rejectOAuthRequests(error: Error): void {
    this.oauthRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(error);
    });
    this.oauthRequests.clear();
  }

  private log(name: DesktopProcessName, message: string): void {
    const line = `${new Date().toISOString()} ${redactLogMessage(message.trim())}\n`;
    const previous = this.logQueues.get(name) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        await mkdir(this.options.logsPath, { recursive: true });
        await appendFile(join(this.options.logsPath, `${name}.log`), line, "utf8");
      })
      .catch(() => undefined);
    this.logQueues.set(name, next);
  }
}

export function postMessageSafely(
  port: Pick<MessagePortMain, "postMessage"> | undefined,
  message: unknown,
): boolean {
  if (!port) return false;
  try {
    port.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

/** Ignore a late exit event from an older child after a replacement is installed. */
export function shouldHandleProcessExit(
  currentChild: unknown,
  exitingChild: unknown,
): boolean {
  return currentChild === undefined || currentChild === exitingChild;
}

function publicConnection(connection: AgentModelRuntimeConnection) {
  const { apiKey: _apiKey, ...summary } = connection;
  return summary;
}

function isReadyMessage(value: unknown): value is DesktopProcessReadyMessage {
  return typeof value === "object"
    && value !== null
    && "type" in value
    && value.type === "ready"
    && "role" in value
    && typeof value.role === "string"
    && desktopProcessNames.includes(value.role as DesktopProcessName)
    && (!("port" in value) || typeof value.port === "number")
    && (!("bootId" in value) || typeof value.bootId === "string");
}

function isShutdownAck(value: unknown): value is DesktopProcessShutdownAck {
  return typeof value === "object"
    && value !== null
    && "type" in value
    && value.type === "shutdown.ack"
    && "requestId" in value
    && typeof value.requestId === "string"
    && "role" in value
    && typeof value.role === "string"
    && desktopProcessNames.includes(value.role as DesktopProcessName);
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
