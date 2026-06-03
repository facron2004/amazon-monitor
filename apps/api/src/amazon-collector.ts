import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { BestSellerProductInput, CategoryMonitor, KeywordMonitor, ProductRanking, SerpProductInput } from "@amazon-monitor/shared";

export interface CollectedSearchPage {
  pageNo: number;
  products: SerpProductInput[];
  url: string;
}

export interface AmazonSearchCollector {
  collect(keyword: KeywordMonitor, date: string): Promise<CollectedSearchPage[]>;
}

type DetailRankCacheValue = Pick<SerpProductInput, "bsrRank" | "bsrCategory" | "bsrText" | "bestsellerRanks" | "detailCollectedAt">;

export const SEARCH_CARD_SELECTOR = [
  '[data-component-type="s-search-result"][data-asin]',
  '[data-testid="product-card"]',
  ".s-result-item[data-asin]",
  '[data-asin]:not([data-asin=""])'
].join(", ");

export class PlaywrightAmazonSearchCollector implements AmazonSearchCollector {
  private readonly detailRankCache = new Map<string, DetailRankCacheValue>();

  async collect(keyword: KeywordMonitor, date: string): Promise<CollectedSearchPage[]> {
    const browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
      args: ["--disable-blink-features=AutomationControlled"]
    });

    try {
      const context = await browser.newContext({
        locale: normalizeLocale(keyword.language),
        timezoneId: "Asia/Shanghai",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
        extraHTTPHeaders: {
          "Accept-Language": acceptLanguage(keyword.language)
        }
      });

      let page = await context.newPage();
      await installResourceBlocker(page);
      const pages: CollectedSearchPage[] = [];
      const pageCount = Math.max(1, keyword.crawlPages);
      let detailCount = 0;

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

        const detailRemaining = Math.max(0, maxDetailProducts() - detailCount);
        const detailResult = await collectPageProductDetailRanks(context, keyword, products, pageNo, date, detailRemaining, this.detailRankCache);
        detailCount += detailResult.collectedCount;

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

export class PlaywrightAmazonBestSellerCollector {
  async collect(category: CategoryMonitor, date: string): Promise<Array<{ pageNo: number; products: BestSellerProductInput[]; url: string; retryCount?: number }>> {
    const browser = await chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
      args: ["--disable-blink-features=AutomationControlled"]
    });

    try {
      const context = await browser.newContext({
        locale: "en-US",
        timezoneId: "Asia/Shanghai",
        viewport: {
          width: bestSellerViewportWidth(),
          height: bestSellerViewportHeight()
        },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
        extraHTTPHeaders: {
          "Accept-Language": "en-US,en;q=0.9"
        }
      });

      const page = await context.newPage();
      await installCategoryResourceBlocker(page);
      const pages: Array<{ pageNo: number; products: BestSellerProductInput[]; url: string; retryCount?: number }> = [];
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
          await page.waitForTimeout(Math.min(pageDelayMs(), 1500));
        }
      }

      return pages;
    } finally {
      await closeBrowser(browser);
    }
  }
}

export async function runLimitedConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) {
      return;
    }
    results[index] = await worker(items[index], index);
    await runNext();
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runNext()));
  return results;
}

export function buildSearchUrl(keyword: KeywordMonitor, pageNo: number): string {
  const host = normalizeMarketplaceHost(keyword.marketplace);
  const search = new URL(`https://${host}/s`);
  search.searchParams.set("k", keyword.keyword);
  search.searchParams.set("page", String(pageNo));
  if (includeLanguageQuery() && keyword.language) {
    search.searchParams.set("language", normalizeLocale(keyword.language));
  }
  return search.toString();
}

export function buildBestSellerPageUrl(categoryUrl: string, pageNo: number): string {
  const url = new URL(categoryUrl);
  if (pageNo > 1) {
    url.searchParams.set("pg", String(pageNo));
  } else {
    url.searchParams.delete("pg");
  }
  return url.toString();
}

