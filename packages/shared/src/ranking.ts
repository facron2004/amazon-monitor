import type {
  BestsellerRankSnapshot,
  DecorateBestsellerInput,
  DecorateSnapshotInput,
  PriceBandSummary,
  SerpSnapshot
} from "./types.js";
import { estimateFinalPrice, parseCoupon } from "./product.js";
import { roundCurrency } from "./report-formatters.js";

export function decorateSnapshotRanks(input: DecorateSnapshotInput): SerpSnapshot[] {
  let organicRank = 0;
  let sponsoredRank = 0;

  return input.products.map((product, index) => {
    const coupon = parseCoupon(product.couponText);
    const isSponsored = Boolean(product.isSponsored);
    const organic = isSponsored ? null : ++organicRank;
    const sponsored = isSponsored ? ++sponsoredRank : null;

    return {
      ...product,
      keywordId: input.keywordId,
      keyword: input.keyword,
      marketplace: input.marketplace,
      snapshotDate: input.snapshotDate,
      pageNo: input.pageNo,
      positionInPage: index + 1,
      absoluteRank: (input.pageNo - 1) * input.productsPerPage + index + 1,
      organicRank: organic,
      sponsoredRank: sponsored,
      originalPrice: product.originalPrice ?? null,
      couponValue: coupon.couponValue,
      couponRate: coupon.couponRate,
      finalEstimatedPrice: estimateFinalPrice(product.currentPrice, coupon.couponValue, coupon.couponRate),
      iceType: product.iceType ?? null,
      bsrRank: product.bsrRank ?? null,
      bsrCategory: product.bsrCategory ?? null,
      bsrText: product.bsrText ?? null,
      bestsellerRanks: product.bestsellerRanks ?? [],
      detailCollectedAt: product.detailCollectedAt ?? null
    };
  });
}

export function summarizePriceBand(items: SerpSnapshot[], limit: number): PriceBandSummary {
  const prices = items
    .slice(0, limit)
    .map((item) => item.currentPrice)
    .filter((price): price is number => typeof price === "number");

  if (prices.length === 0) {
    return { count: 0, minPrice: null, maxPrice: null, averagePrice: null };
  }

  return {
    count: prices.length,
    minPrice: roundCurrency(Math.min(...prices)),
    maxPrice: roundCurrency(Math.max(...prices)),
    averagePrice: roundCurrency(prices.reduce((sum, price) => sum + price, 0) / prices.length)
  };
}

export function decorateBestsellerSnapshots(input: DecorateBestsellerInput): BestsellerRankSnapshot[] {
  return input.products
    .map((product, index) => {
      const coupon = parseCoupon(product.couponText);
      const rank = product.rank || index + 1;
      return {
        ...product,
        rank,
        categoryId: input.categoryId,
        categoryName: input.categoryName,
        marketplace: input.marketplace,
        snapshotDate: input.snapshotDate,
        originalPrice: product.originalPrice ?? null,
        couponValue: coupon.couponValue,
        couponRate: coupon.couponRate,
        finalEstimatedPrice: estimateFinalPrice(product.currentPrice, coupon.couponValue, coupon.couponRate),
        iceType: product.iceType ?? null,
        bsrRank: product.bsrRank ?? rank,
        bsrCategory: product.bsrCategory ?? input.categoryName
      };
    })
    .sort((a, b) => a.rank - b.rank);
}
