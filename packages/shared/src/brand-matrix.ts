import type { BestsellerRankSnapshot, BrandMatrixInput, BrandMatrixSnapshot } from "./types.js";
import { roundCurrency } from "./report-formatters.js";

export function buildBrandMatrixSnapshots(input: BrandMatrixInput): BrandMatrixSnapshot[] {
  const todayByAsin = new Map(input.today.map((item) => [item.asin, item]));
  const yesterdayByAsin = new Map(input.yesterday.map((item) => [item.asin, item]));

  const todayByBrand = groupByNormalizedBrand(input.today);
  const yesterdayByBrand = groupByNormalizedBrand(input.yesterday);

  return Array.from(new Set([...todayByBrand.keys(), ...yesterdayByBrand.keys()]))
    .map((brand) => {
      const today = (todayByBrand.get(brand) ?? []).sort((a, b) => a.rank - b.rank);
      const yesterday = yesterdayByBrand.get(brand) ?? [];
      const ranked = today.map((item) => item.rank);
      const averageRank = ranked.length ? roundCurrency(ranked.reduce((sum, rank) => sum + rank, 0) / ranked.length) : null;

      let rankUpCount = 0;
      let rankDownCount = 0;
      let priceDownCount = 0;
      for (const item of today) {
        const previous = yesterdayByAsin.get(item.asin);
        if (previous) {
          if (previous.rank > item.rank) rankUpCount++;
          if (previous.rank < item.rank) rankDownCount++;
          if (previous.currentPrice !== null && previous.currentPrice !== undefined && item.currentPrice !== null && item.currentPrice < previous.currentPrice) priceDownCount++;
        }
      }

      return {
        categoryId: input.category.id,
        categoryName: input.category.name,
        marketplace: input.category.marketplace,
        snapshotDate: input.date,
        brand,
        productCountTop100: countBy(today, (item) => item.rank <= 100),
        productCountTop50: countBy(today, (item) => item.rank <= 50),
        productCountTop20: countBy(today, (item) => item.rank <= 20),
        productCountTop10: countBy(today, (item) => item.rank <= 10),
        bestRank: ranked.length ? Math.min(...ranked) : null,
        averageRank,
        newEntryCount: countBy(today, (item) => !yesterdayByAsin.has(item.asin)),
        droppedCount: countBy(yesterday, (item) => !todayByAsin.has(item.asin)),
        rankUpCount,
        rankDownCount,
        priceDownCount,
        couponCount: countBy(today, (item) => Boolean(item.couponText || item.couponValue || item.couponRate)),
        dealCount: countBy(today, (item) => Boolean(item.dealBadge)),
        topAsins: today.slice(0, 5).map((item) => item.asin)
      };
    })
    .sort((a, b) => {
      if (b.productCountTop20 !== a.productCountTop20) return b.productCountTop20 - a.productCountTop20;
      if (b.productCountTop50 !== a.productCountTop50) return b.productCountTop50 - a.productCountTop50;
      if (b.productCountTop100 !== a.productCountTop100) return b.productCountTop100 - a.productCountTop100;
      return (a.bestRank ?? 9999) - (b.bestRank ?? 9999);
    });
}

function groupByNormalizedBrand(items: BestsellerRankSnapshot[]): Map<string, BestsellerRankSnapshot[]> {
  const map = new Map<string, BestsellerRankSnapshot[]>();
  for (const item of items) {
    const brand = normalizeBrand(item.brand);
    const group = map.get(brand);
    if (group) {
      group.push(item);
    } else {
      map.set(brand, [item]);
    }
  }
  return map;
}

function countBy<T>(items: T[], predicate: (item: T) => boolean): number {
  let count = 0;
  for (const item of items) {
    if (predicate(item)) count += 1;
  }
  return count;
}

function normalizeBrand(brand: string | null): string {
  return brand?.trim() || "Unknown";
}