async function extractBestSellerCardsWithScroll(
  page: Page,
  category: CategoryMonitor,
  pageNo: number,
  date: string,
  expectedOnPage: number
): Promise<BestSellerProductInput[]> {
  let products: BestSellerProductInput[] = [];
  let lastCount = -1;
  let stablePasses = 0;
  const minPasses = Math.min(bestSellerScrollPasses(), bestSellerMinScrollPasses());

  for (let pass = 0; pass <= bestSellerScrollPasses(); pass += 1) {
    products = await page.evaluate(extractBestSellerCards, {
      categoryName: category.name,
      categoryUrl: category.categoryUrl
    });
    const inRangeCount = products.filter((product) => product.rank <= category.crawlTopN).length;
    if (inRangeCount >= expectedOnPage) {
      return products;
    }

    stablePasses = inRangeCount === lastCount ? stablePasses + 1 : 0;
    lastCount = inRangeCount;
    if (pass >= bestSellerScrollPasses() || (pass >= minPasses && stablePasses >= bestSellerStablePasses())) {
      break;
    }

    await scrollBestSellerPage(page, pass);
    await page.waitForTimeout(bestSellerScrollDelayMs());
    await assertCategoryNotBlocked(page, category, pageNo, date);
  }

  return products;
}

async function scrollBestSellerPage(page: Page, pass: number): Promise<void> {
  await page.evaluate(({ pass: currentPass }) => {
    const selectors = [
      '[data-testid="product-card"]',
      ".zg-grid-general-faceout",
      ".p13n-sc-uncoverable-faceout",
      "#gridItemRoot",
      ".zg-item-immersion",
      '[data-asin]:not([data-asin=""])'
    ];
    const cards = Array.from(new Set(selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))));
    const targetIndex = Math.min(cards.length - 1, Math.max(0, currentPass * 8 + 7));
    cards[targetIndex]?.scrollIntoView({ block: "center", inline: "nearest" });
    window.scrollBy(0, Math.max(700, Math.floor(window.innerHeight * 0.9)));
    if (currentPass % 4 === 3) {
      window.scrollTo(0, document.body.scrollHeight);
    }
  }, { pass });
  await page.mouse.wheel(0, Math.max(700, Math.floor(bestSellerViewportHeight() * 0.8))).catch(() => undefined);
}

