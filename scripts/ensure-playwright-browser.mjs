import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { chromium } from "playwright";

export function ensurePlaywrightBrowser({
  executablePath = chromium.executablePath(),
  fileExists = existsSync,
  install = installChromium,
} = {}) {
  if (fileExists(executablePath)) {
    return { ok: true, skipped: true, executablePath };
  }
  const result = install();
  if (result.status !== 0) {
    throw new Error(`Playwright Chromium installation failed with status ${String(result.status)}`);
  }
  if (!fileExists(executablePath)) {
    throw new Error(`Playwright Chromium executable was not found after installation: ${executablePath}`);
  }
  return { ok: true, skipped: false, executablePath };
}

function installChromium() {
  const command = process.platform === "win32" ? "playwright.cmd" : "playwright";
  return spawnSync(command, ["install", "chromium"], { stdio: "inherit" });
}

function main() {
  console.log(JSON.stringify(ensurePlaywrightBrowser(), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  }
}
