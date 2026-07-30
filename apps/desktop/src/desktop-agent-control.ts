import type {
  AgentModelRuntimeConnection,
  AgentOAuthStartResult,
  AgentOAuthStatus,
} from "@amazon-monitor/shared";

export interface AgentConnectionRuntimeMessage {
  type: "agent.connection.runtime";
  connection: AgentModelRuntimeConnection | null;
}

export type AgentOAuthCommand = "start" | "status" | "logout";

export interface AgentOAuthRequestMessage {
  type: "agent.oauth.request";
  requestId: string;
  command: AgentOAuthCommand;
}

export interface AgentOAuthResultMessage {
  type: "agent.oauth.result";
  requestId: string;
  ok: boolean;
  result?: AgentOAuthStartResult | AgentOAuthStatus | null;
  errorMessage?: string;
}

export type DesktopAgentControlMessage =
  | AgentConnectionRuntimeMessage
  | AgentOAuthRequestMessage
  | AgentOAuthResultMessage;