function extractBestSellerCards(input: { categoryName: string; categoryUrl: string }): BestSellerProductInput[] {
  // ── DOM helpers inlined here so Playwright's page.evaluate() serialization includes them ──
  const h = {
    textOf(root: ParentNode, selectors: string[]): string {
      for (const selector of selectors) {
        const value = root.querySelector<HTMLElement>(selector)?.innerText?.trim();
        if (value) return value;
      }
      return "";
    },
    firstHref(root: ParentNode, selectors: string[]): string {
      for (const selector of selectors) {
        const value = root.querySelector<HTMLAnchorElement>(selector)?.getAttribute("href")?.trim();
        if (value) return value;
      }
      return "";
    },
    findPromoLine(root: HTMLElement, patterns: RegExp[]): string | null {
      const lines = root.innerText.split("\n").map((l) => l.trim()).filter(Boolean);
      return lines.find((line) => line.length <= 90 && patterns.some((pattern) => pattern.test(line))) ?? null;
    },
    findRankLine(root: HTMLElement): string {
      return root.innerText.split("\n").map((l) => l.trim()).find((line) => /^#\s*\d+/.test(line)) ?? "";
    },
    extractAsin(value: string): string {
      const match = value.match(/(?:dp|gp\/product)\/([A-Z0-9]{10})/i) ?? value.match(/\b([A-Z0-9]{10})\b/i);
      return match?.[1]?.toUpperCase() ?? "";
    },
    absolutize(href: string): string {
      try { return new URL(href, window.location.origin).toString(); } catch { return href; }
    },
    parsePrice(value: string): number | null {
      const match = value.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]{1,2})?)/);
      return match ? Number(match[1]) : null;
    },
    inferCurrency(value: string): string {
      const match = value.trim().replace(/\s+/g, "").match(/[$£€¥]/);
      return match?.[0] ?? "$";
    },
    parseRating(value: string): number | null {
      const match = value.match(/([0-9]+(?:\.[0-9]+)?)/);
      return match ? Number(match[1]) : null;
    },
    parseInteger(value: string): number | null {
      const match = value.replace(/,/g, "").match(/([0-9]+)/);
      return match ? Number(match[1]) : null;
    },
    inferBrand(title: string): string | null {
      const firstWord = title.trim().split(/\s+/)[0];
      return firstWord || null;
    },
    uniqueElements(elements: HTMLElement[]): HTMLElement[] {
      return Array.from(new Set(elements));
    }
  };
  const selectors = [
    '[data-testid="product-card"]',
    ".zg-grid-general-faceout",
    ".p13n-sc-uncoverable-faceout",
    "#gridItemRoot",
    ".zg-item-immersion",
    '[data-asin]:not([data-asin=""])'
  ];
  const cards = h.uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector))));
  const products: BestSellerProductInput[] = [];
  const seen = new Set<string>();

  cards.forEach((card, index) => {
    const link = h.firstHref(card, ['a[href*="/dp/"]', 'a[href*="/gp/product/"]', "a.a-link-normal"]);
    const asin = h.extractAsin(`${card.getAttribute("data-asin") ?? ""} ${link}`);
    if (!asin || seen.has(asin)) {
      return;
    }
    seen.add(asin);

    const rankText = h.textOf(card, [".zg-bdg-text", '[class*="zg-bdg-text"]', ".zg-badge-text"]) || h.findRankLine(card);
    const rank = h.parseInteger(rankText) ?? index + 1;
    const image = card.querySelector<HTMLImageElement>("img");
    const title =
      h.textOf(card, [
        "._cDEzb_p13n-sc-css-line-clamp-4_2q2cc",
        "._cDEzb_p13n-sc-css-line-clamp-3_g3dy1",
        ".p13n-sc-truncate",
        "a span.a-size-base",
        "a span",
        "span.a-size-small"
      ]) ||
      image?.alt?.trim() ||
      asin;
    const priceText = h.textOf(card, [".a-price .a-offscreen", "._cDEzb_p13n-sc-price_3mJ9Z"]);
    const originalPriceText = h.textOf(card, [".a-price.a-text-price .a-offscreen", ".a-text-price .a-offscreen"]);
    const couponText = h.findPromoLine(card, [/\bcoupon\b/i]);
    const dealBadge = h.findPromoLine(card, [/\blimited\s+time\s+deal\b/i, /\bprime\s+exclusive\s+deal\b/i, /\bdeal\s+of\s+the\s+day\b/i, /\bdeal\b/i]);
    const ratingText = h.textOf(card, ["i.a-icon-star-small span.a-icon-alt", "i.a-icon-star span.a-icon-alt", '[aria-label*="out of 5 stars"]']);
    const reviewText = h.textOf(card, ['a[href*="customerReviews"] span', 'span[aria-label*="ratings"]', 'span[aria-label*="rating"]']);

    products.push({
      rank,
      asin,
      title,
      brand: h.inferBrand(title),
      imageUrl: image?.src ?? "",
      productUrl: link ? h.absolutize(link) : `${window.location.origin}/dp/${asin}`,
      currentPrice: h.parsePrice(priceText),
      originalPrice: h.parsePrice(originalPriceText),
      couponText,
      currency: h.inferCurrency(priceText),
      rating: h.parseRating(ratingText),
      reviewCount: h.parseInteger(reviewText),
      isPrime: Boolean(card.querySelector('[aria-label*="Prime"], .s-prime, i.a-icon-prime')),
      dealBadge,
      bsrRank: rank,
      bsrCategory: input.categoryName
    });
  });

  return products.sort((a, b) => a.rank - b.rank);
}

