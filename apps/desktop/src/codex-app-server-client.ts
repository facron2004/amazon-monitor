import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import type {
  AgentOAuthStartResult,
  AgentOAuthStatus,
} from "@amazon-monitor/shared";
import {
  isRecord,
  nestedString,
  resolveCodexExecutable,
} from "./codex-app-server-utils.js";

interface PendingRequest {
  reject(error: Error): void;
  resolve(value: unknown): void;
}

interface ActiveTurn {
  finalText: string | null;
  reject(error: Error): void;
  resolve(value: string): void;
  toolHandler(
    tool: string,
    input: Record<string, unknown>,
  ): Promise<string>;
  turnId: string | null;
}

export interface CodexRunRequest {
  model: string;
  effort: "low" | "medium" | "high";
  input: string;
  outputSchema: Record<string, unknown>;
  sandboxPath: string;
  signal?: AbortSignal;
  tools: Array<{
    type: "function";
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  toolHandler(
    tool: string,
    input: Record<string, unknown>,
  ): Promise<string>;
}

export class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly turns = new Map<string, ActiveTurn>();
  private starting: Promise<void> | null = null;

  constructor(
    private readonly codexHome: string,
    private readonly executable = resolveCodexExecutable(),
  ) {}

  async start(): Promise<void> {
    if (this.child) return;
    if (this.starting) return this.starting;
    this.starting = this.initialize();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async getOAuthStatus(): Promise<AgentOAuthStatus> {
    await this.start();
    const result = await this.request("account/read", { refreshToken: false });
    const account = isRecord(result) && isRecord(result.account)
      ? result.account
      : null;
    return {
      connected: account?.type === "chatgpt",
      authMode: account?.type === "chatgpt" ? "chatgpt" : null,
      planType: typeof account?.planType === "string" ? account.planType : null,
    };
  }

  async startOAuth(): Promise<AgentOAuthStartResult> {
    await this.start();
    const result = await this.request("account/login/start", {
      type: "chatgpt",
      useHostedLoginSuccessPage: true,
      appBrand: "chatgpt",
    });
    if (
      !isRecord(result)
      || typeof result.loginId !== "string"
      || typeof result.authUrl !== "string"
    ) {
      throw new Error("Codex OAuth did not return a login URL");
    }
    return { loginId: result.loginId, authUrl: result.authUrl };
  }

  async logout(): Promise<void> {
    await this.start();
    await this.request("account/logout");
  }

  async run(request: CodexRunRequest): Promise<string> {
    await this.start();
    mkdirSync(request.sandboxPath, { recursive: true });
    const threadResult = await this.request("thread/start", {
      model: request.model,
      cwd: request.sandboxPath,
      approvalPolicy: "never",
      approvalsReviewer: "user",
      sandbox: "read-only",
      ephemeral: true,
      personality: "none",
      dynamicTools: request.tools,
      baseInstructions: [
        "You are an Amazon operations analysis agent, not a coding agent.",
        "Use only the supplied dynamic business tools.",
        "Never use shell, filesystem, web search, code execution, patching, apps, plugins,",
        "skills, subagents, or any tool other than the supplied Amazon business tools.",
        "Never invent evidence. Follow the requested JSON output schema exactly.",
      ].join(" "),
      config: {
        web_search: "disabled",
        features: {
          apps: false,
          code_mode: false,
          multi_agent: false,
          plugins: false,
          remote_plugin: false,
          shell_tool: false,
          unified_exec: false,
        },
      },
    });
    const threadId = nestedString(threadResult, "thread", "id");
    if (!threadId) throw new Error("Codex app-server did not create a thread");

    const output = new Promise<string>((resolve, reject) => {
      this.turns.set(threadId, {
        finalText: null,
        reject,
        resolve,
        toolHandler: request.toolHandler,
        turnId: null,
      });
    });
    try {
      const turnResult = await this.request("turn/start", {
        threadId,
        input: [{ type: "text", text: request.input }],
        effort: request.effort,
        outputSchema: request.outputSchema,
      });
      const turnId = nestedString(turnResult, "turn", "id");
      const active = this.turns.get(threadId);
      if (!turnId || !active) throw new Error("Codex app-server did not start a turn");
      active.turnId = turnId;
      if (request.signal) {
        const interrupt = () => {
          void this.request("turn/interrupt", { threadId, turnId }).catch(() => undefined);
        };
        if (request.signal.aborted) interrupt();
        else request.signal.addEventListener("abort", interrupt, { once: true });
      }
      return await output;
    } finally {
      this.turns.delete(threadId);
      void this.request("thread/unsubscribe", { threadId }).catch(() => undefined);
    }
  }

  close(): void {
    this.child?.stdin.end();
    this.child?.kill("SIGKILL");
    this.child = null;
    const error = new Error("Codex app-server stopped");
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
    this.turns.forEach(({ reject }) => reject(error));
    this.turns.clear();
  }

  private async initialize(): Promise<void> {
    mkdirSync(this.codexHome, { recursive: true });
    const child = spawn(this.executable, ["app-server", "--listen", "stdio://"], {
      env: {
        ...process.env,
        CODEX_HOME: this.codexHome,
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => this.handleLine(line));
    child.stderr.on("data", () => undefined);
    child.on("error", (cause) => {
      if (this.child === child) this.child = null;
      const error = new Error("Codex app-server could not start", { cause });
      this.pending.forEach(({ reject }) => reject(error));
      this.pending.clear();
      this.turns.forEach(({ reject }) => reject(error));
      this.turns.clear();
    });
    child.on("exit", (code) => {
      if (this.child === child) this.child = null;
      const error = new Error(`Codex app-server exited with code ${code}`);
      this.pending.forEach(({ reject }) => reject(error));
      this.pending.clear();
      this.turns.forEach(({ reject }) => reject(error));
      this.turns.clear();
    });
    await this.request("initialize", {
      clientInfo: {
        name: "amazon_monitor_desktop",
        title: "Amazon Monitor",
        version: "1.1.0",
      },
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized", {});
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    if (!this.child) return Promise.reject(new Error("Codex app-server is unavailable"));
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
      this.write({ method, id, params });
    });
  }

  private notify(method: string, params: unknown): void {
    this.write({ method, params });
  }

  private write(message: unknown): void {
    this.child?.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!isRecord(message)) return;
    if (typeof message.method === "string") {
      if (message.method === "item/tool/call" && message.id !== undefined) {
        void this.handleToolRequest(message);
      } else {
        this.handleNotification(message.method, message.params);
      }
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (isRecord(message.error)) {
      pending.reject(new Error(
        typeof message.error.message === "string"
          ? message.error.message
          : "Codex app-server request failed",
      ));
    } else {
      pending.resolve(message.result);
    }
  }

  private async handleToolRequest(message: Record<string, unknown>): Promise<void> {
    const params = isRecord(message.params) ? message.params : null;
    const active = params && typeof params.threadId === "string"
      ? this.turns.get(params.threadId)
      : undefined;
    if (!active || typeof params?.tool !== "string") {
      this.write({
        id: message.id,
        result: {
          contentItems: [{ type: "inputText", text: "Tool request is not active." }],
          success: false,
        },
      });
      return;
    }
    try {
      const content = await active.toolHandler(
        params.tool,
        isRecord(params.arguments) ? params.arguments : {},
      );
      this.write({
        id: message.id,
        result: {
          contentItems: [{ type: "inputText", text: content }],
          success: true,
        },
      });
    } catch (error) {
      this.write({
        id: message.id,
        result: {
          contentItems: [{
            type: "inputText",
            text: error instanceof Error ? error.message : "Business tool failed",
          }],
          success: false,
        },
      });
    }
  }

  private handleNotification(method: string, params: unknown): void {
    if (!isRecord(params) || typeof params.threadId !== "string") return;
    const active = this.turns.get(params.threadId);
    if (!active) return;
    if (method === "item/completed" && isRecord(params.item)) {
      if (
        params.item.type === "agentMessage"
        && typeof params.item.text === "string"
      ) {
        active.finalText = params.item.text;
      }
      return;
    }
    if (method !== "turn/completed" || !isRecord(params.turn)) return;
    if (params.turn.status === "completed" && active.finalText) {
      active.resolve(active.finalText);
    } else {
      const message = isRecord(params.turn.error)
        && typeof params.turn.error.message === "string"
        ? params.turn.error.message
        : `Codex turn ended with status ${String(params.turn.status)}`;
      active.reject(new Error(message));
    }
  }
}
