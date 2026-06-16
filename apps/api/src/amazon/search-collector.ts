import type { Page } from "playwright";
import type { KeywordMonitor, SerpProductInput } from "@amazon-monitor/shared";
import { closeBrowser, installResourceBlocker, launchAmazonBrowser, waitForNetworkIdleIfEnabled } from "./browser.js";
import { acceptLanguage, normalizeLocale, normalizeMarketplaceHost, pageDelayMs, searchRetryCount, searchRetryDelayMs, timeoutMs } from "./config.js";
import { createAmazonContext } from "./context.js";
import { collectPageProductDetailRanks, type DetailRankCacheValue } from "./detail-collector.js";
import { assertNotBlocked, saveCollectorScreenshot } from "./page-guards.js";
import { SEARCH_CARD_SELECTOR, extractSearchCards } from "./parsers/search-card-parser.js";
import { isRetryableSearchError } from "./retry.js";
import type { AmazonSearchCollector, CollectedSearchPage } from "./types.js";
import { buildSearchUrl } from "./urls.js";

export class PlaywrightAmazonSearchCollector implements AmazonSearchCollector {
  private readonly detailRankCache = new Map<string, DetailRankCacheValue>();

  async collect(keyword: KeywordMonitor, date: string): Promise<CollectedSearchPage[]> {
    const browser = await launchAmazonBrowser();

    try {
      const context = await createAmazonContext(browser, {
        locale: normalizeLocale(keyword.language),
        acceptLanguage: acceptLanguage(keyword.language),
        marketplace: keyword.marketplace,
        zipCode: keyword.zipCode
      });

      let page = await context.newPage();
      await installResourceBlocker(page);
      const pages: CollectedSearchPage[] = [];
      const pageCount = Math.max(1, keyword.crawlPages);
      for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
        const url = buildSearchUrl(keyword, pageNo);
        let products: SerpProductInput[] = [];
        let loadedUrl = url;
        for (let attempt = 1; attempt <= searchRetryCount(); attempt += 1) {
          try {
            if (attempt > 1) {
              await loadSearchViaHomePage(page, keyword, pageNo, url);
            } else {
              await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs() });
            }
            await waitForNetworkIdleIfEnabled(page, timeoutMs());
            await assertNotBlocked(page, keyword, pageNo, date);
            await page.waitForSelector(SEARCH_CARD_SELECTOR, { timeout: timeoutMs() }).catch(async (error) => {
              const screenshot = await saveCollectorScreenshot(page, keyword, pageNo, date, "no-search-cards");
              throw new Error(`${error instanceof Error ? error.message : String(error)} Screenshot: ${screenshot}`);
            });
            products = await page.evaluate(extractSearchCards);

            if (products.length === 0) {
              await saveCollectorScreenshot(page, keyword, pageNo, date, "empty");
              throw new Error(`Amazon search returned zero product cards for "${keyword.keyword}" page ${pageNo}.`);
            }
            loadedUrl = page.url();
            break;
          } catch (error) {
            if (attempt >= searchRetryCount() || !isRetryableSearchError(error)) {
              throw error;
            }
            await page.close().catch(() => undefined);
            await new Promise((resolve) => setTimeout(resolve, searchRetryDelayMs() * attempt));
            page = await context.newPage();
            await installResourceBlocker(page);
          }
        }

        const detailResult = await collectPageProductDetailRanks(context, keyword, products, pageNo, date, products.length, this.detailRankCache);

        pages.push({ pageNo, products: detailResult.products, url: loadedUrl });

        if (pageNo < pageCount) {
          await page.waitForTimeout(pageDelayMs());
        }
      }

      return pages;
    } finally {
      await closeBrowser(browser);
    }
  }
}

async function loadSearchViaHomePage(page: Page, keyword: KeywordMonitor, pageNo: number, targetUrl: string): Promise<void> {
  const host = normalizeMarketplaceHost(keyword.marketplace);
  await page.goto(`https://${host}/`, { waitUntil: "domcontentloaded", timeout: timeoutMs() });
  await page.waitForSelector("#twotabsearchtextbox", { timeout: timeoutMs() });
  await page.fill("#twotabsearchtextbox", keyword.keyword);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: timeoutMs() }).catch(() => undefined),
    page.click("#nav-search-submit-button")
  ]);

  if (pageNo > 1) {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs() });
  }
}
