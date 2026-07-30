import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  MessageChannelMain,
  utilityProcess,
  type MessagePortMain,
  type UtilityProcess,
} from "electron";
import { BoundedRestartPolicy } from "./restart-policy.js";

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
  private agentApiKey: string | null = null;
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
        if (name === "agent") this.sendAgentApiKey(channel.port1);
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

  async setAgentApiKey(apiKey: string | null): Promise<void> {
    this.agentApiKey = apiKey;
    const agent = this.processes.get("agent");
    if (agent) this.sendAgentApiKey(agent.port);
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

  private sendAgentApiKey(port: MessagePortMain): void {
    port.postMessage({
      apiKey: this.agentApiKey,
      type: "agent.api-key",
    });
  }

  private log(name: DesktopProcessName, message: string): void {
    mkdirSync(this.options.logsPath, { recursive: true });
    appendFileSync(
      join(this.options.logsPath, `${name}.log`),
      `${new Date().toISOString()} ${message.trim()}\n`,
    );
  }
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
    && value.type !== "agent.api-key";
}
