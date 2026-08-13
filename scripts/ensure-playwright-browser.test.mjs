import { describe, expect, it } from "vitest";
import { ensurePlaywrightBrowser } from "./ensure-playwright-browser.mjs";

describe("Playwright browser bootstrap", () => {
  it("skips installation when the configured browser already exists", () => {
    const result = ensurePlaywrightBrowser({
      executablePath: "C:/playwright/chrome.exe",
      fileExists: () => true,
      install: () => { throw new Error("installation should be skipped"); },
    });

    expect(result).toEqual({
      ok: true,
      skipped: true,
      executablePath: "C:/playwright/chrome.exe",
    });
  });

  it("installs once when the browser is missing and confirms the executable", () => {
    let installed = false;
    let installCalls = 0;
    const result = ensurePlaywrightBrowser({
      executablePath: "C:/playwright/chrome.exe",
      fileExists: () => installed,
      install: () => {
        installCalls += 1;
        installed = true;
        return { status: 0 };
      },
    });

    expect(result).toEqual({
      ok: true,
      skipped: false,
      executablePath: "C:/playwright/chrome.exe",
    });
    expect(installCalls).toBe(1);
  });

  it("fails when installation exits unsuccessfully", () => {
    expect(() => ensurePlaywrightBrowser({
      executablePath: "C:/playwright/chrome.exe",
      fileExists: () => false,
      install: () => ({ status: 1 }),
    })).toThrow("installation failed");
  });
});
