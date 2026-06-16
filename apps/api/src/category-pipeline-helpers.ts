import {
  describeRankCoverageGaps,
  estimateFinalPrice,
  type BestsellerRankSnapshot,
  type BsrRankHistory,
  type BestSellerProductInput,
  type CategoryMonitor
} from "@amazon-monitor/shared";

type RetryableCollectedPage = {
  retryCount?: number;
};

export function totalPageRetryCount(pages: RetryableCollectedPage[]): number {
  return pages.reduce((sum, page) => sum + (page.retryCount ?? 0), 0);
}

export function dedupeProductsByAsin(products: BestSellerProductInput[]): BestSellerProductInput[] {
  const seen = new Set<string>();
  const result: BestSellerProductInput[] = [];
  for (const product of products) {
    if (seen.has(product.asin)) {
      continue;
    }
    seen.add(product.asin);
    result.push(product);
  }
  return result;
}

export function preserveKnownCommercialFields(
  today: BestsellerRankSnapshot[],
  previous: BestsellerRankSnapshot[]
): BestsellerRankSnapshot[] {
  const previousByAsin = new Map(previous.map((item) => [`${item.marketplace}:${item.asin}`, item]));
  return today.map((item) => {
    const previousItem = previousByAsin.get(`${item.marketplace}:${item.asin}`);
    const currentPrice = item.currentPrice ?? previousItem?.currentPrice ?? null;
    const reviewCount = item.reviewCount ?? previousItem?.reviewCount ?? null;
    const rating = item.rating ?? previousItem?.rating ?? null;
    const currentCouponText = validPromoText(item.couponText);
    const previousCouponText = validPromoText(previousItem?.couponText);
    const couponText = currentCouponText ?? previousCouponText;
    const couponValue = currentCouponText ? item.couponValue : previousCouponText ? previousItem?.couponValue ?? null : item.couponValue;
    const couponRate = currentCouponText ? item.couponRate : previousCouponText ? previousItem?.couponRate ?? null : item.couponRate;
    const dealBadge = validPromoText(item.dealBadge) ?? validPromoText(previousItem?.dealBadge);
    return {
      ...item,
      currentPrice,
      couponText,
      couponValue,
      couponRate,
      finalEstimatedPrice: currentPrice === null ? null : estimateFinalPrice(currentPrice, couponValue, couponRate),
      rating,
      reviewCount,
      dealBadge
    };
  });
}

export function buildCategoryBsrRankHistory(category: CategoryMonitor, snapshots: BestsellerRankSnapshot[]): BsrRankHistory[] {
  return snapshots.map((item) => ({
    snapshotDate: item.snapshotDate,
    sourceType: "category_bestseller",
    sourceId: category.id,
    sourceName: category.name,
    marketplace: item.marketplace,
    asin: item.asin,
    title: item.title,
    brand: item.brand,
    category: item.categoryName,
    rank: item.rank,
    rankUrl: category.categoryUrl,
    productUrl: item.productUrl,
    currentPrice: item.currentPrice,
    parentRank: null,
    isSpecificRank: true
  }));
}

export function strictBsrRankCoverageIssue(products: BestSellerProductInput[], expectedCount: number): string | null {
  const ranks = products.map((product) => product.rank);
  const uniqueRankCount = new Set(ranks).size;
  if (uniqueRankCount < expectedCount) {
    const detail = describeRankCoverageGaps(ranks, expectedCount);
    return `Expected ${expectedCount} unique ranks, collected ${uniqueRankCount}.${detail ? ` ${detail}` : ""}`;
  }

  const minRank = ranks.length ? Math.min(...ranks) : null;
  if (minRank !== 1) {
    return `Expected rank coverage to start at #1, started at #${minRank ?? "none"}`;
  }

  const maxRank = ranks.length ? Math.max(...ranks) : null;
  if (maxRank !== expectedCount) {
    return `Expected max rank ${expectedCount}, collected max rank ${maxRank ?? "none"}`;
  }

  return null;
}

export function normalizeBestSellerPageRanks(products: BestSellerProductInput[], previousCount: number): BestSellerProductInput[] {
  if (previousCount <= 0 || products.length === 0) {
    return products;
  }

  const ranks = products.map((product) => product.rank).filter((rank) => Number.isFinite(rank) && rank > 0);
  const minRank = ranks.length ? Math.min(...ranks) : null;
  if (minRank === null || minRank > previousCount) {
    return products;
  }

  return products.map((product) => {
    const rank = product.rank + previousCount;
    return {
      ...product,
      rank,
      bsrRank: product.bsrRank === product.rank ? rank : product.bsrRank
    };
  });
}

function validPromoText(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || text.length > 90) {
    return null;
  }
  if (/\b(coupon|save)\b/i.test(text)) {
    return text;
  }
  if (/\b(limited\s+time\s+deal|prime\s+exclusive\s+deal|deal\s+of\s+the\s+day|lightning\s+deal|black\s+friday\s+deal|cyber\s+monday\s+deal)\b/i.test(text)) {
    return text;
  }
  return text.toLowerCase() === "deal" ? text : null;
}
