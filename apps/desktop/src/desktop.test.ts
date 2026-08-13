import { DatabaseSync } from "node:sqlite";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSecureWebPreferences,
  isAllowedRendererUrl,
  isTrustedRendererUrl,
  resolveExternalUrl,
} from "./browser-security.js";
import {
  createDesktopPaths,
  findLegacyDatabase,
  findProjectDataDatabase,
  migrateLegacyDatabase,
  shouldMigrateDatabase,
} from "./desktop-paths.js";
import {
  buildProcessEnvironment,
  pinApiPort,
  resolveProcessInitialization,
} from "./process-environment.js";
import { redactLogMessage } from "./log-redaction.js";
import { BoundedRestartPolicy } from "./restart-policy.js";
import { postMessageSafely, shouldHandleProcessExit } from "./process-supervisor.js";
import { SecureApiKeyStore, type AsyncSafeStorage } from "./secure-key-store.js";
import { SecureModelConnectionStore } from "./secure-model-connection-store.js";

const temporaryPaths: string[] = [];

afterEach(() => {
  temporaryPaths.splice(0).forEach((path) => rmSync(path, {
    force: true,
    recursive: true,
  }));
});

describe("desktop security", () => {
  it("passes only role-scoped environment values to utility processes", () => {
    const inherited = {
      PATH: "C:/Windows",
      SystemRoot: "C:/Windows",
      OPENAI_API_KEY: "sk-inherited-secret",
      SMTP_PASS: "smtp-secret",
      DATA_SOURCE_CREDENTIALS_KEY: "credential-secret",
    };
    const configured = {
      NODE_ENV: "production",
      DB_PATH: "C:/data/amazon-monitor.sqlite",
      WEB_DIST_PATH: "C:/resources/web",
      SMTP_PASS: "smtp-configured-secret",
    };

    const apiEnvironment = buildProcessEnvironment("api", inherited, configured);
    const agentEnvironment = buildProcessEnvironment("agent", inherited, configured);

    expect(apiEnvironment).toMatchObject({
      NODE_ENV: "production",
      DB_PATH: "C:/data/amazon-monitor.sqlite",
      SMTP_PASS: "smtp-configured-secret",
    });
    expect(apiEnvironment).not.toHaveProperty("OPENAI_API_KEY");
    expect(agentEnvironment).toMatchObject({
      NODE_ENV: "production",
      PATH: "C:/Windows",
    });
    expect(agentEnvironment).not.toHaveProperty("SMTP_PASS");
    expect(agentEnvironment).not.toHaveProperty("DATA_SOURCE_CREDENTIALS_KEY");
  });

  it("pins the dynamically allocated API port for utility restarts", () => {
    const configured = { PORT: "0" };

    pinApiPort(configured, 43_210);
    expect(configured.PORT).toBe("43210");

    pinApiPort(configured, 0);
    pinApiPort(configured, 65_536);
    expect(configured.PORT).toBe("43210");
  });

  it("reuses the setup initialization on a utility restart", () => {
    const initial = resolveProcessInitialization(undefined, { setupToken: "one-time" });
    const restarted = resolveProcessInitialization(initial, {});
    const replaced = resolveProcessInitialization(initial, { setupToken: "rotated" });

    expect(initial).toEqual({ setupToken: "one-time" });
    expect(restarted).toEqual({ setupToken: "one-time" });
    expect(replaced).toEqual({ setupToken: "rotated" });
  });

  it("redacts credential-shaped values before utility logs are persisted", () => {
    const redacted = redactLogMessage(
      "password=secret smtp_pass:mail-secret Authorization: Bearer token-value sk-1234567890123456",
    );

    expect(redacted).not.toContain("secret");
    expect(redacted).not.toContain("mail-secret");
    expect(redacted).not.toContain("token-value");
    expect(redacted).not.toContain("sk-1234567890123456");
    expect(redacted).toContain("[REDACTED]");
  });

  it("keeps the renderer sandboxed behind an isolated preload", () => {
    expect(createSecureWebPreferences("preload.cjs")).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });
  });

  it("recognizes the renderer origin when a failed navigation adds a trailing slash", () => {
    expect(isAllowedRendererUrl(
      "http://127.0.0.1:43210/",
      "http://127.0.0.1:43210",
    )).toBe(true);
  });

  it("does not trust DevTools as an IPC sender", () => {
    expect(isTrustedRendererUrl(
      "http://127.0.0.1:43210/",
      "http://127.0.0.1:43210",
    )).toBe(true);
    expect(isTrustedRendererUrl(
      "devtools://devtools/bundled/inspector.html",
      "http://127.0.0.1:43210",
    )).toBe(false);
  });

  it("identifies valid external HTTP/HTTPS URLs for shell opening", async () => {
    expect(await resolveExternalUrl("https://www.amazon.com/dp/B000000000", "http://127.0.0.1:43210")).toBe("https://www.amazon.com/dp/B000000000");
    expect(await resolveExternalUrl("http://example.com", "http://127.0.0.1:43210")).toBe("http://example.com/");
    expect(await resolveExternalUrl("file:///C:/secret.txt", "http://127.0.0.1:43210")).toBe(null);
    expect(await resolveExternalUrl("javascript:alert(1)", "http://127.0.0.1:43210")).toBe(null);
  });

  it("encrypts the API key and never stores plaintext", async () => {
    const root = temporaryDirectory();
    const encryptedPath = join(root, "secret.bin");
    const safeStorage: AsyncSafeStorage = {
      decryptStringAsync: vi.fn(async (value: Buffer) => ({
        result: Buffer.from(value.toString(), "base64").toString(),
        shouldReEncrypt: false,
      })),
      encryptStringAsync: vi.fn(async (value: string) =>
        Buffer.from(Buffer.from(value).toString("base64"))),
      isAsyncEncryptionAvailable: vi.fn(async () => true),
    };
    const store = new SecureApiKeyStore(safeStorage, encryptedPath);

    await store.set("sk-example");

    expect(readFileSync(encryptedPath, "utf8")).not.toContain("sk-example");
    expect(await store.get()).toBe("sk-example");
  });

  it("stores multiple encrypted model connections and switches the active one", async () => {
    const root = temporaryDirectory();
    const encryptedPath = join(root, "model-connections.bin");
    const store = new SecureModelConnectionStore(
      createTestSafeStorage(),
      encryptedPath,
    );

    await store.save({
      name: "OpenAI",
      provider: "openai",
      apiMode: "responses",
      primaryModel: "gpt-5.6-sol",
      fallbackModel: "gpt-5.6-terra",
      reasoningEnabled: true,
      apiKey: "sk-openai-secret",
    });
    const state = await store.save({
      name: "Local compatible",
      provider: "openai-compatible",
      apiMode: "chat-completions",
      baseUrl: "http://127.0.0.1:11434/v1/",
      primaryModel: "local-model",
      fallbackModel: null,
      reasoningEnabled: false,
      apiKey: "local-secret",
    });
    const compatible = state.connections.find(
      (connection) => connection.provider === "openai-compatible",
    );

    expect(compatible).toMatchObject({
      baseUrl: "http://127.0.0.1:11434/v1",
      configured: true,
      fallbackModel: "local-model",
    });
    expect(compatible).not.toHaveProperty("apiKey");
    expect(readFileSync(encryptedPath, "utf8")).not.toContain("sk-openai-secret");
    expect(readFileSync(encryptedPath, "utf8")).not.toContain("local-secret");

    await store.activate(compatible!.id);
    expect(await store.getActive()).toMatchObject({
      id: compatible!.id,
      apiKey: "local-secret",
    });
  });

  it("preserves an existing API key when editing a connection", async () => {
    const store = new SecureModelConnectionStore(
      createTestSafeStorage(),
      join(temporaryDirectory(), "model-connections.bin"),
    );
    const created = await store.save({
      name: "Provider",
      provider: "openai-compatible",
      apiMode: "responses",
      baseUrl: "https://models.example.com/v1",
      primaryModel: "model-a",
      fallbackModel: null,
      reasoningEnabled: false,
      apiKey: "secret-value",
    });
    const id = created.connections[0]!.id;

    await store.save({
      id,
      name: "Renamed provider",
      provider: "openai-compatible",
      apiMode: "responses",
      baseUrl: "https://models.example.com/v1",
      primaryModel: "model-b",
      fallbackModel: null,
      reasoningEnabled: false,
      apiKey: null,
    });

    expect(await store.getActive()).toMatchObject({
      id,
      name: "Renamed provider",
      apiKey: "secret-value",
    });
  });

  it("rejects insecure remote compatible-provider URLs", async () => {
    const store = new SecureModelConnectionStore(
      createTestSafeStorage(),
      join(temporaryDirectory(), "model-connections.bin"),
    );

    await expect(store.save({
      name: "Remote",
      provider: "openai-compatible",
      apiMode: "responses",
      baseUrl: "http://models.example.com/v1",
      primaryModel: "model",
      fallbackModel: null,
      reasoningEnabled: false,
      apiKey: "secret",
    })).rejects.toThrow("must use HTTPS");
  });
});

