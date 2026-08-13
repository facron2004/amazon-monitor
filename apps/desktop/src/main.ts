import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  session,
  shell,
} from "electron";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
} from "./desktop-paths.js";
import { DesktopProcessSupervisor } from "./process-supervisor.js";
import { SecureApiKeyStore } from "./secure-key-store.js";
import { SecureModelConnectionStore } from "./secure-model-connection-store.js";
import { findDesktopEnvFile } from "./runtime-env.js";
import type {
  AgentModelConnectionInput,
  AgentModelConnectionState,
  AgentOAuthStatus,
} from "@amazon-monitor/shared";

let rendererOrigin = "http://127.0.0.1:43210";
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let supervisor: DesktopProcessSupervisor | null = null;
let quitting = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.enableSandbox();

app.whenReady().then(async () => {
  const paths = createDesktopPaths(app.getPath("userData"));
  const envFilePath = findDesktopEnvFile({
    appPath: app.getAppPath(),
    configuredPath: process.env.AMAZON_MONITOR_ENV_FILE,
    cwd: process.cwd(),
    execPath: process.execPath,
    isPackaged: app.isPackaged,
    userDataPath: app.getPath("userData"),
  });
  const customDbPath = process.env.DB_PATH ? resolve(process.env.DB_PATH) : undefined;
  const activeDbPath = customDbPath ?? paths.database;
  if (!customDbPath) {
    const legacyDatabase = findLegacyDatabase([
      process.env.LEGACY_DB_PATH,
      findProjectDataDatabase(process.cwd()),
      findProjectDataDatabase(moduleDirectory),
      resolve(process.cwd(), "data/amazon-monitor.sqlite"),
      resolve(process.cwd(), "../../data/amazon-monitor.sqlite"),
      resolve(process.resourcesPath, "../../../../data/amazon-monitor.sqlite"),
      resolve(app.getAppPath(), "../../data/amazon-monitor.sqlite"),
    ], activeDbPath);
    if (legacyDatabase) await migrateLegacyDatabase(legacyDatabase, activeDbPath);
  }

  const apiEntry = app.isPackaged
    ? pathToFileURL(join(
        process.resourcesPath,
        "app.asar",
        "node_modules",
        "@amazon-monitor",
        "api",
        "dist",
        "index.js",
      )).href
    : pathToFileURL(resolve(app.getAppPath(), "../api/dist/index.js")).href;
  const apiBridgeEntry = app.isPackaged
    ? pathToFileURL(join(
        process.resourcesPath,
        "app.asar",
        "node_modules",
        "@amazon-monitor",
        "api",
        "dist",
        "services",
        "desktop-agent-transport.js",
      )).href
    : pathToFileURL(resolve(
        app.getAppPath(),
        "../api/dist/services/desktop-agent-transport.js",
      )).href;
  const apiStoreEntry = app.isPackaged
    ? pathToFileURL(join(
        process.resourcesPath,
        "app.asar",
        "node_modules",
        "@amazon-monitor",
        "api",
        "dist",
        "store.js",
      )).href
    : pathToFileURL(resolve(app.getAppPath(), "../api/dist/store.js")).href;
  const crawlerEntry = app.isPackaged
    ? pathToFileURL(join(
        process.resourcesPath,
        "app.asar",
        "node_modules",
        "@amazon-monitor",
        "api",
        "dist",
        "worker.js",
      )).href
    : pathToFileURL(resolve(app.getAppPath(), "../api/dist/worker.js")).href;
  const setupToken = randomBytes(32).toString("base64url");
  supervisor = new DesktopProcessSupervisor({
    entryPoint: join(moduleDirectory, "utility-entry.js"),
    environment: {
      AGENT_SDK_ENABLED: process.env.AGENT_SDK_ENABLED ?? "false",
      ...(envFilePath ? { AMAZON_MONITOR_ENV_FILE: envFilePath } : {}),
      AMAZON_MONITOR_AGENT_SANDBOX: join(paths.secrets, "..", "agent-sandbox"),
      AMAZON_MONITOR_CODEX_HOME: join(paths.secrets, "codex"),
      DB_PATH: activeDbPath,
      HOST: "127.0.0.1",
      NODE_ENV: app.isPackaged ? "production" : "development",
      DESKTOP_API_ENTRY: apiEntry,
      DESKTOP_API_BRIDGE_ENTRY: apiBridgeEntry,
      DESKTOP_API_STORE_ENTRY: apiStoreEntry,
      DESKTOP_CRAWLER_ENTRY: crawlerEntry,
      ENABLE_CRON: "false",
      PLAYWRIGHT_BROWSERS_PATH: app.isPackaged
        ? join(process.resourcesPath, "playwright-browsers")
        : paths.browser,
      PORT: "0",
      WEB_DIST_PATH: app.isPackaged
        ? join(process.resourcesPath, "web")
        : resolve(app.getAppPath(), "../web/dist"),
    },
    logsPath: paths.logs,
  });
  const readiness = await supervisor.startAll({ setupToken });
  const apiPort = readiness.api.port;
  if (!apiPort) throw new Error("Desktop API did not report a listening port");
  rendererOrigin = `http://127.0.0.1:${apiPort}`;
  await session.defaultSession.cookies.set({
    url: rendererOrigin,
    name: "amazon_monitor_setup",
    value: setupToken,
    httpOnly: true,
    sameSite: "strict",
    expirationDate: Math.floor(Date.now() / 1000) + 600,
  });

  const legacyKeyStore = new SecureApiKeyStore(
    safeStorage,
    join(paths.secrets, "openai-api-key.bin"),
  );
  const connectionStore = new SecureModelConnectionStore(
    safeStorage,
    join(paths.secrets, "model-connections.bin"),
  );
  await connectionStore.migrateOpenAIKey(await legacyKeyStore.get());
  await syncAgentConnection(connectionStore);
  void retryAgentConnectionSync(connectionStore);
  registerIpc(connectionStore, paths.exports);

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  mainWindow = new BrowserWindow({
    height: 900,
    minHeight: 720,
    minWidth: 1100,
    show: false,
    webPreferences: createSecureWebPreferences(join(moduleDirectory, "preload.cjs")),
    width: 1440,
  });
  const handleUrlOpening = (url: string) => {
    void resolveExternalUrl(url, rendererOrigin).then((targetUrl) => {
      if (targetUrl) void shell.openExternal(targetUrl);
    });
  };
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    handleUrlOpening(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedRendererUrl(url, rendererOrigin)) {
      event.preventDefault();
      handleUrlOpening(url);
    }
  });
  mainWindow.webContents.on("did-fail-load", (
    _event,
    _code,
    _description,
    url,
    isMainFrame,
  ) => {
    if (isMainFrame && isAllowedRendererUrl(url, rendererOrigin)) {
      setTimeout(() => void mainWindow?.loadURL(rendererOrigin), 1_000);
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  void mainWindow.loadURL(rendererOrigin);
}).catch((error: unknown) => {
  console.error(
    "[Desktop] startup failed:",
    error instanceof Error ? error.stack ?? error.message : String(error),
  );
  dialog.showErrorBox(
    "Amazon Monitor 启动失败",
    "桌面服务未能启动，请检查日志后重试。",
  );
  app.quit();
});
}

