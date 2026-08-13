import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const envKeys = ["AMAZON_MONITOR_ENV_FILE", "SMTP_HOST", "SMTP_USER", "SMTP_FROM"] as const;
const originalValues = new Map(envKeys.map((key) => [key, process.env[key]]));
const temporaryRoots: string[] = [];

afterEach(() => {
  temporaryRoots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true }));
  for (const key of envKeys) {
    const original = originalValues.get(key);
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe("environment loading", () => {
  it("loads SMTP values from the desktop-provided env path", () => {
    const root = mkdtempSync(join(tmpdir(), "amazon-monitor-api-env-"));
    temporaryRoots.push(root);
    const envPath = join(root, ".env");
    writeFileSync(envPath, [
      "SMTP_HOST=smtp.desktop.test",
      "SMTP_USER=sender@desktop.test",
      "SMTP_FROM=sender@desktop.test",
      "UNSAFE_NOT_ALLOWED=should-not-load",
    ].join("\n"));
    envKeys.forEach((key) => delete process.env[key]);
    process.env.AMAZON_MONITOR_ENV_FILE = envPath;

    loadEnv();

    expect(process.env.SMTP_HOST).toBe("smtp.desktop.test");
    expect(process.env.SMTP_USER).toBe("sender@desktop.test");
    expect(process.env.SMTP_FROM).toBe("sender@desktop.test");
    expect(process.env.UNSAFE_NOT_ALLOWED).toBeUndefined();
  });
});
