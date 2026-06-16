import type { Browser, BrowserContext, BrowserContextOptions } from "playwright";
import { setDeliveryZipCode } from "./browser.js";

/**
 * Maps marketplace identifiers to the appropriate browser timezone.
 * Using the correct timezone for each marketplace avoids a common bot fingerprint.
 */
function resolveTimezone(marketplace: string): string {
  const lower = marketplace.trim().toLowerCase();
  if (lower.includes("amazon.co.uk") || lower.includes("amazon.co.jp")) {
    if (lower.includes(".co.jp")) return "Asia/Tokyo";
    return "Europe/London";
  }
  if (lower.includes("amazon.de")) return "Europe/Berlin";
  if (lower === "uk" || lower === "gb") return "Europe/London";
  if (lower === "de") return "Europe/Berlin";
  if (lower === "jp") return "Asia/Tokyo";
  return "America/New_York"; // default: US
}

/**
 * Generates a realistic Chrome User-Agent string with a randomized version.
 * The version range is kept recent to avoid triggering outdated-UA detection.
 */
function buildUserAgent(): string {
  // Chrome major version range: 130-136 (covers ~6 months of releases)
  const major = 130 + Math.floor(Math.random() * 7);
  const build = Math.floor(Math.random() * 7000);
  const patch = Math.floor(Math.random() * 200);
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.${build}.${patch} Safari/537.36`;
}

interface AmazonContextOptions {
  locale: string;
  acceptLanguage: string;
  marketplace: string;
  zipCode?: string | null;
  viewport?: BrowserContextOptions["viewport"];
}

export async function createAmazonContext(browser: Browser, options: AmazonContextOptions): Promise<BrowserContext> {
  const context = await browser.newContext({
    locale: options.locale,
    timezoneId: resolveTimezone(options.marketplace),
    userAgent: buildUserAgent(),
    extraHTTPHeaders: {
      "Accept-Language": options.acceptLanguage
    },
    viewport: options.viewport ?? { width: 1920, height: 1080 },
    ...(options.viewport ? { viewport: options.viewport } : {})
  });
  await applyDeliveryZipCodeSafely(context, options.marketplace, options.zipCode);
  return context;
}

async function applyDeliveryZipCodeSafely(context: BrowserContext, marketplace: string, zipCode?: string | null): Promise<void> {
  try {
    const zipPage = await context.newPage();
    try {
      await setDeliveryZipCode(zipPage, marketplace, zipCode);
    } finally {
      await zipPage.close().catch(() => undefined);
    }
  } catch (error) {
    console.warn(
      `[Collector] Failed to set delivery zip code, continuing with default location: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
