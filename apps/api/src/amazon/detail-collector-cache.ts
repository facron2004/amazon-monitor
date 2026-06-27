import type { BestSellerProductInput, SerpProductInput } from "@amazon-monitor/shared";
import { hasWeakBrandValue } from "./brand-quality.js";
import { detailCacheMaxItems, normalizeMarketplaceHost } from "./config.js";

export type DetailRankCacheValue = Pick<
  SerpProductInput,
  | "title"
  | "brand"
  | "couponText"
  | "dealBadge"
  | "rating"
  | "reviewCount"
  | "iceType"
  | "currentPrice"
  | "originalPrice"
  | "currency"
  | "bsrRank"
  | "bsrCategory"
  | "bsrText"
  | "bestsellerRanks"
  | "detailCollectedAt"
>;

export type BestSellerDetailCacheValue = Pick<
  BestSellerProductInput,
  "title" | "brand" | "couponText" | "dealBadge" | "rating" | "reviewCount" | "iceType" | "currentPrice" | "originalPrice" | "currency" | "bsrRank" | "bsrCategory"
>;

export function shouldCollectBestSellerDetails(product: BestSellerProductInput): boolean {
  return Boolean(product.productUrl);
}

export function applyCachedBestSellerDetails(
  product: BestSellerProductInput,
  cached: BestSellerDetailCacheValue | undefined
): BestSellerProductInput {
  return cached
    ? {
        ...product,
        title: cached.title || product.title,
        brand: cached.brand ?? product.brand,
        couponText: cached.couponText,
        dealBadge: cached.dealBadge,
        rating: cached.rating ?? product.rating,
        reviewCount: cached.reviewCount ?? product.reviewCount,
        iceType: cached.iceType ?? product.iceType,
        currentPrice: product.currentPrice ?? cached.currentPrice,
        originalPrice: product.originalPrice ?? cached.originalPrice,
        currency: product.currentPrice === null && cached.currency ? cached.currency : product.currency,
        bsrRank: cached.bsrRank ?? product.bsrRank,
        bsrCategory: cached.bsrCategory ?? product.bsrCategory
      }
    : product;
}

export function pickBestSellerDetail(product: BestSellerProductInput): BestSellerDetailCacheValue {
  return {
    title: product.title,
    brand: product.brand,
    couponText: product.couponText,
    dealBadge: product.dealBadge,
    rating: product.rating,
    reviewCount: product.reviewCount,
    iceType: product.iceType ?? null,
    currentPrice: product.currentPrice,
    originalPrice: product.originalPrice,
    currency: product.currency,
    bsrRank: product.bsrRank ?? null,
    bsrCategory: product.bsrCategory ?? null
  };
}

export function prioritizeDetailCollection<T extends { brand: string | null; title: string }>(products: T[]): T[] {
  const weakBrandProducts: T[] = [];
  const otherProducts: T[] = [];
  for (const product of products) {
    if (hasWeakBrandValue(product.brand, product.title)) {
      weakBrandProducts.push(product);
      continue;
    }
    otherProducts.push(product);
  }
  return [...weakBrandProducts, ...otherProducts];
}

export function applyCachedDetailRanks(product: SerpProductInput, cached: DetailRankCacheValue | undefined): SerpProductInput {
  return cached
    ? {
        ...product,
        title: cached.title || product.title,
        brand: cached.brand ?? product.brand,
        couponText: cached.couponText,
        dealBadge: cached.dealBadge,
        rating: cached.rating ?? product.rating,
        reviewCount: cached.reviewCount ?? product.reviewCount,
        iceType: cached.iceType ?? product.iceType,
        currentPrice: product.currentPrice ?? cached.currentPrice,
        originalPrice: product.originalPrice ?? cached.originalPrice,
        currency: product.currentPrice === null && cached.currency ? cached.currency : product.currency,
        bsrRank: cached.bsrRank,
        bsrCategory: cached.bsrCategory,
        bsrText: cached.bsrText,
        bestsellerRanks: cached.bestsellerRanks,
        detailCollectedAt: cached.detailCollectedAt
      }
    : product;
}

export function rememberDetailRanks(cache: Map<string, DetailRankCacheValue>, key: string, product: SerpProductInput): void {
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
    title: product.title,
    brand: product.brand,
    couponText: product.couponText,
    dealBadge: product.dealBadge,
    rating: product.rating,
    reviewCount: product.reviewCount,
    iceType: product.iceType ?? null,
    currentPrice: product.currentPrice,
    originalPrice: product.originalPrice,
    currency: product.currency,
    bsrRank: product.bsrRank ?? null,
    bsrCategory: product.bsrCategory ?? null,
    bsrText: product.bsrText ?? null,
    bestsellerRanks: product.bestsellerRanks ?? [],
    detailCollectedAt: product.detailCollectedAt ?? null
  });
}

export function detailCacheKey(date: string, marketplace: string, asin: string): string {
  // Version 5: promo fields are latest-page state, including null when ended.
  const parserVersion = "v5";
  return `${parserVersion}|${date}|${normalizeMarketplaceHost(marketplace)}|${asin}`;
}