function extractSearchCards(): SerpProductInput[] {
  // ── DOM helpers inlined here so Playwright's page.evaluate() serialization includes them ──
  const h = {
    textOf(root: ParentNode, selectors: string[]): string {
      for (const selector of selectors) {
        const value = root.querySelector<HTMLElement>(selector)?.innerText?.trim();
        if (value) return value;
      }
      return "";
    },
    firstHref(root: ParentNode, selectors: string[]): string {
      for (const selector of selectors) {
        const value = root.querySelector<HTMLAnchorElement>(selector)?.getAttribute("href")?.trim();
        if (value) return value;
      }
      return "";
    },
    findPromoLine(root: HTMLElement, patterns: RegExp[]): string | null {
      const lines = root.innerText.split("\n").map((l) => l.trim()).filter(Boolean);
      return lines.find((line) => line.length <= 90 && patterns.some((pattern) => pattern.test(line))) ?? null;
    },
    findRankLine(root: HTMLElement): string {
      return root.innerText.split("\n").map((l) => l.trim()).find((line) => /^#\s*\d+/.test(line)) ?? "";
    },
    extractAsin(value: string): string {
      const match = value.match(/(?:dp|gp\/product)\/([A-Z0-9]{10})/i) ?? value.match(/\b([A-Z0-9]{10})\b/i);
      return match?.[1]?.toUpperCase() ?? "";
    },
    absolutize(href: string): string {
      try { return new URL(href, window.location.origin).toString(); } catch { return href; }
    },
    parsePrice(value: string): number | null {
      const match = value.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]{1,2})?)/);
      return match ? Number(match[1]) : null;
    },
    inferCurrency(value: string): string {
      const match = value.trim().replace(/\s+/g, "").match(/[$£€¥]/);
      return match?.[0] ?? "$";
    },
    parseRating(value: string): number | null {
      const match = value.match(/([0-9]+(?:\.[0-9]+)?)/);
      return match ? Number(match[1]) : null;
    },
    parseInteger(value: string): number | null {
      const match = value.replace(/,/g, "").match(/([0-9]+)/);
      return match ? Number(match[1]) : null;
    },
    inferBrand(title: string): string | null {
      const firstWord = title.trim().split(/\s+/)[0];
      return firstWord || null;
    },
    uniqueElements(elements: HTMLElement[]): HTMLElement[] {
      return Array.from(new Set(elements));
    }
  };
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-component-type="s-search-result"][data-asin]'));
  return cards
    .map<SerpProductInput | null>((card) => {
      const asin = card.getAttribute("data-asin")?.trim() ?? "";
      if (!asin) {
        return null;
      }

      const title = h.textOf(card, [
        '[data-cy="title-recipe"] h2 span',
        "h2 a span",
        "h2 span",
        ".a-size-medium.a-color-base.a-text-normal",
        ".a-size-base-plus.a-color-base.a-text-normal"
      ]);
      const link = h.firstHref(card, ['a[href*="/dp/"]', "h2 a", "a.a-link-normal.s-no-outline"]);
      const priceText = h.textOf(card, [".a-price .a-offscreen"]);
      const originalPriceText = h.textOf(card, [".a-price.a-text-price .a-offscreen", ".a-text-price .a-offscreen"]);
      const couponText = h.findPromoLine(card, [/\bcoupon\b/i]);
      const dealBadge = h.findPromoLine(card, [/\blimited\s+time\s+deal\b/i, /\bprime\s+exclusive\s+deal\b/i, /\bdeal\s+of\s+the\s+day\b/i, /\bdeal\b/i]);
      const ratingText = h.textOf(card, ["i.a-icon-star-small span.a-icon-alt", "i.a-icon-star span.a-icon-alt", '[aria-label*="out of 5 stars"]']);
      const reviewText = h.textOf(card, ['a[href*="customerReviews"] span', 'span[aria-label*="ratings"]', 'span[aria-label*="rating"]']);
      const imageUrl = card.querySelector<HTMLImageElement>("img.s-image")?.src ?? "";
      const isSponsored = /Sponsored/i.test(card.innerText) || Boolean(card.querySelector('[aria-label="Sponsored"]'));

      return {
        asin,
        title: title || asin,
        brand: h.inferBrand(title),
        imageUrl,
        productUrl: link ? h.absolutize(link) : `https://www.amazon.com/dp/${asin}`,
        currentPrice: h.parsePrice(priceText),
        originalPrice: h.parsePrice(originalPriceText),
        couponText,
        currency: h.inferCurrency(priceText),
        rating: h.parseRating(ratingText),
        reviewCount: h.parseInteger(reviewText),
        isSponsored,
        isPrime: Boolean(card.querySelector('[aria-label*="Prime"], .s-prime, i.a-icon-prime')),
        dealBadge,
        deliveryText: h.textOf(card, ['[data-cy="delivery-recipe"]', '[data-cy="delivery-block"]', ".a-color-base.a-text-bold"])
      };
    })
    .filter((item): item is SerpProductInput => item !== null);
}

