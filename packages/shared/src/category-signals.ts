import type { AlertLevel, BestsellerRankSnapshot, CategorySignalInput, CategorySignalLog, CategorySignalType } from "./types.js";
import { roundCurrency } from "./report-formatters.js";

export function analyzeCategorySignals(input: CategorySignalInput): CategorySignalLog[] {
  const todayByAsin = new Map(input.today.map((item) => [item.asin, item]));
  const yesterdayByAsin = new Map(input.yesterday.map((item) => [item.asin, item]));
  const signals: CategorySignalLog[] = [];

  const pushSignal = (
    signalType: CategorySignalType,
    level: AlertLevel,
    item: BestsellerRankSnapshot,
    previous: BestsellerRankSnapshot | null,
    content: string
  ) => {
    signals.push({
      signalDate: input.date,
      categoryId: input.category.id,
      categoryName: input.category.name,
      marketplace: input.category.marketplace,
      signalType,
      alertLevel: level,
      asin: item.asin,
      brand: item.brand,
      title: item.title,
      rank: item.rank,
      previousRank: previous?.rank ?? null,
      price: item.currentPrice,
      previousPrice: previous?.currentPrice ?? null,
      content
    });
  };

  for (const item of input.today) {
    const previous = yesterdayByAsin.get(item.asin) ?? null;
    if (!previous) {
      const topSignal = item.rank <= 20 ? "new_top_20" : item.rank <= 50 ? "new_top_50" : "new_top_100";
      const level: AlertLevel = item.rank <= 20 ? "high" : item.rank <= 50 ? "medium" : "low";
      pushSignal(topSignal, level, item, null, `${item.asin} first entered ${input.category.name} Top ${topBoundary(item.rank)} at #${item.rank}.`);
      if (item.rank <= 50) {
        pushSignal("new_product_breakout", "high", item, null, `${item.asin} is a new breakout product in ${input.category.name}, entering at #${item.rank}.`);
      }
      continue;
    }

    const rankDelta = previous.rank - item.rank;
    if (rankDelta >= 20) {
      pushSignal("major_rank_up", item.rank <= 20 ? "high" : "medium", item, previous, `${item.asin} moved up ${rankDelta} places to #${item.rank}.`);
    }
    if (rankDelta <= -20) {
      pushSignal("major_rank_down", "medium", item, previous, `${item.asin} moved down ${Math.abs(rankDelta)} places to #${item.rank}.`);
    }
    if (previous.rank > 20 && item.rank <= 20) {
      pushSignal("new_top_20", "high", item, previous, `${item.asin} entered Top 20, moving from #${previous.rank} to #${item.rank}.`);
    } else if (previous.rank > 50 && item.rank <= 50) {
      pushSignal("new_top_50", "medium", item, previous, `${item.asin} entered Top 50, moving from #${previous.rank} to #${item.rank}.`);
    }

    if (previous.currentPrice !== null && item.currentPrice !== null) {
      const priceChangeRate = roundRate((item.currentPrice - previous.currentPrice) / previous.currentPrice);
      if (priceChangeRate <= -0.05) {
        pushSignal(
          "price_drop",
          "medium",
          item,
          previous,
          `${item.asin} price dropped from ${formatMoney(previous.currentPrice, item.currency)} to ${formatMoney(item.currentPrice, item.currency)}.`
        );
      }
    }
    if (!previous.couponText && item.couponText) {
      pushSignal("new_coupon", "medium", item, previous, `${item.asin} added coupon: ${item.couponText}.`);
    }
    if (!previous.dealBadge && item.dealBadge) {
      pushSignal("new_deal", "medium", item, previous, `${item.asin} added deal badge: ${item.dealBadge}.`);
    }
  }

  for (const previous of input.yesterday) {
    if (todayByAsin.has(previous.asin)) {
      continue;
    }
    const signalType = previous.rank <= 20 ? "dropped_top_20" : previous.rank <= 50 ? "dropped_top_50" : "dropped_top_100";
    signals.push({
      signalDate: input.date,
      categoryId: input.category.id,
      categoryName: input.category.name,
      marketplace: input.category.marketplace,
      signalType,
      alertLevel: previous.rank <= 20 ? "high" : "medium",
      asin: previous.asin,
      brand: previous.brand,
      title: previous.title,
      rank: null,
      previousRank: previous.rank,
      price: null,
      previousPrice: previous.currentPrice,
      content: `${previous.asin} dropped from ${input.category.name} Top ${topBoundary(previous.rank)} after ranking #${previous.rank}.`
    });
  }

  return signals.sort((a, b) => {
    const levelScore: Record<AlertLevel, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    if (levelScore[b.alertLevel] !== levelScore[a.alertLevel]) return levelScore[b.alertLevel] - levelScore[a.alertLevel];
    return (a.rank ?? 9999) - (b.rank ?? 9999);
  });
}

function topBoundary(rank: number): number {
  if (rank <= 20) return 20;
  if (rank <= 50) return 50;
  return 100;
}

function formatMoney(value: number, currency = "$"): string {
  return `${currency}${roundCurrency(value).toFixed(2)}`;
}

function roundRate(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
