import type { BestSellerProductInput, CategoryMonitor } from "@amazon-monitor/shared";
import { closeBrowser, installCategoryResourceBlocker, launchAmazonBrowser, waitForNetworkIdleIfEnabled } from "./browser.js";
import {
  bestSellerExtraPages,
  bestSellerPageSize,
  categoryRetryCount,
  pageDelayMs,
  searchRetryDelayMs,
  timeoutMs
} from "./config.js";
import { collectMissingBestSellerDetails, type BestSellerDetailCacheValue } from "./detail-collector.js";
import { assertCategoryNotBlocked, saveCategoryCollectorScreenshot, waitForBestSellerCards } from "./page-guards.js";
import {
  createBestSellerContext,
  extractBestSellerCardsWithScroll,
  recoverMissingCriticalMetricsInFreshContext,
  type CollectedBestSellerPage
} from "./bestseller-collector-support.js";
import { isOptionalBestSellerPageEnd, isRetryableCategoryError } from "./retry.js";
import { buildBestSellerPageUrl } from "./urls.js";

export class PlaywrightAmazonBestSellerCollector {
  private readonly detailCache = new Map<string, BestSellerDetailCacheValue>();

  async collect(category: CategoryMonitor, date: string): Promise<CollectedBestSellerPage[]> {
    const browser = await launchAmazonBrowser();

    try {
      const context = await createBestSellerContext(browser, category.marketplace);

      const page = await context.newPage();
      await installCategoryResourceBlocker(page);
      const pages: CollectedBestSellerPage[] = [];
      const requiredPageCount = Math.max(1, Math.ceil(category.crawlTopN / bestSellerPageSize()));
      const maxPageCount = requiredPageCount + bestSellerExtraPages();
      const seenAsins = new Set<string>();
      let collected = 0;

      for (let pageNo = 1; pageNo <= maxPageCount && collected < category.crawlTopN; pageNo += 1) {
        const url = buildBestSellerPageUrl(category.categoryUrl, pageNo);
        let inRange: BestSellerProductInput[] = [];
        let newInRange: BestSellerProductInput[] = [];
        let loadedUrl = url;
        let reachedOptionalEnd = false;
        let retryCount = 0;

        for (let attempt = 1; attempt <= categoryRetryCount(); attempt += 1) {
          try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs() });
            await waitForNetworkIdleIfEnabled(page, timeoutMs());
            await assertCategoryNotBlocked(page, category, pageNo, date);
            await waitForBestSellerCards(page, category, pageNo, date);
            const expectedOnPage = Math.min(bestSellerPageSize(), category.crawlTopN - collected);
            const products = await extractBestSellerCardsWithScroll(page, category, pageNo, date, expectedOnPage);
            inRange = products.filter((product) => product.rank <= category.crawlTopN);
            newInRange = inRange.filter((product) => !seenAsins.has(product.asin));
            if (newInRange.length === 0) {
              if (pageNo > requiredPageCount && collected > 0) {
                reachedOptionalEnd = true;
                break;
              }
              const screenshot = await saveCategoryCollectorScreenshot(page, category, pageNo, date, "empty");
              throw new Error(`Amazon Best Sellers returned zero new product cards for "${category.name}" page ${pageNo}. Screenshot: ${screenshot}`);
            }
            if (newInRange.length < expectedOnPage && attempt < categoryRetryCount()) {
              throw new Error(
                `Amazon Best Sellers short page for "${category.name}" page ${pageNo}: expected ${expectedOnPage}, collected ${newInRange.length}.`
              );
            }
            loadedUrl = page.url();
            break;
          } catch (error) {
            if (isOptionalBestSellerPageEnd(error, pageNo, requiredPageCount, collected)) {
              reachedOptionalEnd = true;
              break;
            }
            if (attempt >= categoryRetryCount() || !isRetryableCategoryError(error)) {
              throw error;
            }
            retryCount += 1;
            await page.waitForTimeout(searchRetryDelayMs() * attempt);
            await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 5000 }).catch(() => undefined);
          }
        }

        if (reachedOptionalEnd) {
          break;
        }
        for (const product of newInRange) {
          seenAsins.add(product.asin);
        }
        collected += newInRange.length;
        pages.push({ pageNo, products: newInRange, url: loadedUrl, retryCount });

        if (pageNo < maxPageCount && collected < category.crawlTopN) {
          await page.waitForTimeout(pageDelayMs());
        }
      }

      for (const collectedPage of pages) {
        collectedPage.products = await collectMissingBestSellerDetails(context, category, collectedPage.products, collectedPage.pageNo, date, this.detailCache);
      }
      await recoverMissingCriticalMetricsInFreshContext(category, pages, date);

      return pages;
    } finally {
      await closeBrowser(browser);
    }
  }
}
