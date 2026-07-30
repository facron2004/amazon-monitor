import type {
  AgentRunEvent,
  AgentRunOutput,
  AgentToolEnvelope,
  AgentToolName,
} from "@amazon-monitor/shared";

export interface AgentExecutionContext {
  orgId: number;
  userId: number;
  runId: number;
  signal?: AbortSignal;
}

export interface AgentToolBackend {
  execute(
    toolName: AgentToolName,
    input: Record<string, unknown>,
    context: AgentExecutionContext,
  ): Promise<AgentToolEnvelope>;
}

export interface AgentRuntimePersistence {
  appendEvent(
    runId: number,
    type: string,
    payload?: Record<string, unknown>,
  ): AgentRunEvent;
  complete(runId: number, output: AgentRunOutput): void;
  fail(runId: number, errorMessage: string): void;
}
