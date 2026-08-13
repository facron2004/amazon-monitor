import type { DesktopProcessName } from "./process-supervisor.js";

const inheritedRuntimeKeys = [
  "Path",
  "PATH",
  "SystemRoot",
  "WINDIR",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "COMSPEC",
] as const;

const roleEnvironmentKeys: Record<DesktopProcessName, readonly string[]> = {
  api: [
    "NODE_ENV",
    "HOST",
    "PORT",
    "DB_PATH",
    "DESKTOP_API_ENTRY",
    "WEB_DIST_PATH",
    "DESKTOP_API_BRIDGE_ENTRY",
    "DESKTOP_API_STORE_ENTRY",
    "AMAZON_MONITOR_ENV_FILE",
    "ENABLE_CRON",
    "RUN_WORKER",
    "AGENT_SDK_ENABLED",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "SMTP_REQUIRE_TLS",
    "SMTP_TIMEOUT_MS",
    "SMTP_PROXY",
    "FEISHU_WEBHOOK",
    "PUBLIC_BASE_URL",
    "ALLOWED_ORIGINS",
    "EXPOSE_API_DOCS",
    "DATA_SOURCE_CREDENTIALS_KEY",
    "DATA_SOURCE_CREDENTIALS_KEY_VERSION",
    "SP_API_CONNECTOR_ENABLED",
    "SP_API_SYNC_FIXTURE_DIR",
    "INSIGHT_REPORT_LLM_API_KEY",
    "INSIGHT_REPORT_LLM_MODEL",
    "INSIGHT_REPORT_LLM_BASE_URL",
    "INSIGHT_REPORT_LLM_TIMEOUT_MS",
  ],
  agent: [
    "NODE_ENV",
    "AGENT_SDK_ENABLED",
    "AMAZON_MONITOR_AGENT_SANDBOX",
    "AMAZON_MONITOR_CODEX_HOME",
    "CODEX_HOME",
  ],
  crawler: [
    "NODE_ENV",
    "DB_PATH",
    "DESKTOP_API_STORE_ENTRY",
    "DESKTOP_CRAWLER_ENTRY",
    "PLAYWRIGHT_BROWSERS_PATH",
  ],
};

/**
 * Build the environment for one desktop utility process without inheriting
 * arbitrary credentials from the Electron parent process.
 */
export function buildProcessEnvironment(
  role: DesktopProcessName,
  inherited: NodeJS.ProcessEnv,
  configured: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of inheritedRuntimeKeys) {
    const value = inherited[key];
    if (value !== undefined) result[key] = value;
  }

  for (const key of roleEnvironmentKeys[role]) {
    const value = configured[key] ?? inherited[key];
    if (value !== undefined) result[key] = value;
  }

  result.DESKTOP_PROCESS_ROLE = role;
  return result;
}

/** Keep the Renderer origin stable when the API utility is restarted. */
export function pinApiPort(
  configured: Record<string, string>,
  port: number | undefined,
): void {
  if (port === undefined || !Number.isInteger(port) || port < 1 || port > 65_535) return;
  configured.PORT = String(port);
}

export function resolveProcessInitialization(
  stored: Record<string, string> | undefined,
  requested: Record<string, string>,
): Record<string, string> {
  return {
    ...((Object.keys(requested).length > 0 || !stored) ? requested : stored),
  };
}
