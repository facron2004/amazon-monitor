import { chromium, type Browser, type Page } from "playwright";
import { blockCategoryImages, blockCategoryResources, blockHeavyResources, waitForNetworkIdle } from "./config.js";
export { setDeliveryZipCode } from "./delivery-location.js";
import { ProxyPool } from "./proxy-pool.js";

export async function launchAmazonBrowser(): Promise<Browser> {
  const proxyPool = ProxyPool.getInstance();
  const proxy = await proxyPool.getProxy();

  const baseOptions: Parameters<typeof chromium.launch>[0] = {
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--no-first-run"
    ],
    proxy: proxy ?? undefined
  };

  const attempts: Array<{ label: string; options: Parameters<typeof chromium.launch>[0] }> = [];
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) {
    attempts.push({ label: "configured executable", options: { ...baseOptions, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } });
  }
  if (process.env.PLAYWRIGHT_BROWSER_CHANNEL) {
    attempts.push({ label: `channel ${process.env.PLAYWRIGHT_BROWSER_CHANNEL}`, options: { ...baseOptions, channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } });
  }
  attempts.push(
    { label: "bundled chromium", options: baseOptions },
    { label: "chrome channel", options: { ...baseOptions, channel: "chrome" } },
    { label: "msedge channel", options: { ...baseOptions, channel: "msedge" } }
  );
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const browser = await chromium.launch(attempt.options);
      if (proxy) {
        (browser as Browser & { _proxyUrl?: string })._proxyUrl = proxy.server;
      }
      return browser;
    } catch (error) {
      errors.push(`${attempt.label}: ${error instanceof Error ? firstErrorLine(error.message) : String(error)}`);
    }
  }
  throw new Error(`Unable to launch Playwright browser. Tried ${errors.join(" | ")}`);
}

export function reportBrowserProxyFailure(browser: Browser): void {
  const proxyUrl = (browser as Browser & { _proxyUrl?: string })._proxyUrl;
  if (proxyUrl) {
    ProxyPool.getInstance().reportFailure(proxyUrl);
  }
}

export async function closeBrowser(browser: Browser): Promise<void> {
  await browser.close().catch(() => undefined);
}

export async function installResourceBlocker(page: Page): Promise<void> {
  if (!blockHeavyResources()) {
    return;
  }
  await page.route("**/*", (route) => {
    const resourceType = route.request().resourceType();
    if (resourceType === "image" || resourceType === "media" || resourceType === "font") {
      route.abort().catch(() => undefined);
      return;
    }
    route.continue().catch(() => undefined);
  });
}

export async function installCategoryResourceBlocker(page: Page): Promise<void> {
  if (!blockCategoryResources()) {
    return;
  }
  await page.route("**/*", (route) => {
    const resourceType = route.request().resourceType();
    if (resourceType === "font" || resourceType === "media" || (resourceType === "image" && blockCategoryImages())) {
      route.abort().catch(() => undefined);
      return;
    }
    route.continue().catch(() => undefined);
  });
}

export async function waitForNetworkIdleIfEnabled(page: Page, timeout: number): Promise<void> {
  if (!waitForNetworkIdle()) {
    return;
  }
  await page.waitForLoadState("networkidle", { timeout }).catch(() => undefined);
}

function firstErrorLine(value: string): string {
  return value.split(/\r?\n/).find((line) => line.trim())?.trim() ?? value;
}
