import type {
  AgentModelConnectionInput,
  AgentModelConnectionState,
  AgentOAuthStartResult,
  AgentOAuthStatus,
} from "@amazon-monitor/shared";

interface AmazonMonitorDesktopBridge {
  exportFile(request: {
    content: string;
    suggestedName: string;
  }): Promise<{ cancelled: boolean }>;
  model: {
    activate(connectionId: string): Promise<AgentModelConnectionState>;
    list(): Promise<AgentModelConnectionState>;
    remove(connectionId: string): Promise<AgentModelConnectionState>;
    save(connection: AgentModelConnectionInput): Promise<AgentModelConnectionState>;
  };
  oauth: {
    logout(): Promise<void>;
    start(): Promise<AgentOAuthStartResult>;
    status(): Promise<AgentOAuthStatus>;
  };
  processStatus(): Promise<Record<"api" | "agent" | "crawler", string>>;
  updateStatus(): Promise<{ enabled: boolean; state: string }>;
}

declare global {
  interface Window {
    amazonMonitorDesktop?: AmazonMonitorDesktopBridge;
  }
}

export {};
