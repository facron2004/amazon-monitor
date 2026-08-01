import {
  agentToolNames,
  type AgentRun,
  type AgentModelConnectionSummary,
  type DesktopAgentBridgeMessage,
  type DesktopAgentRpcRequest,
  type DesktopAgentRunStart,
} from "@amazon-monitor/shared";
import type { AgentRuntimePersistence } from "@amazon-monitor/agent";
import type { Store } from "../store.js";
import { StoreAgentToolBackend } from "./agent-tool-backend.js";
import { SqliteAgentSession } from "./sqlite-agent-session.js";

type MessageSender = (message: DesktopAgentBridgeMessage) => void;

interface ActiveRemoteRun {
  persistence: AgentRuntimePersistence;
  run: AgentRun;
}

let sender: MessageSender | null = null;
let store: Store | null = null;
let activeConnection: AgentModelConnectionSummary | null = null;
let recoveryStarter:
  | ((run: AgentRun, freshnessInput: Record<string, unknown>) => void)
  | null = null;
const activeRuns = new Map<number, ActiveRemoteRun>();

export function configureDesktopAgentTransport(
  messageSender: MessageSender,
): void {
  sender = messageSender;
}

export function configureDesktopAgentStore(value: Store): void {
  store = value;
}

export function configureDesktopAgentRecoveryStarter(
  starter: (run: AgentRun, freshnessInput: Record<string, unknown>) => void,
): void {
  recoveryStarter = starter;
}

export function hasDesktopAgentTransport(): boolean {
  return sender !== null;
}

export function getDesktopAgentConnection(): AgentModelConnectionSummary | null {
  return activeConnection;
}

export function startDesktopAgentRun(
  run: AgentRun,
  freshnessInput: Record<string, unknown>,
  config: DesktopAgentRunStart["config"],
  persistence: AgentRuntimePersistence,
): void {
  if (!sender) throw new Error("Desktop Agent transport is unavailable");
  activeRuns.set(run.id, { persistence, run });
  sender({
    type: "agent.run.start",
    config,
    run: {
      id: run.id,
      sessionId: run.sessionId,
      orgId: run.orgId,
      userId: run.userId,
      input: run.input,
      taskType: run.taskType,
      freshnessInput,
    },
  });
}

export function cancelDesktopAgentRun(runId: number): void {
  sender?.({ type: "agent.run.cancel", runId });
}

export async function receiveDesktopAgentMessage(
  message: DesktopAgentBridgeMessage,
): Promise<void> {
  if (message.type === "agent.connection.active") {
    activeConnection = message.connection;
    return;
  }
  if (message.type === "agent.process.unavailable") {
    for (const [runId, active] of activeRuns) {
      active.persistence.fail(runId, message.errorMessage);
      activeRuns.delete(runId);
    }
    return;
  }
  if (message.type === "agent.recovery.ready") {
    startRecoveryForJob(message.jobId);
    return;
  }
  if (message.type === "agent.rpc.request") {
    await handleRpcRequest(message);
    return;
  }
  if (message.type === "agent.run.event") {
    activeRuns.get(message.runId)?.persistence.appendEvent(
      message.runId,
      message.eventType,
      message.payload,
    );
    return;
  }
  if (message.type === "agent.run.complete") {
    const active = activeRuns.get(message.runId);
    active?.persistence.complete(message.runId, message.output);
    activeRuns.delete(message.runId);
    return;
  }
  if (message.type === "agent.run.fail") {
    const active = activeRuns.get(message.runId);
    active?.persistence.fail(message.runId, message.errorMessage);
    activeRuns.delete(message.runId);
  }
}

export function startRecoveryForJob(jobId: number): boolean {
  const recoveries = store?.listAgentRecoveryRunsForJob(jobId) ?? [];
  if (!recoveries.length || !recoveryStarter) return false;
  let started = false;
  for (const recovery of recoveries) {
    store?.appendAgentRunEvent({
      runId: recovery.run.id,
      type: "recovery.collection_completed",
      payload: { jobId },
    });
    try {
      recoveryStarter(recovery.run, recovery.freshnessInput);
      started = true;
    } catch (error) {
      const errorMessage = safeErrorMessage(error);
      store?.updateAgentRun(recovery.run.id, recovery.run.orgId, {
        status: "failed",
        errorMessage,
        completedAt: new Date().toISOString(),
      });
      store?.appendAgentRunEvent({
        runId: recovery.run.id,
        type: "recovery.failed",
        payload: { errorMessage, jobId },
      });
    }
  }
  return started;
}

async function handleRpcRequest(message: DesktopAgentRpcRequest): Promise<void> {
  if (!sender) return;
  try {
    const result = await executeRpcRequest(message);
    sender({
      type: "agent.rpc.result",
      requestId: message.requestId,
      ok: true,
      result,
    });
  } catch (error) {
    sender({
      type: "agent.rpc.result",
      requestId: message.requestId,
      ok: false,
      errorMessage: safeErrorMessage(error),
    });
  }
}

async function executeRpcRequest(message: DesktopAgentRpcRequest): Promise<unknown> {
  const active = activeRuns.get(message.runId);
  if (!active || !store) throw new Error("Agent run is not active");
  if (message.method === "tool.execute") {
    const toolName = message.payload.toolName;
    const input = message.payload.input;
    if (
      typeof toolName !== "string"
      || !agentToolNames.includes(toolName as (typeof agentToolNames)[number])
      || !isRecord(input)
    ) {
      throw new Error("Invalid Agent tool request");
    }
    return new StoreAgentToolBackend(store).execute(
      toolName as (typeof agentToolNames)[number],
      input,
      {
        orgId: active.run.orgId,
        userId: active.run.userId,
        runId: active.run.id,
      },
    );
  }

  const session = new SqliteAgentSession(store, active.run.sessionId);
  if (message.method === "session.get") {
    const limit = typeof message.payload.limit === "number"
      ? message.payload.limit
      : undefined;
    return session.getItems(limit);
  }
  if (message.method === "session.add") {
    if (!Array.isArray(message.payload.items)) throw new Error("Invalid session items");
    await session.addItems(
      message.payload.items as Parameters<SqliteAgentSession["addItems"]>[0],
    );
    return null;
  }
  if (message.method === "session.pop") return session.popItem();
  await session.clearSession();
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Desktop Agent RPC failed")
    .slice(0, 500);
}