async function collectPageProductDetailRanks(
  context: BrowserContext,
  keyword: KeywordMonitor,
  products: SerpProductInput[],
  pageNo: number,
  date: string,
  detailLimit: number,
  detailRankCache: Map<string, DetailRankCacheValue>
): Promise<{ products: SerpProductInput[]; collectedCount: number }> {
  const cacheKeyFor = (product: SerpProductInput) => detailCacheKey(date, keyword.marketplace, product.asin);
  const detailsToCollect = products.filter((product) => !detailRankCache.has(cacheKeyFor(product))).slice(0, Math.max(0, detailLimit));
  if (detailsToCollect.length === 0) {
    return {
      products: products.map((product) => applyCachedDetailRanks(product, detailRankCache.get(cacheKeyFor(product)))),
      collectedCount: 0
    };
  }

  const enriched = await runLimitedConcurrency(detailsToCollect, detailConcurrency(), async (product) => {
    try {
      return await collectProductDetailRanks(context, keyword, product, pageNo, date);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Amazon blocked collection")) {
        throw error;
      }
      return product;
    }
  });

  const enrichedByAsin = new Map(enriched.map((product) => [product.asin, product]));
  for (const product of enriched) {
    if (product.detailCollectedAt) {
      rememberDetailRanks(detailRankCache, detailCacheKey(date, keyword.marketplace, product.asin), product);
    }
  }

  return {
    products: products.map((product) => enrichedByAsin.get(product.asin) ?? applyCachedDetailRanks(product, detailRankCache.get(cacheKeyFor(product)))),
    collectedCount: enriched.filter((product) => Boolean(product.detailCollectedAt)).length
  };
}

function applyCachedDetailRanks(product: SerpProductInput, cached: DetailRankCacheValue | undefined): SerpProductInput {
  return cached
    ? {
        ...product,
        bsrRank: cached.bsrRank,
        bsrCategory: cached.bsrCategory,
        bsrText: cached.bsrText,
        bestsellerRanks: cached.bestsellerRanks,
        detailCollectedAt: cached.detailCollectedAt
      }
    : product;
}

function rememberDetailRanks(cache: Map<string, DetailRankCacheValue>, key: string, product: SerpProductInput): void {
  const maxItems = detailCacheMaxItems();
  if (maxItems <= 0) {
    return;
  }
  if (cache.size >= maxItems && !cache.has(key)) {
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      cache.delete(firstKey);
    }
  }
  cache.set(key, {
    bsrRank: product.bsrRank ?? null,
    bsrCategory: product.bsrCategory ?? null,
    bsrText: product.bsrText ?? null,
    bestsellerRanks: product.bestsellerRanks ?? [],
    detailCollectedAt: product.detailCollectedAt ?? null
  });
}

