import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn()
}));

vi.mock("./config.js", () => ({
  timeoutMs: vi.fn(() => 30000)
}));

import { existsSync, mkdirSync } from "node:fs";
import type { CategoryMonitor, KeywordMonitor } from "@amazon-monitor/shared";
import {
  assertNotBlocked,
  assertCategoryNotBlocked,
  waitForBestSellerCards,
  saveCollectorScreenshot,
  saveCategoryCollectorScreenshot
} from "./page-guards.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

class MockLocator {
  private text: string;
  constructor(text: string) {
    this.text = text;
  }
  innerText = vi.fn(async () => this.text);
}

class MockPage {
  bodyText = "";
  pageTitle = "";
  screenshotFn = vi.fn(async () => undefined);
  waitForSelectorFn = vi.fn(async () => ({}));

  locator = vi.fn((selector: string) => {
    if (selector === "body") {
      return new MockLocator(this.bodyText);
    }
    return new MockLocator("");
  });

  title = vi.fn(async () => this.pageTitle);

  screenshot = vi.fn(async (...args: unknown[]) => this.screenshotFn(...args));

  waitForSelector = vi.fn(async (...args: unknown[]) => this.waitForSelectorFn(...args));
}

function makeKeyword(overrides: Partial<KeywordMonitor> = {}): KeywordMonitor {
  return {
    id: 1,
    keyword: "ice makers",
    marketplace: "amazon.com",
    zipCode: null,
    language: null,
    categoryTag: null,
    crawlPages: 3,
    status: "enabled",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    lastCollectedAt: null,
    todayStatus: "pending",
    ...overrides
  };
}

