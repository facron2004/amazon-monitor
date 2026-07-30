import type {
  ActionExecution,
  ActionProposal,
  ActionProposalStatus,
  AgentMessage,
  AgentRun,
  AgentSession,
  AgentTaskType,
} from "@amazon-monitor/shared";
import { buildRequestUrl, clearRequestCache, request } from "./api-base";

export interface AgentSessionDetail extends AgentSession {
  messages: AgentMessage[];
  runs: AgentRun[];
}

export interface StartAgentRunInput {
  input: string;
  taskType: AgentTaskType;
  freshness: {
    datasets: Array<"category" | "keyword" | "price" | "promotion" | "review" | "listing">;
    categoryId?: number;
    keywordId?: number;
    asin?: string;
    marketplace?: string;
    maxAgeHours?: number;
  };
}

function mutation<T>(path: string, body?: unknown): Promise<T> {
  clearRequestCache("/agent");
  return request<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const agentApi = {
  listSessions: () => request<AgentSession[]>("/agent/sessions"),
  getSession: (id: number) => request<AgentSessionDetail>(`/agent/sessions/${id}`),
  createSession: (title: string) => mutation<AgentSession>("/agent/sessions", { title }),
  startRun: (sessionId: number, input: StartAgentRunInput) =>
    mutation<AgentRun>(`/agent/sessions/${sessionId}/runs`, input),
  getRun: (id: number) => {
    clearRequestCache(`/agent/runs/${id}`);
    return request<AgentRun & { events: Array<{
      id: number;
      sequence: number;
      type: string;
      payload: Record<string, unknown>;
      createdAt: string;
    }>; proposals: ActionProposal[] }>(`/agent/runs/${id}`);
  },
  getAudit: (runId: number) => {
    clearRequestCache("/agent/audit");
    return request<Record<string, unknown>>(`/agent/audit?runId=${runId}`);
  },
  listActions: (status?: ActionProposalStatus) =>
    request<ActionProposal[]>(`/agent/actions${status ? `?status=${status}` : ""}`),
  approveAction: (id: number, expectedVersion: number) =>
    mutation<{ proposal: ActionProposal; execution: ActionExecution | null }>(
      `/agent/actions/${id}/approve`,
      { expectedVersion },
    ),
  rejectAction: (id: number, expectedVersion: number) =>
    mutation<ActionProposal>(`/agent/actions/${id}/reject`, { expectedVersion }),
  modifyAction: (
    id: number,
    expectedVersion: number,
    title: string,
    payload: Record<string, unknown>,
  ) => mutation<{ previous: ActionProposal; replacement: ActionProposal }>(
    `/agent/actions/${id}/modify`,
    { expectedVersion, title, payload },
  ),
  executeAction: (id: number, confirmL3 = false) =>
    mutation<ActionExecution>(`/agent/actions/${id}/execute`, {
      ...(confirmL3 ? { confirmL3: true } : {}),
    }),
  subscribeRun: (id: number, onEvent: () => void) => {
    const source = new EventSource(buildRequestUrl(`/agent/runs/${id}/events`), {
      withCredentials: true,
    });
    const names = [
      "run.created", "planning.started", "plan.created",
      "freshness.started", "freshness.completed", "model.started",
      "model.progress", "model.failed", "tool.started", "tool.completed",
      "tool.failed", "recovery.waiting_for_collection",
      "recovery.collection_completed", "run.completed", "run.failed",
      "run.cancelled",
    ];
    names.forEach((name) => source.addEventListener(name, onEvent));
    return () => source.close();
  },
};
