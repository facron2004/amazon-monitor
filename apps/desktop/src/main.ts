import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  session,
} from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createSecureWebPreferences,
  isAllowedRendererUrl,
} from "./browser-security.js";
import {
  createDesktopPaths,
  migrateLegacyDatabase,
} from "./desktop-paths.js";
import { DesktopProcessSupervisor } from "./process-supervisor.js";
import { SecureApiKeyStore } from "./secure-key-store.js";

const rendererOrigin = "http://127.0.0.1:43210";
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let supervisor: DesktopProcessSupervisor | null = null;

app.enableSandbox();

app.whenReady().then(async () => {
  const paths = createDesktopPaths(app.getPath("userData"));
  const legacyDatabase = resolve(app.getAppPath(), "../../data/amazon-monitor.sqlite");
  migrateLegacyDatabase(legacyDatabase, paths.database);

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
  supervisor = new DesktopProcessSupervisor({
    entryPoint: join(moduleDirectory, "utility-entry.js"),
    environment: {
      AGENT_SDK_ENABLED: process.env.AGENT_SDK_ENABLED ?? "false",
      DB_PATH: paths.database,
      DESKTOP_API_ENTRY: apiEntry,
      DESKTOP_API_BRIDGE_ENTRY: apiBridgeEntry,
      DESKTOP_API_STORE_ENTRY: apiStoreEntry,
      DESKTOP_CRAWLER_ENTRY: crawlerEntry,
      ENABLE_CRON: "false",
      PLAYWRIGHT_BROWSERS_PATH: app.isPackaged
        ? join(process.resourcesPath, "playwright-browsers")
        : paths.browser,
      PORT: "43210",
      WEB_DIST_PATH: app.isPackaged
        ? join(process.resourcesPath, "web")
        : resolve(app.getAppPath(), "../web/dist"),
    },
    logsPath: paths.logs,
  });
  supervisor.startAll();

  const keyStore = new SecureApiKeyStore(
    safeStorage,
    join(paths.secrets, "openai-api-key.bin"),
  );
  await supervisor.setAgentApiKey(await keyStore.get());
  registerIpc(keyStore, paths.exports);

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
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedRendererUrl(url, rendererOrigin)) event.preventDefault();
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
});

app.on("before-quit", () => supervisor?.stopAll());
app.on("window-all-closed", () => app.quit());

function registerIpc(keyStore: SecureApiKeyStore, exportsPath: string): void {
  ipcMain.handle("desktop:key:set", async (event, apiKey: unknown) => {
    assertTrustedSender(event.senderFrame?.url);
    if (typeof apiKey !== "string") throw new Error("Invalid API key");
    await keyStore.set(apiKey);
    await supervisor?.setAgentApiKey(apiKey.trim());
  });
  ipcMain.handle("desktop:key:clear", async (event) => {
    assertTrustedSender(event.senderFrame?.url);
    keyStore.clear();
    await supervisor?.setAgentApiKey(null);
  });
  ipcMain.handle("desktop:key:has", (event) => {
    assertTrustedSender(event.senderFrame?.url);
    return keyStore.has();
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

function assertTrustedSender(url: string | undefined): void {
  if (!url || !isAllowedRendererUrl(url, rendererOrigin)) {
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