describe("desktop data migration", () => {
  it("selects the first non-empty legacy database outside the target path", () => {
    const root = temporaryDirectory();
    const empty = join(root, "empty.sqlite");
    const legacy = join(root, "legacy.sqlite");
    const target = join(root, "user-data", "data", "amazon-monitor.sqlite");
    writeFileSync(empty, "");
    const database = new DatabaseSync(legacy);
    database.exec("CREATE TABLE marker (value TEXT)");
    database.close();

    expect(findLegacyDatabase([
      undefined,
      empty,
      target,
      legacy,
      legacy,
    ], target)).toBe(legacy);
  });

  it("copies and verifies a legacy database without deleting the source", async () => {
    const root = temporaryDirectory();
    const legacy = join(root, "legacy.sqlite");
    const paths = createDesktopPaths(join(root, "user-data"));
    const database = new DatabaseSync(legacy);
    database.exec("CREATE TABLE marker (value TEXT); INSERT INTO marker VALUES ('ok')");
    database.close();

    expect(await migrateLegacyDatabase(legacy, paths.database)).toBe("migrated");
    expect(readMarker(paths.database)).toBe("ok");
    expect(readMarker(`${paths.database}.legacy-backup`)).toBe("ok");
    expect(existsSync(`${paths.database}.migrating-wal`)).toBe(false);
    expect(existsSync(`${paths.database}.migrating-shm`)).toBe(false);
    expect(await migrateLegacyDatabase(legacy, paths.database)).toBe("skipped");
  });

  it("includes committed rows that are still present in a WAL file", async () => {
    const root = temporaryDirectory();
    const legacy = join(root, "legacy.sqlite");
    const paths = createDesktopPaths(join(root, "user-data"));
    const database = new DatabaseSync(legacy);
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA wal_autocheckpoint = 0;
      CREATE TABLE marker (value TEXT);
      INSERT INTO marker VALUES ('from-wal');
    `);

    expect(await migrateLegacyDatabase(legacy, paths.database)).toBe("migrated");
    expect(readMarker(paths.database)).toBe("from-wal");
    expect(readMarker(`${paths.database}.legacy-backup`)).toBe("from-wal");
    database.close();
  });

  it("re-migrates when the legacy database has a newer modification time", async () => {
    const root = temporaryDirectory();
    const legacy = join(root, "legacy.sqlite");
    const paths = createDesktopPaths(join(root, "user-data"));

    // Initial legacy DB setup
    let db = new DatabaseSync(legacy);
    db.exec("CREATE TABLE marker (value TEXT); INSERT INTO marker VALUES ('v1')");
    db.close();

    expect(await migrateLegacyDatabase(legacy, paths.database)).toBe("migrated");
    expect(readMarker(paths.database)).toBe("v1");

    // Wait a short moment to ensure distinct timestamp for mtime update
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Update legacy DB with new data
    db = new DatabaseSync(legacy);
    db.exec("UPDATE marker SET value = 'v2'");
    db.close();

    expect(await migrateLegacyDatabase(legacy, paths.database)).toBe("migrated");
    expect(readMarker(paths.database)).toBe("v2");
  });

  it("migrates when legacy database has higher task log ID", async () => {
    const root = temporaryDirectory();
    const legacy = join(root, "legacy.sqlite");
    const target = join(root, "target.sqlite");

    let db = new DatabaseSync(target);
    db.exec("CREATE TABLE amazon_collect_task_log (id INTEGER PRIMARY KEY, status TEXT); INSERT INTO amazon_collect_task_log VALUES (10, 'ok');");
    db.close();

    db = new DatabaseSync(legacy);
    db.exec("CREATE TABLE amazon_collect_task_log (id INTEGER PRIMARY KEY, status TEXT); INSERT INTO amazon_collect_task_log VALUES (20, 'ok');");
    db.close();

    expect(shouldMigrateDatabase(legacy, target)).toBe(true);
  });

  it("removes stale target WAL files before replacing an existing database", async () => {
    const root = temporaryDirectory();
    const legacy = join(root, "legacy.sqlite");
    const target = join(root, "target.sqlite");

    let db = new DatabaseSync(target);
    db.exec("CREATE TABLE marker (value TEXT); INSERT INTO marker VALUES ('old')");
    db.close();
    writeFileSync(`${target}-wal`, "stale-wal");
    writeFileSync(`${target}-shm`, "stale-shm");

    db = new DatabaseSync(legacy);
    db.exec("CREATE TABLE marker (value TEXT); INSERT INTO marker VALUES ('new')");
    db.close();

    expect(await migrateLegacyDatabase(legacy, target)).toBe("migrated");
    expect(readMarker(target)).toBe("new");
    expect(existsSync(`${target}-wal`)).toBe(false);
    expect(existsSync(`${target}-shm`)).toBe(false);
  });

  it("finds project data database recursively in parent directories", () => {
    const root = temporaryDirectory();
    const subDir = join(root, "apps", "desktop", "dist");
    const dbPath = join(root, "data", "amazon-monitor.sqlite");
    const paths = createDesktopPaths(root);
    const database = new DatabaseSync(dbPath);
    database.exec("CREATE TABLE marker (value TEXT)");
    database.close();

    expect(findProjectDataDatabase(subDir)).toBe(dbPath);
  });
});

describe("utility process restart policy", () => {
  it("limits repeated crashes per process", () => {
    const policy = new BoundedRestartPolicy(2, 60_000);

    expect(policy.recordFailure("api", 0).restart).toBe(true);
    expect(policy.recordFailure("api", 1).restart).toBe(true);
    expect(policy.recordFailure("api", 2).restart).toBe(false);
    expect(policy.recordFailure("agent", 2).restart).toBe(true);
  });

  it("resets the crash window after a process becomes healthy", () => {
    const policy = new BoundedRestartPolicy(2, 60_000);

    expect(policy.recordFailure("agent", 0).restart).toBe(true);
    expect(policy.recordFailure("agent", 1).restart).toBe(true);
    policy.reset("agent");
    expect(policy.recordFailure("agent", 2).restart).toBe(true);
  });

  it("contains MessagePort shutdown races and reports delivery failure", () => {
    const delivered = vi.fn();
    const port = { postMessage: delivered };

    expect(postMessageSafely(port, { type: "ping" })).toBe(true);
    expect(delivered).toHaveBeenCalledWith({ type: "ping" });

    const closedPort = {
      postMessage: vi.fn(() => {
        throw new Error("The port is closed");
      }),
    };
    expect(postMessageSafely(closedPort, { type: "ping" })).toBe(false);
    expect(postMessageSafely(undefined, { type: "ping" })).toBe(false);
  });

  it("ignores an exit event from an older utility child after replacement", () => {
    const currentChild = {};
    const oldChild = {};

    expect(shouldHandleProcessExit(currentChild, oldChild)).toBe(false);
    expect(shouldHandleProcessExit(currentChild, currentChild)).toBe(true);
    expect(shouldHandleProcessExit(undefined, oldChild)).toBe(true);
  });
});

function temporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "amazon-monitor-desktop-"));
  temporaryPaths.push(path);
  return path;
}

function createTestSafeStorage(): AsyncSafeStorage {
  return {
    decryptStringAsync: vi.fn(async (value: Buffer) => ({
      result: Buffer.from(value.toString(), "base64").toString(),
      shouldReEncrypt: false,
    })),
    encryptStringAsync: vi.fn(async (value: string) =>
      Buffer.from(Buffer.from(value).toString("base64"))),
    isAsyncEncryptionAvailable: vi.fn(async () => true),
  };
}

function readMarker(path: string): string | undefined {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return database.prepare("SELECT value FROM marker").get()?.value as
      | string
      | undefined;
  } finally {
    database.close();
  }
}
