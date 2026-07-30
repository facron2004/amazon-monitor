import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type {
  AgentModelConnectionInput,
  AgentModelConnectionState,
  AgentModelRuntimeConnection,
} from "@amazon-monitor/shared";
import type { AsyncSafeStorage } from "./secure-key-store.js";

type StoredConnection = AgentModelRuntimeConnection;

interface StoredConnectionState {
  version: 1;
  activeConnectionId: string | null;
  connections: StoredConnection[];
}

const emptyState = (): StoredConnectionState => ({
  version: 1,
  activeConnectionId: null,
  connections: [],
});

export class SecureModelConnectionStore {
  constructor(
    private readonly safeStorage: AsyncSafeStorage,
    private readonly filePath: string,
  ) {}

  async list(): Promise<AgentModelConnectionState> {
    const state = await this.read();
    return {
      activeConnectionId: state.activeConnectionId,
      connections: state.connections.map(toSummary),
    };
  }

  async getActive(): Promise<AgentModelRuntimeConnection | null> {
    const state = await this.read();
    return state.connections.find(
      (connection) => connection.id === state.activeConnectionId,
    ) ?? null;
  }

  async save(input: AgentModelConnectionInput): Promise<AgentModelConnectionState> {
    const state = await this.read();
    const existing = input.id
      ? state.connections.find((connection) => connection.id === input.id)
      : undefined;
    const connection = normalizeConnection(input, existing);
    const index = state.connections.findIndex((item) => item.id === connection.id);
    if (index >= 0) state.connections[index] = connection;
    else state.connections.push(connection);
    state.activeConnectionId ??= connection.id;
    await this.write(state);
    return this.list();
  }

  async activate(connectionId: string): Promise<AgentModelConnectionState> {
    const state = await this.read();
    if (!state.connections.some((connection) => connection.id === connectionId)) {
      throw new Error("Model connection not found");
    }
    state.activeConnectionId = connectionId;
    await this.write(state);
    return this.list();
  }

  async remove(connectionId: string): Promise<AgentModelConnectionState> {
    const state = await this.read();
    state.connections = state.connections.filter(
      (connection) => connection.id !== connectionId,
    );
    if (state.activeConnectionId === connectionId) {
      state.activeConnectionId = state.connections[0]?.id ?? null;
    }
    await this.write(state);
    return this.list();
  }

  async migrateOpenAIKey(apiKey: string | null): Promise<void> {
    if (!apiKey || existsSync(this.filePath)) return;
    await this.save({
      name: "OpenAI",
      provider: "openai",
      apiMode: "responses",
      primaryModel: "gpt-5.6-sol",
      fallbackModel: "gpt-5.6-terra",
      reasoningEnabled: true,
      apiKey,
    });
  }

  private async read(): Promise<StoredConnectionState> {
    if (!existsSync(this.filePath)) return emptyState();
    const encrypted = readFileSync(this.filePath);
    const decrypted = await this.safeStorage.decryptStringAsync(encrypted);
    const parsed = parseStoredState(decrypted.result);
    if (decrypted.shouldReEncrypt) await this.write(parsed);
    return parsed;
  }

  private async write(state: StoredConnectionState): Promise<void> {
    if (!await this.safeStorage.isAsyncEncryptionAvailable()) {
      throw new Error("Operating-system encryption is unavailable");
    }
    const encrypted = await this.safeStorage.encryptStringAsync(JSON.stringify(state));
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    writeFileSync(temporary, encrypted, { mode: 0o600 });
    renameSync(temporary, this.filePath);
  }
}

function normalizeConnection(
  input: AgentModelConnectionInput,
  existing: StoredConnection | undefined,
): StoredConnection {
  const name = boundedText(input.name, "Connection name", 80);
  const primaryModel = boundedText(input.primaryModel, "Primary model", 160);
  const fallbackModel = boundedText(
    input.fallbackModel?.trim() || primaryModel,
    "Fallback model",
    160,
  );
  const provider = input.provider;
  const apiKey = provider === "chatgpt-oauth"
    ? null
    : input.apiKey?.trim() || existing?.apiKey || null;
  if (provider !== "chatgpt-oauth" && !apiKey) {
    throw new Error("API key is required for this connection");
  }
  return {
    id: existing?.id ?? (input.id?.trim() || randomUUID()),
    name,
    provider,
    apiMode: provider === "chatgpt-oauth" ? "responses" : input.apiMode,
    baseUrl: provider === "openai-compatible"
      ? normalizeBaseUrl(input.baseUrl)
      : null,
    primaryModel,
    fallbackModel,
    reasoningEnabled: provider === "chatgpt-oauth"
      ? true
      : input.reasoningEnabled === true,
    configured: provider === "chatgpt-oauth" ? false : true,
    apiKey,
  };
}

function normalizeBaseUrl(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) throw new Error("Base URL is required for a compatible provider");
  const url = new URL(raw);
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Base URL must use HTTPS, except for a local loopback service");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function boundedText(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${label} must contain 1-${maxLength} characters`);
  }
  return normalized;
}

function toSummary(connection: StoredConnection) {
  const { apiKey: _apiKey, ...summary } = connection;
  return summary;
}

function parseStoredState(value: string): StoredConnectionState {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.connections)) {
    throw new Error("Stored model connection data is invalid");
  }
  const connections = parsed.connections.filter(isStoredConnection);
  const activeConnectionId = typeof parsed.activeConnectionId === "string"
    && connections.some((connection) => connection.id === parsed.activeConnectionId)
    ? parsed.activeConnectionId
    : connections[0]?.id ?? null;
  return { version: 1, activeConnectionId, connections };
}

function isStoredConnection(value: unknown): value is StoredConnection {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && ["openai", "openai-compatible", "chatgpt-oauth"].includes(
      String(value.provider),
    )
    && ["responses", "chat-completions"].includes(String(value.apiMode))
    && (typeof value.baseUrl === "string" || value.baseUrl === null)
    && typeof value.primaryModel === "string"
    && typeof value.fallbackModel === "string"
    && typeof value.reasoningEnabled === "boolean"
    && typeof value.configured === "boolean"
    && (typeof value.apiKey === "string" || value.apiKey === null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