app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  const shutdown = supervisor?.stopAll() ?? Promise.resolve();
  void shutdown.finally(() => app.quit());
});
app.on("window-all-closed", () => app.quit());

function registerIpc(
  connectionStore: SecureModelConnectionStore,
  exportsPath: string,
): void {
  ipcMain.handle("desktop:model:list", async (event) => {
    assertTrustedSender(event.senderFrame?.url);
    return withOAuthStatus(await connectionStore.list());
  });
  ipcMain.handle("desktop:model:save", async (event, value: unknown) => {
    assertTrustedSender(event.senderFrame?.url);
    const state = await connectionStore.save(parseModelConnectionInput(value));
    await syncAgentConnection(connectionStore);
    return withOAuthStatus(state);
  });
  ipcMain.handle("desktop:model:activate", async (event, connectionId: unknown) => {
    assertTrustedSender(event.senderFrame?.url);
    if (typeof connectionId !== "string") throw new Error("Invalid connection ID");
    const state = await connectionStore.activate(connectionId);
    await syncAgentConnection(connectionStore);
    return withOAuthStatus(state);
  });
  ipcMain.handle("desktop:model:remove", async (event, connectionId: unknown) => {
    assertTrustedSender(event.senderFrame?.url);
    if (typeof connectionId !== "string") throw new Error("Invalid connection ID");
    const state = await connectionStore.remove(connectionId);
    await syncAgentConnection(connectionStore);
    return withOAuthStatus(state);
  });
  ipcMain.handle("desktop:oauth:start", async (event) => {
    assertTrustedSender(event.senderFrame?.url);
    const result = await supervisor?.requestOAuth("start");
    if (!result || !("authUrl" in result)) throw new Error("OAuth login did not start");
    assertOAuthUrl(result.authUrl);
    await shell.openExternal(result.authUrl);
    return result;
  });
  ipcMain.handle("desktop:oauth:status", async (event) => {
    assertTrustedSender(event.senderFrame?.url);
    const status = await readOAuthStatus();
    await syncAgentConnection(connectionStore, status);
    return status;
  });
  ipcMain.handle("desktop:oauth:logout", async (event) => {
    assertTrustedSender(event.senderFrame?.url);
    await supervisor?.requestOAuth("logout");
    await syncAgentConnection(connectionStore, {
      connected: false,
      authMode: null,
      planType: null,
    });
  });
  ipcMain.handle("desktop:process-status", (event) => {
    assertTrustedSender(event.senderFrame?.url);
    return supervisor?.getStatuses() ?? {};
  });
  ipcMain.handle("desktop:update-status", (event) => {
    assertTrustedSender(event.senderFrame?.url);
    return { enabled: false, state: "disabled" };
  });
  ipcMain.handle("desktop:export", async (event, request: unknown) => {
    assertTrustedSender(event.senderFrame?.url);
    const validated = parseExportRequest(request);
    mkdirSync(exportsPath, { recursive: true });
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: join(exportsPath, validated.suggestedName),
    });
    if (result.canceled || !result.filePath) return { cancelled: true };
    writeFileSync(result.filePath, validated.content, "utf8");
    return { cancelled: false };
  });
}

