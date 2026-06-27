import type { BrowserContext } from "playwright";
import type { BestSellerProductInput, CategoryMonitor, KeywordMonitor, SerpProductInput } from "@amazon-monitor/shared";
import { installResourceBlocker } from "./browser.js";
import { bestSellerDetailTopN, detailConcurrency, maxDetailProducts } from "./config.js";
import { runLimitedConcurrency } from "./concurrency.js";
import { assertCategoryNotBlocked, assertNotBlocked } from "./page-guards.js";
import {
  applyCachedBestSellerDetails,
  applyCachedDetailRanks,
  detailCacheKey,
  pickBestSellerDetail,
  prioritizeDetailCollection,
  rememberDetailRanks,
  shouldCollectBestSellerDetails,
  type BestSellerDetailCacheValue,
  type DetailRankCacheValue
} from "./detail-collector-cache.js";
import {
  openDetailPage,
  preferCurrentPrice,
  readDetailWithRetry,
  recoverMissingCriticalMetrics,
  resolveBrandFromStorePage,
  resolveOriginalPrice
} from "./detail-collector-page.js";

export type { BestSellerDetailCacheValue, DetailRankCacheValue } from "./detail-collector-cache.js";

export async function collectMissingBestSellerDetails(
  context: BrowserContext,
  category: CategoryMonitor,
  products: BestSellerProductInput[],
  pageNo: number,
  date: string,
  detailCache: Map<string, BestSellerDetailCacheValue>
): Promise<BestSellerProductInput[]> {
  const cacheKeyFor = (product: BestSellerProductInput) => detailCacheKey(date, category.marketplace, product.asin);
  const withCachedDetails = products.map((product) => applyCachedBestSellerDetails(product, detailCache.get(cacheKeyFor(product))));
  // Cap how many detail pages we open per best-seller task. `crawlTopN=100`
  // used to launch 100 detail pages serially through `detailConcurrency=3`,
  // which dominated total runtime for large categories. We still visit the
  // top N (env-tunable) — products past the cap keep whatever data the
  // best-seller card already exposed (rank/title/price).
  const detailCap = Math.max(1, Math.min(bestSellerDetailTopN(), maxDetailProducts()));
  const candidates = withCachedDetails.filter((product) => shouldCollectBestSellerDetails(product) && !detailCache.has(cacheKeyFor(product)));
  const missing = prioritizeDetailCollection(candidates).slice(0, detailCap);
  if (missing.length === 0) {
    return withCachedDetails;
  }

  const enriched = await runLimitedConcurrency(missing, detailConcurrency(), async (product) => {
    try {
      const enrichedProduct = await collectBestSellerProductDetails(context, category, product, pageNo, date);
      detailCache.set(cacheKeyFor(product), pickBestSellerDetail(enrichedProduct));
      return enrichedProduct;
    } catch {
      return product;
    }
  });
  const enrichedByAsin = new Map(enriched.map((product) => [product.asin, product]));
  return withCachedDetails.map((product) => enrichedByAsin.get(product.asin) ?? product);
}

async function collectBestSellerProductDetails(
  context: BrowserContext,
  category: CategoryMonitor,
  product: BestSellerProductInput,
  pageNo: number,
  date: string
): Promise<BestSellerProductInput> {
  const page = await context.newPage();
  try {
    await installResourceBlocker(page);
    await openDetailPage(page, product.productUrl);
    await assertCategoryNotBlocked(page, category, pageNo, date);
    const detail = await recoverMissingCriticalMetrics(page, await readDetailWithRetry(page), {
      marketplace: category.marketplace,
      productUrl: product.productUrl,
      assertPageReady: () => assertCategoryNotBlocked(page, category, pageNo, date)
    });
    const detailTitle = detail.title ?? product.title;
    const brand = await resolveBrandFromStorePage(page, detail.storeUrl, detail.brand ?? product.brand, detailTitle);
    const currentPrice = preferCurrentPrice(product.currentPrice, detail.currentPrice);
    return {
      ...product,
      title: detailTitle,
      brand,
      couponText: detail.couponText,
      dealBadge: detail.dealBadge,
      rating: detail.rating ?? product.rating,
      currentPrice,
      originalPrice: resolveOriginalPrice(product.originalPrice, detail.originalPrice, currentPrice),
      currency: product.currentPrice === null && detail.currency ? detail.currency : product.currency,
      reviewCount: detail.reviewCount ?? product.reviewCount,
      iceType: detail.iceType ?? product.iceType ?? null
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function collectPageProductDetailRanks(
  context: BrowserContext,
  keyword: KeywordMonitor,
  products: SerpProductInput[],
  pageNo: number,
  date: string,
  detailLimit: number,
  detailRankCache: Map<string, DetailRankCacheValue>
): Promise<{ products: SerpProductInput[]; collectedCount: number }> {
  const cacheKeyFor = (product: SerpProductInput) => detailCacheKey(date, keyword.marketplace, product.asin);
  const detailsToCollect = prioritizeDetailCollection(
    products.filter((product) => !detailRankCache.has(cacheKeyFor(product)))
  ).slice(0, Math.max(0, detailLimit));
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
    await openDetailPage(page, product.productUrl);
    await assertNotBlocked(page, keyword, pageNo, date);
    const detail = await recoverMissingCriticalMetrics(page, await readDetailWithRetry(page), {
      marketplace: keyword.marketplace,
      zipCode: keyword.zipCode,
      productUrl: product.productUrl,
      assertPageReady: () => assertNotBlocked(page, keyword, pageNo, date)
    });
    const detailTitle = detail.title ?? product.title;
    const brand = await resolveBrandFromStorePage(page, detail.storeUrl, detail.brand ?? product.brand, detailTitle);
    const currentPrice = preferCurrentPrice(product.currentPrice, detail.currentPrice);
    return {
      ...product,
      title: detailTitle,
      brand,
      couponText: detail.couponText,
      dealBadge: detail.dealBadge,
      rating: detail.rating ?? product.rating,
      reviewCount: detail.reviewCount ?? product.reviewCount,
      iceType: detail.iceType ?? product.iceType ?? null,
      currentPrice,
      originalPrice: resolveOriginalPrice(product.originalPrice, detail.originalPrice, currentPrice),
      currency: product.currentPrice === null && detail.currency ? detail.currency : product.currency,
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