function detailCacheKey(date: string, marketplace: string, asin: string): string {
  return `${date}|${normalizeMarketplaceHost(marketplace)}|${asin}`;
}

async function collectProductDetailRanks(
  context: BrowserContext,
  keyword: KeywordMonitor,
  product: SerpProductInput,
  pageNo: number,
  date: string
): Promise<SerpProductInput> {
  const page = await context.newPage();
  try {
    await installResourceBlocker(page);
    await page.goto(product.productUrl, { waitUntil: "domcontentloaded", timeout: detailTimeoutMs() });
    await page.waitForSelector("body", { timeout: detailTimeoutMs() });
    await page.waitForTimeout(detailSettleMs());
    await assertNotBlocked(page, keyword, pageNo, date);
    const detail = await page.evaluate(extractProductDetailRanks);
    return {
      ...product,
      bsrRank: detail.bsrRank,
      bsrCategory: detail.bsrCategory,
      bsrText: detail.bsrText,
      bestsellerRanks: detail.bestsellerRanks,
      detailCollectedAt: new Date().toISOString()
    };
  } finally {
    await page.close().catch(() => undefined);
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

function extractProductDetailRanks(): {
  bsrRank: number | null;
  bsrCategory: string | null;
  bsrText: string | null;
  bestsellerRanks: ProductRanking[];
} {
  const salesRankElement =
    document.querySelector<HTMLElement>("#SalesRank") ??
    Array.from(document.querySelectorAll<HTMLElement>("li, tr, div")).find((element) =>
      /Best Sellers Rank/i.test(element.innerText ?? "")
    ) ??
    null;
  const bodyText = document.body?.innerText ?? "";
  const sourceText = salesRankElement?.innerText || snippetAfter(bodyText, "Best Sellers Rank", 1000);
  const rankText = cleanRankText(sourceText);
  const rankRegex = /#\s*([\d,]+)\s+in\s+([^\n(#]+)(?:\s*\([^)]*\))?/gi;
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/gp/bestsellers/"]')).map((link) => ({
    text: link.innerText.trim(),
    url: absolutize(link.getAttribute("href") ?? "")
  }));
  const ranks: ProductRanking[] = [];
  let match: RegExpExecArray | null;

  while ((match = rankRegex.exec(rankText)) !== null) {
    const category = cleanCategory(match[2]);
    const rank = Number(match[1].replace(/,/g, ""));
    if (!category || Number.isNaN(rank)) {
      continue;
    }
    ranks.push({
      rank,
      category,
      url: links.find((link) => link.text.includes(category) || category.includes(link.text))?.url ?? null
    });
  }

  const primary = ranks.at(-1) ?? ranks[0] ?? null;
  return {
    bsrRank: primary?.rank ?? null,
    bsrCategory: primary?.category ?? null,
    bsrText: rankText || null,
    bestsellerRanks: ranks
  };

  function cleanRankText(text: string): string {
    const compact = text.replace(/\s+/g, " ").trim();
    const start = compact.search(/Best Sellers Rank/i);
    const sliced = start >= 0 ? compact.slice(start) : compact;
    const endMarkers = [" ASIN ", " Customer Reviews ", " Date First Available ", " Product Dimensions "];
    const endIndex = endMarkers
      .map((marker) => sliced.indexOf(marker))
      .filter((index) => index > 0)
      .sort((a, b) => a - b)[0];
    return (endIndex ? sliced.slice(0, endIndex) : sliced).trim();
  }

  function cleanCategory(value: string): string {
    return value
      .replace(/\s+/g, " ")
      .replace(/\s+ASIN\b.*$/i, "")
      .replace(/\s+Customer Reviews\b.*$/i, "")
      .replace(/\s+Date First Available\b.*$/i, "")
      .trim();
  }

  function snippetAfter(text: string, needle: string, length: number): string {
    const index = text.toLowerCase().indexOf(needle.toLowerCase());
    return index >= 0 ? text.slice(index, index + length) : "";
  }

  function absolutize(href: string): string | null {
    if (!href) {
      return null;
    }
    try {
      return new URL(href, window.location.origin).toString();
    } catch {
      return href;
    }
  }
}

