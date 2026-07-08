import type { Browser, BrowserContext, Page } from "playwright";
import type { BestSellerProductInput, CategoryMonitor } from "@amazon-monitor/shared";
import { abortableWait, type AbortableCollectOptions, throwIfAborted } from "./abort.js";
import { closeBrowser, launchAmazonBrowser } from "./browser.js";
import {
  bestSellerMinScrollPasses,
  bestSellerScrollDelayMs,
  bestSellerScrollPasses,
  bestSellerStablePasses,
  bestSellerViewportHeight,
  bestSellerViewportWidth,
  detailConcurrency
} from "./config.js";
import { runLimitedConcurrency } from "./concurrency.js";
import { createAmazonContext } from "./context.js";
import { collectMissingBestSellerDetails } from "./detail-collector.js";
import { assertCategoryNotBlocked } from "./page-guards.js";
import { extractBestSellerCards } from "./parsers/bestseller-card-parser.js";

export interface CollectedBestSellerPage {
  pageNo: number;
  products: BestSellerProductInput[];
  url: string;
  retryCount?: number;
}

export async function extractBestSellerCardsWithScroll(
  page: Page,
  category: CategoryMonitor,
  pageNo: number,
  date: string,
  expectedOnPage: number,
  options: AbortableCollectOptions = {}
): Promise<BestSellerProductInput[]> {
  let products: BestSellerProductInput[] = [];
  let lastCount = -1;
  let stablePasses = 0;
  const minPasses = Math.min(bestSellerScrollPasses(), bestSellerMinScrollPasses());

  for (let pass = 0; pass <= bestSellerScrollPasses(); pass += 1) {
    throwIfAborted(options.signal);
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
    await abortableWait(page.waitForTimeout(bestSellerScrollDelayMs()), options.signal);
    await assertCategoryNotBlocked(page, category, pageNo, date);
  }

  return products;
}

export async function createBestSellerContext(browser: Browser, marketplace: string): Promise<BrowserContext> {
  return createAmazonContext(browser, {
    locale: "en-US",
    acceptLanguage: "en-US,en;q=0.9",
    marketplace,
    viewport: {
      width: bestSellerViewportWidth(),
      height: bestSellerViewportHeight()
    }
  });
}

export async function recoverMissingCriticalMetricsInFreshContext(
  category: CategoryMonitor,
  pages: Array<Pick<CollectedBestSellerPage, "pageNo" | "products">>,
  date: string,
  sharedBrowser?: Browser,
  options: AbortableCollectOptions = {}
): Promise<void> {
  throwIfAborted(options.signal);
  const pending = pages.flatMap((page) =>
    page.products
      .filter((product) => shouldRecoverCriticalMetrics(product))
      .map((product) => ({ pageNo: page.pageNo, product }))
  );
  if (pending.length === 0) {
    return;
  }

  // Reuse the caller's browser when available — a fresh *context* on the same
  // browser still rotates cookies/fingerprint (the actual anti-detection win),
  // while avoiding the cost of a second browser launch.
  const browser = sharedBrowser ?? (await launchAmazonBrowser());
  const ownsBrowser = sharedBrowser === undefined;
  try {
    const context = await createBestSellerContext(browser, category.marketplace);
    const recoveredResults = await runLimitedConcurrency(pending, detailConcurrency(), async (entry) => {
      throwIfAborted(options.signal);
      const [recovered] = await collectMissingBestSellerDetails(context, category, [entry.product], entry.pageNo, date, new Map(), options);
      return recovered;
    });

    const recoveredByAsin = new Map<string, BestSellerProductInput>();
    for (const recovered of recoveredResults) {
      recoveredByAsin.set(recovered.asin, recovered);
    }

    for (const page of pages) {
      page.products = page.products.map((product) => recoveredByAsin.get(product.asin) ?? product);
    }
  } finally {
    if (ownsBrowser) {
      await closeBrowser(browser);
    }
  }
}

export function shouldRecoverCriticalMetrics(product: BestSellerProductInput): boolean {
  return Boolean(product.productUrl) && (product.rating === null || product.reviewCount === null);
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
