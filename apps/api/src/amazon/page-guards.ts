import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import type { CategoryMonitor, KeywordMonitor } from "@amazon-monitor/shared";
import { timeoutMs } from "./config.js";

export async function assertNotBlocked(page: Page, keyword: KeywordMonitor, pageNo: number, date: string): Promise<void> {
  await checkPageBlocked(page, `"${keyword.keyword}" page ${pageNo}`, () => saveCollectorScreenshot(page, keyword, pageNo, date, "blocked"), () => saveCollectorScreenshot(page, keyword, pageNo, date, "amazon-error"), "Search");
}

export async function assertCategoryNotBlocked(page: Page, category: CategoryMonitor, pageNo: number, date: string): Promise<void> {
  await checkPageBlocked(page, `"${category.name}" page ${pageNo}`, () => saveCategoryCollectorScreenshot(page, category, pageNo, date, "blocked"), () => saveCategoryCollectorScreenshot(page, category, pageNo, date, "amazon-error"), "Category");
}

async function checkPageBlocked(
  page: Page,
  context: string,
  captureBlocked: () => Promise<string>,
  captureError: () => Promise<string>,
  label: string
): Promise<void> {
  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  const blocked =
    /Enter the characters you see below/i.test(bodyText) ||
    /make sure you're not a robot/i.test(bodyText) ||
    /automated access/i.test(bodyText) ||
    /Click the button below to continue shopping/i.test(bodyText);

  if (blocked) {
    const screenshot = await captureBlocked();
    throw new Error(`Amazon blocked ${label.toLowerCase()} collection for ${context}. Screenshot: ${screenshot}`);
  }

  const title = await page.title().catch(() => "");
  const isAmazonError = /Sorry! Something went wrong!/i.test(title) || /something went wrong on our end/i.test(bodyText);
  if (isAmazonError) {
    const screenshot = await captureError();
    throw new Error(`Amazon returned a temporary error page for ${label.toLowerCase()} ${context}. Screenshot: ${screenshot}`);
  }

  const isAmazonMissingPage =
    /couldn.?t find that page/i.test(bodyText) ||
    /try searching or go to amazon.?s home page/i.test(bodyText) ||
    /page not found/i.test(title);
  if (isAmazonMissingPage) {
    const screenshot = await captureError();
    throw new Error(`Amazon returned a missing page for ${label.toLowerCase()} ${context}. Screenshot: ${screenshot}`);
  }
}

export async function waitForBestSellerCards(page: Page, category: CategoryMonitor, pageNo: number, date: string): Promise<void> {
  await page
    .waitForSelector('[data-testid="product-card"], .zg-grid-general-faceout, .p13n-sc-uncoverable-faceout, #gridItemRoot, [data-asin]', {
      timeout: timeoutMs()
    })
    .catch(async (error) => {
      const screenshot = await saveCategoryCollectorScreenshot(page, category, pageNo, date, "no-bestseller-cards");
      throw new Error(`${error instanceof Error ? error.message : String(error)} Screenshot: ${screenshot}`);
    });
}

export async function saveCollectorScreenshot(
  page: Page,
  keyword: KeywordMonitor,
  pageNo: number,
  date: string,
  reason: string
): Promise<string> {
  const safeKeyword = safeFilename(keyword.keyword);
  return await captureScreenshot(page, `${date}-${safeKeyword}-p${pageNo}-${reason}.png`);
}

export async function saveCategoryCollectorScreenshot(
  page: Page,
  category: CategoryMonitor,
  pageNo: number,
  date: string,
  reason: string
): Promise<string> {
  const safeName = safeFilename(category.name);
  return await captureScreenshot(page, `${date}-${safeName || "category"}-bestseller-p${pageNo}-${reason}.png`);
}

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48);
}

async function captureScreenshot(page: Page, filename: string): Promise<string> {
  const directory = join(process.cwd(), "data", "collector-screenshots");
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
  const filePath = join(directory, filename);
  await page.screenshot({ path: filePath, fullPage: true }).catch(() => undefined);
  return filePath;
}