async function assertNotBlocked(page: Page, keyword: KeywordMonitor, pageNo: number, date: string): Promise<void> {
  await checkPageBlocked(page, `"${keyword.keyword}" page ${pageNo}`, () => saveCollectorScreenshot(page, keyword, pageNo, date, "blocked"), () => saveCollectorScreenshot(page, keyword, pageNo, date, "amazon-error"), "Search");
}

async function assertCategoryNotBlocked(page: Page, category: CategoryMonitor, pageNo: number, date: string): Promise<void> {
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
    /automated access/i.test(bodyText);

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
}

async function waitForBestSellerCards(page: Page, category: CategoryMonitor, pageNo: number, date: string): Promise<void> {
  await page
    .waitForSelector('[data-testid="product-card"], .zg-grid-general-faceout, .p13n-sc-uncoverable-faceout, #gridItemRoot, [data-asin]', {
      timeout: timeoutMs()
    })
    .catch(async (error) => {
      const screenshot = await saveCategoryCollectorScreenshot(page, category, pageNo, date, "no-bestseller-cards");
      throw new Error(`${error instanceof Error ? error.message : String(error)} Screenshot: ${screenshot}`);
    });
}

async function saveCollectorScreenshot(
  page: Page,
  keyword: KeywordMonitor,
  pageNo: number,
  date: string,
  reason: string
): Promise<string> {
  const safeKeyword = safeFilename(keyword.keyword);
  return await captureScreenshot(page, `${date}-${safeKeyword}-p${pageNo}-${reason}.png`);
}

