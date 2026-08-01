import type {
  DesktopAgentBridgeMessage,
} from "@amazon-monitor/shared";
import type { MessagePortMain } from "electron";
import { AgentUtilityRuntime } from "./agent-utility-runtime.js";
import type {
  AgentConnectionRuntimeMessage,
  AgentOAuthRequestMessage,
} from "./desktop-agent-control.js";

type ProcessRole = "api" | "agent" | "crawler";

const role = parseRole(process.env.DESKTOP_PROCESS_ROLE);
let agentRuntime: AgentUtilityRuntime | null = null;
let apiReceiver:
  | ((message: DesktopAgentBridgeMessage) => Promise<void>)
  | null = null;

process.parentPort.on("message", (event) => {
  const port = event.ports[0];
  if (!port) return;
  void initializeRole(port).catch((error: unknown) => {
    console.error(
      `[Desktop:${role}] initialization failed:`,
      error instanceof Error ? error.stack ?? error.message : String(error),
    );
    process.exit(1);
  });
});

async function initializeRole(port: MessagePortMain): Promise<void> {
  if (role === "api") {
    const apiEntry = requiredEnvironment("DESKTOP_API_ENTRY");
    const bridgeEntry = requiredEnvironment("DESKTOP_API_BRIDGE_ENTRY");
    const bridge = await import(bridgeEntry) as {
      configureDesktopAgentTransport(
        sender: (message: DesktopAgentBridgeMessage) => void,
      ): void;
      receiveDesktopAgentMessage(message: DesktopAgentBridgeMessage): Promise<void>;
    };
    bridge.configureDesktopAgentTransport((message) => port.postMessage(message));
    apiReceiver = bridge.receiveDesktopAgentMessage;
    await import(apiEntry);
  } else if (role === "agent") {
    agentRuntime = new AgentUtilityRuntime((message) => port.postMessage(message));
  } else {
    const { existsSync } = await import("node:fs");
    const { chromium } = await import("playwright");
    if (!existsSync(chromium.executablePath())) {
      throw new Error("Packaged Playwright Chromium is unavailable");
    }
    const storeModule = await import(
      requiredEnvironment("DESKTOP_API_STORE_ENTRY")
    ) as {
      openAppStore(path: string): unknown;
    };
    const workerModule = await import(
      requiredEnvironment("DESKTOP_CRAWLER_ENTRY")
    ) as {
      startWorker(
        store: unknown,
        options: {
          handleSignals: boolean;
          onJobCompleted(job: { id: number }): void;
        },
      ): Promise<void>;
    };
    const crawlerStore = storeModule.openAppStore(requiredEnvironment("DB_PATH"));
    void workerModule.startWorker(crawlerStore, {
      handleSignals: false,
      onJobCompleted: (job) => {
        port.postMessage({ type: "agent.recovery.ready", jobId: job.id });
      },
    })
      .catch((error: unknown) => {
        console.error(
          "[Crawler] Worker stopped:",
          error instanceof Error ? error.message : "unknown error",
        );
        process.exit(1);
      });
  }

  port.on("message", ({ data }) => {
    if (isAgentConnectionMessage(data) && role === "agent") {
      agentRuntime?.setConnection(data.connection);
    } else if (isAgentOAuthRequest(data) && role === "agent") {
      void agentRuntime?.handleOAuthCommand(data.command)
        .then((result) => port.postMessage({
          type: "agent.oauth.result",
          requestId: data.requestId,
          ok: true,
          result,
        }))
        .catch((error: unknown) => port.postMessage({
          type: "agent.oauth.result",
          requestId: data.requestId,
          ok: false,
          errorMessage: error instanceof Error ? error.message : "OAuth request failed",
        }));
    } else if (isBridgeMessage(data)) {
      if (role === "agent") agentRuntime?.handle(data);
      else if (role === "api") void apiReceiver?.(data);
    } else if (isPingMessage(data)) {
      port.postMessage({ role, type: "pong" });
    }
  });
  port.postMessage({ role, type: "ready" });
  port.on("close", () => {
    agentRuntime?.close();
  });
  port.start();
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseRole(value: string | undefined): ProcessRole {
  if (value === "api" || value === "agent" || value === "crawler") return value;
  throw new Error("Invalid desktop utility process role");
}

function isAgentConnectionMessage(
  value: unknown,
): value is AgentConnectionRuntimeMessage {
  return isRecord(value)
    && value.type === "agent.connection.runtime"
    && (isRecord(value.connection) || value.connection === null);
}

function isAgentOAuthRequest(value: unknown): value is AgentOAuthRequestMessage {
  return isRecord(value)
    && value.type === "agent.oauth.request"
    && typeof value.requestId === "string"
    && ["start", "status", "logout"].includes(String(value.command));
}

function isBridgeMessage(value: unknown): value is DesktopAgentBridgeMessage {
  return isRecord(value)
    && typeof value.type === "string"
    && value.type.startsWith("agent.")
    && value.type !== "agent.connection.runtime"
    && value.type !== "agent.oauth.request"
    && value.type !== "agent.oauth.result";
}

function isPingMessage(value: unknown): value is { type: "ping" } {
  return isRecord(value) && value.type === "ping";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
