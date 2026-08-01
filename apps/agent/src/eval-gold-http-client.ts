import type {
  AgentRun,
  AgentRunStatus,
  AgentToolCall,
} from "@amazon-monitor/shared";

const terminalStatuses = new Set<AgentRunStatus>([
  "completed",
  "failed",
  "cancelled",
  "waiting_approval",
]);

export interface AgentRunDetail extends AgentRun {
  toolCalls: AgentToolCall[];
}

export type FetchLike = typeof fetch;

export class AgentEvaluationClient {
  private constructor(
    private readonly baseUrl: string,
    private readonly cookie: string,
    private readonly fetcher: FetchLike,
    private readonly requestTimeoutMs: number,
  ) {}

  static async login(
    options: {
      baseUrl: string;
      username: string;
      password: string;
      requestTimeoutMs?: number;
    },
    fetcher: FetchLike,
  ): Promise<AgentEvaluationClient> {
    const baseUrl = options.baseUrl.replace(/\/+$/, "");
    const response = await fetcher(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: options.username,
        password: options.password,
      }),
    });
    await assertOk(response);
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Login response did not include a session cookie");
    return new AgentEvaluationClient(
      baseUrl,
      cookie,
      fetcher,
      options.requestTimeoutMs ?? 30_000,
    );
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  cancel(runId: number): Promise<AgentRun> {
    return this.post<AgentRun>(`/api/agent/runs/${runId}/cancel`, {});
  }

  async waitForRun(
    runId: number,
    pollIntervalMs: number,
    timeoutMs: number,
  ): Promise<AgentRunDetail> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const run = await this.get<AgentRunDetail>(`/api/agent/runs/${runId}`);
      if (terminalStatuses.has(run.status)) return run;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new Error(`Agent run ${runId} exceeded ${timeoutMs}ms`);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("cookie", this.cookie);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: init.signal ?? controller.signal,
      });
      await assertOk(response);
      return await response.json() as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;
  const body = (await response.text()).slice(0, 500);
  throw new Error(`HTTP ${response.status}: ${body || response.statusText}`);
}