async function saveCategoryCollectorScreenshot(
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

async function closeBrowser(browser: Browser): Promise<void> {
  await browser.close().catch(() => undefined);
}

async function installResourceBlocker(page: Page): Promise<void> {
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

async function installCategoryResourceBlocker(page: Page): Promise<void> {
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

async function waitForNetworkIdleIfEnabled(page: Page, timeout: number): Promise<void> {
  if (!waitForNetworkIdle()) {
    return;
  }
  await page.waitForLoadState("networkidle", { timeout }).catch(() => undefined);
}

function normalizeMarketplaceHost(marketplace: string): string {
  const trimmed = marketplace.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const map: Record<string, string> = {
    US: "www.amazon.com",
    UK: "www.amazon.co.uk",
    DE: "www.amazon.de",
    JP: "www.amazon.co.jp"
  };
  return map[trimmed.toUpperCase()] ?? (trimmed.startsWith("amazon.") ? `www.${trimmed}` : trimmed);
}

function normalizeLocale(language: string | null): string {
  return (language || "en_US").replace("_", "-");
}

function acceptLanguage(language: string | null): string {
  const locale = normalizeLocale(language);
  return `${locale},en;q=0.9`;
}

function timeoutMs(): number {
  return Number(process.env.AMAZON_COLLECT_TIMEOUT_MS ?? 30000);
}

function searchRetryCount(): number {
  return Number(process.env.AMAZON_COLLECT_SEARCH_RETRIES ?? 3);
}

function searchRetryDelayMs(): number {
  return Number(process.env.AMAZON_COLLECT_SEARCH_RETRY_DELAY_MS ?? 2500);
}

function categoryRetryCount(): number {
  return Number(process.env.AMAZON_COLLECT_CATEGORY_RETRIES ?? 2);
}

function detailTimeoutMs(): number {
  return Number(process.env.AMAZON_COLLECT_DETAIL_TIMEOUT_MS ?? 15000);
}

function pageDelayMs(): number {
  return Number(process.env.AMAZON_COLLECT_PAGE_DELAY_MS ?? 5000);
}

function detailSettleMs(): number {
  return Number(process.env.AMAZON_COLLECT_DETAIL_SETTLE_MS ?? 300);
}

function bestSellerPageSize(): number {
  return Number(process.env.AMAZON_BESTSELLER_PAGE_SIZE ?? 50);
}

function bestSellerExtraPages(): number {
  return Number(process.env.AMAZON_BESTSELLER_EXTRA_PAGES ?? 2);
}

function bestSellerScrollPasses(): number {
  return Number(process.env.AMAZON_BESTSELLER_SCROLL_PASSES ?? 12);
}

function bestSellerMinScrollPasses(): number {
  return Number(process.env.AMAZON_BESTSELLER_MIN_SCROLL_PASSES ?? 6);
}

function bestSellerStablePasses(): number {
  return Number(process.env.AMAZON_BESTSELLER_STABLE_PASSES ?? 4);
}

function bestSellerScrollDelayMs(): number {
  return Number(process.env.AMAZON_BESTSELLER_SCROLL_DELAY_MS ?? 700);
}

function bestSellerViewportWidth(): number {
  return Number(process.env.AMAZON_BESTSELLER_VIEWPORT_WIDTH ?? 1920);
}

function bestSellerViewportHeight(): number {
  return Number(process.env.AMAZON_BESTSELLER_VIEWPORT_HEIGHT ?? 1080);
}

function detailConcurrency(): number {
  return Number(process.env.AMAZON_COLLECT_DETAIL_CONCURRENCY ?? 3);
}

function maxDetailProducts(): number {
  return Number(process.env.AMAZON_COLLECT_MAX_DETAIL_PRODUCTS ?? 9999);
}

function detailCacheMaxItems(): number {
  return Number(process.env.AMAZON_COLLECT_DETAIL_CACHE_ITEMS ?? 5000);
}

function blockHeavyResources(): boolean {
  return process.env.AMAZON_COLLECT_BLOCK_RESOURCES !== "false";
}

function blockCategoryResources(): boolean {
  return process.env.AMAZON_COLLECT_CATEGORY_BLOCK_RESOURCES !== "false";
}

function blockCategoryImages(): boolean {
  return process.env.AMAZON_COLLECT_CATEGORY_BLOCK_IMAGES === "true";
}

function waitForNetworkIdle(): boolean {
  return process.env.AMAZON_COLLECT_WAIT_NETWORK_IDLE === "true";
}

function includeLanguageQuery(): boolean {
  return process.env.AMAZON_COLLECT_INCLUDE_LANGUAGE_PARAM === "true";
}

function isRetryableSearchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    isRetryableAmazonNetworkError(message) ||
    /temporary error page/i.test(message) ||
    /Something went wrong/i.test(message) ||
    /no-search-cards/i.test(message) ||
    /Timeout .*s-search-result/i.test(message) ||
    /zero product cards/i.test(message)
  );
}

function isRetryableCategoryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    isRetryableAmazonNetworkError(message) ||
    /temporary error page/i.test(message) ||
    /Something went wrong/i.test(message) ||
    /no-bestseller-cards/i.test(message) ||
    /Best Sellers short page/i.test(message) ||
    /Best Sellers returned zero product cards/i.test(message) ||
    /Timeout .*product-card/i.test(message) ||
    /Timeout .*gridItemRoot/i.test(message)
  );
}

export function isRetryableAmazonNetworkError(message: string): boolean {
  return (
    /net::ERR_CONNECTION_(?:CLOSED|RESET|ABORTED|TIMED_OUT)/i.test(message) ||
    /net::ERR_(?:TIMED_OUT|INTERNET_DISCONNECTED|PROXY_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED)/i.test(message) ||
    /Client network socket disconnected/i.test(message) ||
    /socket hang up/i.test(message) ||
    /ECONNRESET|ETIMEDOUT/i.test(message)
  );
}