function makeCategory(overrides: Partial<CategoryMonitor> = {}): CategoryMonitor {
  return {
    id: 1,
    name: "Kitchen & Dining",
    marketplace: "amazon.com",
    categoryUrl: "https://www.amazon.com/gp/bestsellers/kitchen",
    categoryPath: null,
    crawlTopN: 50,
    status: "enabled",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    lastCollectedAt: null,
    todayStatus: "pending",
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// assertNotBlocked
// ---------------------------------------------------------------------------
describe("assertNotBlocked", () => {
  let page: MockPage;
  const keyword = makeKeyword();
  const pageNo = 1;
  const date = "2025-06-15";

  beforeEach(() => {
    vi.clearAllMocks();
    page = new MockPage();
  });

  it("resolves on a normal search results page", async () => {
    page.bodyText = "Search results for ice makers";
    page.pageTitle = "Amazon.com: ice makers";
    await expect(assertNotBlocked(page as any, keyword, pageNo, date)).resolves.toBeUndefined();
  });

  it("throws when page contains CAPTCHA text", async () => {
    page.bodyText = "Enter the characters you see below to continue";
    page.pageTitle = "Amazon.com";
    await expect(assertNotBlocked(page as any, keyword, pageNo, date)).rejects.toThrow(/blocked.*search/i);
  });

  it("throws when page contains robot-check text", async () => {
    page.bodyText = "Type the characters you see in this image to make sure you're not a robot";
    page.pageTitle = "Amazon.com";
    await expect(assertNotBlocked(page as any, keyword, pageNo, date)).rejects.toThrow(/blocked.*search/i);
  });

  it("throws when page contains 'automated access' text", async () => {
    page.bodyText = "We detected automated access from your network";
    page.pageTitle = "Amazon.com";
    await expect(assertNotBlocked(page as any, keyword, pageNo, date)).rejects.toThrow(/blocked.*search/i);
  });

  it("throws when page contains 'click the button below to continue shopping' text", async () => {
    page.bodyText = "Click the button below to continue shopping";
    page.pageTitle = "Amazon.com";
    await expect(assertNotBlocked(page as any, keyword, pageNo, date)).rejects.toThrow(/blocked.*search/i);
  });

  it("throws on Amazon error title 'Sorry! Something went wrong!'", async () => {
    page.bodyText = "Search results for ice makers";
    page.pageTitle = "Sorry! Something went wrong!";
    await expect(assertNotBlocked(page as any, keyword, pageNo, date)).rejects.toThrow(/temporary error page/i);
  });

  it("throws when body contains 'something went wrong on our end'", async () => {
    page.bodyText = "Oops, something went wrong on our end. Please try again.";
    page.pageTitle = "Amazon.com";
    await expect(assertNotBlocked(page as any, keyword, pageNo, date)).rejects.toThrow(/temporary error page/i);
  });

  it("throws when body contains 'couldn't find that page'", async () => {
    page.bodyText = "Sorry, we couldn't find that page. Try searching or go to Amazon's home page.";
    page.pageTitle = "Amazon.com";
    await expect(assertNotBlocked(page as any, keyword, pageNo, date)).rejects.toThrow(/missing page/i);
  });

  it("throws when title contains 'page not found'", async () => {
    page.bodyText = "Some content here";
    page.pageTitle = "Page Not Found";
    await expect(assertNotBlocked(page as any, keyword, pageNo, date)).rejects.toThrow(/missing page/i);
  });

  it("includes screenshot path in the blocked error message", async () => {
    page.bodyText = "Enter the characters you see below";
    page.pageTitle = "Amazon.com";
    try {
      await assertNotBlocked(page as any, keyword, pageNo, date);
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("Screenshot:");
      expect(err.message).toContain("blocked");
    }
  });

  it("includes screenshot path in the error-page error message", async () => {
    page.bodyText = "regular text";
    page.pageTitle = "Sorry! Something went wrong!";
    try {
      await assertNotBlocked(page as any, keyword, pageNo, date);
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("Screenshot:");
      expect(err.message).toContain("amazon-error");
    }
  });

  it("resolves when body text fetch fails (catch returns empty string)", async () => {
    page.locator = vi.fn(() => ({
      innerText: vi.fn(async () => {
        throw new Error("timeout");
      })
    })) as any;
    page.pageTitle = "Amazon.com: ice makers";
    await expect(assertNotBlocked(page as any, keyword, pageNo, date)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// assertCategoryNotBlocked
// ---------------------------------------------------------------------------
describe("assertCategoryNotBlocked", () => {
  let page: MockPage;
  const category = makeCategory();
  const pageNo = 2;
  const date = "2025-06-15";

  beforeEach(() => {
    vi.clearAllMocks();
    page = new MockPage();
  });

  it("resolves on a normal category page", async () => {
    page.bodyText = "Best Sellers in Kitchen & Dining";
    page.pageTitle = "Amazon Best Sellers: Kitchen & Dining";
    await expect(assertCategoryNotBlocked(page as any, category, pageNo, date)).resolves.toBeUndefined();
  });

  it("throws when CAPTCHA is detected", async () => {
    page.bodyText = "Enter the characters you see below";
    page.pageTitle = "Amazon.com";
    await expect(assertCategoryNotBlocked(page as any, category, pageNo, date)).rejects.toThrow(/blocked.*category/i);
  });

  it("throws on Amazon error page", async () => {
    page.bodyText = "Best Sellers page content";
    page.pageTitle = "Sorry! Something went wrong!";
    await expect(assertCategoryNotBlocked(page as any, category, pageNo, date)).rejects.toThrow(/temporary error page/i);
  });

  it("throws on missing page", async () => {
    page.bodyText = "Sorry, we couldn't find that page";
    page.pageTitle = "Amazon.com";
    await expect(assertCategoryNotBlocked(page as any, category, pageNo, date)).rejects.toThrow(/missing page/i);
  });

  it("includes 'category' label in blocked error messages", async () => {
    page.bodyText = "make sure you're not a robot";
    page.pageTitle = "Amazon.com";
    try {
      await assertCategoryNotBlocked(page as any, category, pageNo, date);
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("category collection");
    }
  });
});

// ---------------------------------------------------------------------------
// waitForBestSellerCards
// ---------------------------------------------------------------------------
describe("waitForBestSellerCards", () => {
  let page: MockPage;
  const category = makeCategory();
  const pageNo = 1;
  const date = "2025-06-15";

  beforeEach(() => {
    vi.clearAllMocks();
    page = new MockPage();
  });

  it("resolves when product cards are found", async () => {
    page.waitForSelectorFn = vi.fn(async () => ({}));
    await expect(waitForBestSellerCards(page as any, category, pageNo, date)).resolves.toBeUndefined();
  });

  it("throws with screenshot path when selector times out", async () => {
    page.waitForSelectorFn = vi.fn(async () => {
      throw new Error("Timeout 30000ms exceeded");
    });
    await expect(waitForBestSellerCards(page as any, category, pageNo, date)).rejects.toThrow(/Timeout/);
  });

  it("includes screenshot reference in the timeout error message", async () => {
    page.waitForSelectorFn = vi.fn(async () => {
      throw new Error("Timeout 30000ms exceeded");
    });
    try {
      await waitForBestSellerCards(page as any, category, pageNo, date);
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("Screenshot:");
      expect(err.message).toContain("no-bestseller-cards");
    }
  });

  it("passes the configured timeout from config to waitForSelector", async () => {
    page.waitForSelectorFn = vi.fn(async () => ({}));
    await waitForBestSellerCards(page as any, category, pageNo, date);
    expect(page.waitForSelector).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: 30000 })
    );
  });

  it("handles non-Error thrown from waitForSelector", async () => {
    page.waitForSelectorFn = vi.fn(async () => {
      throw "string error";
    });
    await expect(waitForBestSellerCards(page as any, category, pageNo, date)).rejects.toThrow(/string error/);
  });
});

// ---------------------------------------------------------------------------
// saveCollectorScreenshot
// ---------------------------------------------------------------------------
describe("saveCollectorScreenshot", () => {
  let page: MockPage;

  beforeEach(() => {
    vi.clearAllMocks();
    page = new MockPage();
  });

  it("generates a filename with date, keyword, page number, and reason", async () => {
    const keyword = makeKeyword({ keyword: "ice makers" });
    const result = await saveCollectorScreenshot(page as any, keyword, 2, "2025-06-15", "blocked");
    expect(result).toContain("2025-06-15-ice-makers-p2-blocked.png");
  });

  it("sanitizes special characters in keyword", async () => {
    const keyword = makeKeyword({ keyword: "ice makers / cool stuff!" });
    const result = await saveCollectorScreenshot(page as any, keyword, 1, "2025-06-15", "error");
    expect(result).toContain("2025-06-15-ice-makers-cool-stuff-p1-error.png");
  });

  it("creates the screenshots directory if it does not exist", async () => {
    const keyword = makeKeyword();
    vi.mocked(existsSync).mockReturnValue(false);
    await saveCollectorScreenshot(page as any, keyword, 1, "2025-06-15", "test");
    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining("collector-screenshots"), { recursive: true });
  });

  it("skips mkdir when directory already exists", async () => {
    const keyword = makeKeyword();
    vi.mocked(existsSync).mockReturnValue(true);
    await saveCollectorScreenshot(page as any, keyword, 1, "2025-06-15", "test");
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it("calls page.screenshot with fullPage and correct path", async () => {
    const keyword = makeKeyword({ keyword: "blender" });
    await saveCollectorScreenshot(page as any, keyword, 3, "2025-01-01", "timeout");
    expect(page.screenshot).toHaveBeenCalledWith(
      expect.objectContaining({
        fullPage: true,
        path: expect.stringContaining("2025-01-01-blender-p3-timeout.png")
      })
    );
  });

  it("returns the file path even when screenshot fails", async () => {
    page.screenshotFn = vi.fn(async () => {
      throw new Error("screenshot failed");
    });
    const keyword = makeKeyword();
    const result = await saveCollectorScreenshot(page as any, keyword, 1, "2025-06-15", "fail");
    expect(result).toContain(".png");
  });

  it("truncates very long keywords to 48 characters", async () => {
    const longKeyword = "a".repeat(100);
    const keyword = makeKeyword({ keyword: longKeyword });
    const result = await saveCollectorScreenshot(page as any, keyword, 1, "2025-06-15", "test");
    const filename = result.split(/[/\\]/).pop()!;
    // The safe part should be at most 48 chars
    const safePart = filename.replace(/^2025-06-15-/, "").replace(/-p1-test\.png$/, "");
    expect(safePart.length).toBeLessThanOrEqual(48);
  });
});

// ---------------------------------------------------------------------------
// saveCategoryCollectorScreenshot
// ---------------------------------------------------------------------------
describe("saveCategoryCollectorScreenshot", () => {
  let page: MockPage;

  beforeEach(() => {
    vi.clearAllMocks();
    page = new MockPage();
  });

  it("generates a filename with date, category name, 'bestseller', page, and reason", async () => {
    const category = makeCategory({ name: "Kitchen & Dining" });
    const result = await saveCategoryCollectorScreenshot(page as any, category, 1, "2025-06-15", "blocked");
    expect(result).toContain("2025-06-15-Kitchen-Dining-bestseller-p1-blocked.png");
  });

  it("uses 'category' as fallback when name is empty after sanitization", async () => {
    const category = makeCategory({ name: "" });
    const result = await saveCategoryCollectorScreenshot(page as any, category, 2, "2025-06-15", "error");
    expect(result).toContain("2025-06-15-category-bestseller-p2-error.png");
  });

  it("sanitizes special characters in category name", async () => {
    const category = makeCategory({ name: "Electronics > Phones & Tablets!" });
    const result = await saveCategoryCollectorScreenshot(page as any, category, 1, "2025-06-15", "timeout");
    expect(result).toContain("Electronics-Phones-Tablets");
  });

  it("calls page.screenshot with fullPage option", async () => {
    const category = makeCategory({ name: "Toys" });
    await saveCategoryCollectorScreenshot(page as any, category, 1, "2025-06-15", "test");
    expect(page.screenshot).toHaveBeenCalledWith(
      expect.objectContaining({ fullPage: true })
    );
  });

  it("returns the file path even when screenshot fails", async () => {
    page.screenshotFn = vi.fn(async () => {
      throw new Error("screenshot failed");
    });
    const category = makeCategory();
    const result = await saveCategoryCollectorScreenshot(page as any, category, 1, "2025-06-15", "fail");
    expect(result).toContain(".png");
  });
});