async function syncAgentConnection(
  connectionStore: SecureModelConnectionStore,
  oauthStatus?: AgentOAuthStatus,
): Promise<void> {
  const active = await connectionStore.getActive();
  if (active?.provider !== "chatgpt-oauth") {
    await supervisor?.setAgentConnection(active);
    return;
  }
  const status = oauthStatus ?? await readOAuthStatus();
  await supervisor?.setAgentConnection({
    ...active,
    configured: status.connected,
  });
}

async function retryAgentConnectionSync(
  connectionStore: SecureModelConnectionStore,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(500);
    if (supervisor?.getStatuses().agent !== "running") continue;
    try {
      const active = await connectionStore.getActive();
      if (!active) return;
      if (active.provider !== "chatgpt-oauth") {
        await syncAgentConnection(connectionStore);
        return;
      }
      const status = await readOAuthStatus();
      await syncAgentConnection(connectionStore, status);
      if (status.connected) return;
    } catch {
      // A later IPC refresh can recover a transient startup failure.
    }
  }
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function withOAuthStatus(
  state: AgentModelConnectionState,
): Promise<AgentModelConnectionState> {
  if (!state.connections.some((connection) => connection.provider === "chatgpt-oauth")) {
    return state;
  }
  const status = await readOAuthStatus();
  return {
    ...state,
    connections: state.connections.map((connection) => (
      connection.provider === "chatgpt-oauth"
        ? { ...connection, configured: status.connected }
        : connection
    )),
  };
}

async function readOAuthStatus(): Promise<AgentOAuthStatus> {
  try {
    const result = await supervisor?.requestOAuth("status");
    if (result && "connected" in result) return result;
  } catch {
    // The settings view can still render while the Agent process starts.
  }
  return { connected: false, authMode: null, planType: null };
}

function assertTrustedSender(url: string | undefined): void {
  if (!url || !isTrustedRendererUrl(url, rendererOrigin)) {
    throw new Error("Untrusted IPC sender");
  }
}

function parseExportRequest(value: unknown): { content: string; suggestedName: string } {
  if (
    typeof value !== "object"
    || value === null
    || !("content" in value)
    || !("suggestedName" in value)
    || typeof value.content !== "string"
    || typeof value.suggestedName !== "string"
  ) {
    throw new Error("Invalid export request");
  }
  const suggestedName = value.suggestedName.replace(/[<>:"/\\|?*]/g, "_").slice(0, 120);
  if (!suggestedName) throw new Error("Invalid export filename");
  return { content: value.content, suggestedName };
}

function parseModelConnectionInput(value: unknown): AgentModelConnectionInput {
  if (!isRecord(value)) throw new Error("Invalid model connection");
  const provider = value.provider;
  const apiMode = value.apiMode;
  if (
    !["openai", "openai-compatible", "chatgpt-oauth"].includes(String(provider))
    || !["responses", "chat-completions"].includes(String(apiMode))
    || typeof value.name !== "string"
    || typeof value.primaryModel !== "string"
  ) {
    throw new Error("Invalid model connection");
  }
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    name: value.name,
    provider: provider as AgentModelConnectionInput["provider"],
    apiMode: apiMode as AgentModelConnectionInput["apiMode"],
    baseUrl: typeof value.baseUrl === "string" ? value.baseUrl : null,
    primaryModel: value.primaryModel,
    fallbackModel: typeof value.fallbackModel === "string"
      ? value.fallbackModel
      : null,
    reasoningEnabled: value.reasoningEnabled === true,
    apiKey: typeof value.apiKey === "string" ? value.apiKey : null,
  };
}

function assertOAuthUrl(value: string): void {
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || !["chatgpt.com", "auth.openai.com"].includes(url.hostname)
  ) {
    throw new Error("OAuth returned an untrusted authorization URL");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
