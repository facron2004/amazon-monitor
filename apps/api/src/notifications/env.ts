import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_ENV_KEYS = new Set([
  "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM",
  "SMTP_REQUIRE_TLS", "SMTP_TIMEOUT_MS", "SMTP_PROXY",
  "FEISHU_WEBHOOK", "PUBLIC_BASE_URL",
  "AMAZON_MONITOR_API_KEY", "ALLOWED_ORIGINS", "EXPOSE_API_DOCS"
]);

export function loadEnv() {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const searchPaths = [
      path.join(process.cwd(), ".env"),
      path.join(process.cwd(), "../..", ".env"),
      path.resolve(path.dirname(currentFile), "../../../../..", ".env")
    ];
    for (const envPath of searchPaths) {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
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
