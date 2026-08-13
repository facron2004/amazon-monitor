import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_ENV_KEYS = new Set([
  // SMTP
  "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM",
  "SMTP_REQUIRE_TLS", "SMTP_TIMEOUT_MS", "SMTP_PROXY",
  // Notifications / security
  "FEISHU_WEBHOOK", "PUBLIC_BASE_URL",
  "ALLOWED_ORIGINS", "EXPOSE_API_DOCS",
  // Server / database
  "PORT", "DB_PATH", "SQLITE_BUSY_TIMEOUT_MS", "ENABLE_CRON", "RUN_WORKER", "WEB_DIST_PATH",
  // Worker tuning
  "AMAZON_COLLECT_MAX_RETRIES", "AMAZON_COLLECT_POLL_INTERVAL_MS", "AMAZON_WORKER_CONCURRENCY",
  "AMAZON_WORKER_JOB_TIMEOUT_MS", "AMAZON_WORKER_HEARTBEAT_MS", "AMAZON_WORKER_REAPER_INTERVAL_MS",
  "AMAZON_WORKER_LEASE_MS", "AMAZON_WORKER_DRAIN_TIMEOUT_MS",
  // SP-API connector (credentials stay server-side only)
  "SP_API_CONNECTOR_ENABLED", "DATA_SOURCE_CREDENTIALS_KEY", "DATA_SOURCE_CREDENTIALS_KEY_VERSION", "SP_API_SYNC_FIXTURE_DIR",
  // Keyword / detail collection tuning
  "AMAZON_COLLECT_KEYWORD_CONCURRENCY", "AMAZON_COLLECT_DETAIL_CONCURRENCY",
  "AMAZON_COLLECT_DETAIL_CACHE_ITEMS", "AMAZON_COLLECT_MAX_DETAIL_PRODUCTS",
  "AMAZON_COLLECT_TIMEOUT_MS", "AMAZON_COLLECT_SEARCH_RETRIES", "AMAZON_COLLECT_SEARCH_RETRY_DELAY_MS",
  "AMAZON_COLLECT_DETAIL_TIMEOUT_MS", "AMAZON_COLLECT_PAGE_DELAY_MS", "AMAZON_COLLECT_DETAIL_SETTLE_MS",
  "AMAZON_COLLECT_BLOCK_RESOURCES", "AMAZON_COLLECT_WAIT_NETWORK_IDLE", "AMAZON_COLLECT_INCLUDE_LANGUAGE_PARAM",
  // Category / bestseller tuning
  "AMAZON_COLLECT_CATEGORY_RETRIES", "AMAZON_COLLECT_CATEGORY_CONCURRENCY",
  "AMAZON_COLLECT_CATEGORY_BLOCK_RESOURCES", "AMAZON_COLLECT_CATEGORY_BLOCK_IMAGES",
  "AMAZON_BESTSELLER_PAGE_SIZE", "AMAZON_BESTSELLER_EXTRA_PAGES",
  "AMAZON_BESTSELLER_SCROLL_PASSES", "AMAZON_BESTSELLER_SCROLL_DELAY_MS",
  "AMAZON_BESTSELLER_MIN_SCROLL_PASSES", "AMAZON_BESTSELLER_STABLE_PASSES",
  "AMAZON_BESTSELLER_DETAIL_TOP_N", "AMAZON_BESTSELLER_PROMO_DETAIL_TOP_N",
  "AMAZON_BESTSELLER_VIEWPORT_WIDTH", "AMAZON_BESTSELLER_VIEWPORT_HEIGHT",
  // Proxy / browser
  "AMAZON_COLLECT_PROXY_MAX_FAILURES", "AMAZON_COLLECT_PROXY_API", "AMAZON_COLLECT_PROXIES",
  "PLAYWRIGHT_HEADLESS", "PLAYWRIGHT_EXECUTABLE_PATH", "PLAYWRIGHT_BROWSER_CHANNEL",
  // Location
  "AMAZON_ZIP_CODE"
]);

export function loadEnv() {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const configuredPath = cleanEnvValue(process.env.AMAZON_MONITOR_ENV_FILE);
    const searchPaths = [
      ...(configuredPath ? [path.resolve(process.cwd(), configuredPath)] : []),
      path.join(process.cwd(), ".env"),
      path.join(process.cwd(), "../..", ".env"),
      path.resolve(path.dirname(currentFile), "../../../../..", ".env")
    ];
    const seenPaths = new Set<string>();
    for (const envPath of searchPaths) {
      const normalizedPath = path.resolve(envPath);
      if (seenPaths.has(normalizedPath)) continue;
      seenPaths.add(normalizedPath);
      if (fs.existsSync(normalizedPath)) {
        const content = fs.readFileSync(normalizedPath, "utf-8");
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const index = trimmed.indexOf("=");
          if (index > 0) {
            const key = trimmed.slice(0, index).trim();
            // Only load whitelisted keys and don't override existing values
            if (!ALLOWED_ENV_KEYS.has(key)) continue;
            if (process.env[key] !== undefined) continue;
            let val = trimmed.slice(index + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            process.env[key] = val;
          }
        }
        break;
      }
    }
  } catch {
    // ignore
  }
}

export function numberEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function booleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (/^(1|true|yes|on)$/i.test(value.trim())) return true;
  if (/^(0|false|no|off)$/i.test(value.trim())) return false;
  return undefined;
}

export function cleanEnvValue(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}
