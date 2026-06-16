import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./browser.js", () => ({
  setDeliveryZipCode: vi.fn(async () => undefined)
}));

import type { Browser, BrowserContext } from "playwright";
import { setDeliveryZipCode } from "./browser.js";
import { createAmazonContext } from "./context.js";

describe("amazon context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a browser context with shared defaults and applies the delivery zip code", async () => {
    const zipPage = { close: vi.fn(async () => undefined) };
    const context = {
      newPage: vi.fn(async () => zipPage)
    } as unknown as BrowserContext;
    const browser = {
      newContext: vi.fn(async () => context)
    } as unknown as Browser;

    const result = await createAmazonContext(browser, {
      locale: "en-US",
      acceptLanguage: "en-US,en;q=0.9",
      marketplace: "amazon.com",
      zipCode: "97201",
      viewport: { width: 1440, height: 900 }
    });

    expect(result).toBe(context);
    expect(browser.newContext).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en-US",
        timezoneId: "America/New_York",
        userAgent: expect.stringContaining("Mozilla/5.0"),
        extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
        viewport: { width: 1440, height: 900 }
      })
    );
    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(setDeliveryZipCode).toHaveBeenCalledWith(zipPage, "amazon.com", "97201");
    expect(zipPage.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["US", "www.amazon.com", "America/New_York"],
    ["UK", "www.amazon.co.uk", "Europe/London"],
    ["DE", "www.amazon.de", "Europe/Berlin"],
    ["JP", "www.amazon.co.jp", "Asia/Tokyo"]
  ])("resolves timezone %s (%s) to %s", async (_label, host, expectedTz) => {
    const zipPage = { close: vi.fn(async () => undefined) };
    const context = { newPage: vi.fn(async () => zipPage) } as unknown as BrowserContext;
    const browser = { newContext: vi.fn(async () => context) } as unknown as Browser;

    await createAmazonContext(browser, {
      locale: "en-US",
      acceptLanguage: "en-US,en;q=0.9",
      marketplace: host
    });

    expect(browser.newContext).toHaveBeenCalledWith(
      expect.objectContaining({ timezoneId: expectedTz })
    );
  });

  it("returns the context even when delivery zip setup fails", async () => {
    const zipPage = { close: vi.fn(async () => undefined) };
    const context = {
      newPage: vi.fn(async () => zipPage)
    } as unknown as BrowserContext;
    const browser = {
      newContext: vi.fn(async () => context)
    } as unknown as Browser;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(setDeliveryZipCode).mockRejectedValueOnce(new Error("zip failed"));

    const result = await createAmazonContext(browser, {
      locale: "en-US",
      acceptLanguage: "en-US,en;q=0.9",
      marketplace: "amazon.com"
    });

    expect(result).toBe(context);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("Failed to set delivery zip code"));
    expect(zipPage.close).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });
});
