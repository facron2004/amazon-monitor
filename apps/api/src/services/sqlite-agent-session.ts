import type { AgentInputItem, AgentSdkSession } from "@amazon-monitor/agent";
import type { Store } from "../store.js";

function parseItem(value: string): AgentInputItem | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as AgentInputItem
      : null;
  } catch {
    return null;
  }
}

export class SqliteAgentSession implements AgentSdkSession {
  constructor(
    private readonly store: Store,
    private readonly sessionId: number,
  ) {}

  async getSessionId(): Promise<string> {
    return String(this.sessionId);
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    const boundedLimit = limit === undefined
      ? 1000
      : Math.min(1000, Math.max(0, Math.floor(limit)));
    return this.store.listAgentSessionItems(this.sessionId, boundedLimit).flatMap((value) => {
      const item = parseItem(value);
      return item ? [item] : [];
    });
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    this.store.appendAgentSessionItems(
      this.sessionId,
      items.map((item) => JSON.stringify(item)),
    );
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    const value = this.store.popAgentSessionItem(this.sessionId);
    return value ? parseItem(value) ?? undefined : undefined;
  }

  async clearSession(): Promise<void> {
    this.store.clearAgentSessionItems(this.sessionId);
  }
}
