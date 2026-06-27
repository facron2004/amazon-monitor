import type { Page } from "playwright";
import { setDeliveryZipCode, waitForNetworkIdleIfEnabled } from "./browser.js";
import { detailSettleMs, detailTimeoutMs } from "./config.js";
import { hasWeakBrandValue } from "./brand-quality.js";
import { extractProductDetailRanks } from "./parsers/product-detail-parser.js";
import { extractStorePageBrand } from "./parsers/store-brand-parser.js";

export type DetailPayload = ReturnType<typeof extractProductDetailRanks>;

export async function readDetailWithRetry(page: Page): Promise<DetailPayload> {
  const detail = await page.evaluate(extractProductDetailRanks);
  if (detail.rating !== null && detail.reviewCount !== null) {
    return detail;
  }

  await waitForLateMetricSignals(page);
  return mergeDetailPayload(detail, await page.evaluate(extractProductDetailRanks));
}

export async function openDetailPage(page: Page, productUrl: string): Promise<void> {
  await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: detailTimeoutMs() });
  await waitForNetworkIdleIfEnabled(page, detailTimeoutMs());
  await page.waitForTimeout(detailSettleMs());
}

export async function recoverMissingCriticalMetrics(
  page: Page,
  detail: DetailPayload,
  options: {
    marketplace: string;
    zipCode?: string | null;
    productUrl: string;
    assertPageReady(): Promise<void>;
  }
): Promise<DetailPayload> {
  if (!hasMissingCriticalMetrics(detail)) {
    return detail;
  }

  // Re-apply the delivery ZIP and revisit the product page only for pages that
  // are still missing rating/review data. This is slower, but accuracy matters
  // more than throughput for these fields.
  await setDeliveryZipCode(page, options.marketplace, options.zipCode).catch(() => undefined);
  await openDetailPage(page, options.productUrl);
  await options.assertPageReady();
  return mergeDetailPayload(detail, await readDetailWithRetry(page));
}

export function preferCurrentPrice(existing: number | null | undefined, detailCurrent: number | null): number | null {
  return existing ?? detailCurrent ?? null;
}

export function resolveOriginalPrice(existing: number | null | undefined, detailOriginal: number | null, current: number | null): number | null {
  const candidates = [existing ?? null, detailOriginal ?? null].filter((value): value is number => value !== null);
  const validCandidates = candidates.filter((value) => current === null || value > current);
  if (validCandidates.length === 0) {
    return null;
  }
  return Math.max(...validCandidates);
}

export async function resolveBrandFromStorePage(
  page: Page,
  storeUrl: string | null,
  currentBrand: string | null,
  title: string
): Promise<string | null> {
  const resolvedStoreUrl = storeUrl;
  if (!resolvedStoreUrl || !shouldVerifyBrandThroughStore(resolvedStoreUrl, currentBrand, title)) {
    return currentBrand;
  }

  try {
    await page.goto(resolvedStoreUrl, { waitUntil: "domcontentloaded", timeout: detailTimeoutMs() });
    await waitForNetworkIdleIfEnabled(page, detailTimeoutMs());
    await page.waitForTimeout(detailSettleMs());
    const storeBrand = await page.evaluate(extractStorePageBrand);
    return hasWeakBrandValue(storeBrand, title) ? currentBrand : storeBrand ?? currentBrand;
  } catch {
    return currentBrand;
  }
}

async function waitForLateMetricSignals(page: Page): Promise<void> {
  const reviewSection = page
    .locator(
      "#acrCustomerReviewText, #acrCustomerReviewLink span, [data-hook='total-review-count'], #averageCustomerReviews .a-icon-alt, [data-hook='rating-out-of-text']"
    )
    .first();
  await reviewSection.waitFor({ state: "visible", timeout: 2000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
}

function hasMissingCriticalMetrics(detail: DetailPayload): boolean {
  return detail.rating === null || detail.reviewCount === null;
}

function mergeDetailPayload(detail: DetailPayload, retried: DetailPayload): DetailPayload {
  return {
    ...detail,
    title: retried.title ?? detail.title,
    brand: retried.brand ?? detail.brand,
    storeUrl: retried.storeUrl ?? detail.storeUrl,
    couponText: retried.couponText,
    dealBadge: retried.dealBadge,
    currentPrice: retried.currentPrice ?? detail.currentPrice,
    originalPrice: retried.originalPrice ?? detail.originalPrice,
    currency: retried.currency ?? detail.currency,
    rating: retried.rating ?? detail.rating,
    reviewCount: retried.reviewCount ?? detail.reviewCount,
    iceType: retried.iceType ?? detail.iceType,
    bsrRank: retried.bsrRank ?? detail.bsrRank,
    bsrCategory: retried.bsrCategory ?? detail.bsrCategory,
    bsrText: retried.bsrText ?? detail.bsrText,
    bestsellerRanks: retried.bestsellerRanks.length > 0 ? retried.bestsellerRanks : detail.bestsellerRanks
  };
}

function shouldVerifyBrandThroughStore(storeUrl: string | null | undefined, brand: string | null | undefined, title: string): boolean {
  return Boolean(storeUrl) && hasWeakBrandValue(brand, title);
}
