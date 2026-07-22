import type {
  BestsellerRankSnapshot,
  BsrRankHistory,
  CategorySignalLog,
  CompetitorActionInsight,
  CompetitorActivityEvent,
  DailyChange,
  ProductActivityCalendar,
  ProductActivityCalendarDay,
  ProductPriceHistory,
  SerpSnapshot
} from "@amazon-monitor/shared";

export function buildProductActivityDay(input: {
  asin: string;
  date: string;
  categorySnapshots: BestsellerRankSnapshot[];
  keywordSnapshots: SerpSnapshot[];
  events: CompetitorActivityEvent[];
  actionInsights: CompetitorActionInsight[];
  signals: CategorySignalLog[];
  bsrRanks: BsrRankHistory[];
  priceHistory: ProductPriceHistory[];
  keywordChanges: DailyChange[];
}): ProductActivityCalendarDay {
  const categoryRanks = input.categorySnapshots
    .filter((item) => item.snapshotDate === input.date)
    .map((item) => ({
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      rank: item.rank,
      price: item.currentPrice,
      finalEstimatedPrice: item.finalEstimatedPrice,
      reviewCount: item.reviewCount,
      couponText: item.couponText,
      dealBadge: item.dealBadge,
      productUrl: item.productUrl
    }));
  const keywordRanks = input.keywordSnapshots
    .filter((item) => item.snapshotDate === input.date)
    .map((item) => ({
      keywordId: item.keywordId,
      keyword: item.keyword,
      absoluteRank: item.absoluteRank,
      organicRank: item.organicRank,
      sponsoredRank: item.sponsoredRank,
      price: item.currentPrice,
      couponText: item.couponText,
      dealBadge: item.dealBadge,
      productUrl: item.productUrl
    }));
  const identity = resolveProductIdentity(input.asin, input.categorySnapshots, input.keywordSnapshots, input.priceHistory, input.events);
  return {
    date: input.date,
    asin: input.asin,
    marketplace: identity?.marketplace ?? "amazon.com",
    title: identity?.title ?? null,
    brand: identity?.brand ?? null,
    imageUrl: identity?.imageUrl ?? null,
    categoryRanks,
    keywordRanks,
    bsrRanks: input.bsrRanks.filter((item) => item.snapshotDate === input.date),
    priceHistory: input.priceHistory.find((item) => item.snapshotDate === input.date) ?? null,
    events: input.events.filter((item) => item.eventDate === input.date),
    actionInsights: input.actionInsights.filter((item) => item.insightDate === input.date),
    categorySignals: input.signals.filter((item) => item.signalDate === input.date),
    keywordChanges: input.keywordChanges.filter((item) => item.snapshotDate === input.date)
  };
}

export function buildProductActivitySummary(days: ProductActivityCalendarDay[]): ProductActivityCalendar["summary"] {
  const categoryRanks = days.flatMap((day) => day.categoryRanks.map((item) => item.rank));
  const keywordRanks = days.flatMap((day) => day.keywordRanks.map((item) => item.absoluteRank));
  const prices = days.map(dayActivityPrice).filter((price): price is number => price !== null);
  const latestCategoryRank = days.find((day) => day.categoryRanks.length)?.categoryRanks[0]?.rank ?? null;
  const latestKeywordRank = days.find((day) => day.keywordRanks.length)?.keywordRanks[0]?.absoluteRank ?? null;
  const latestReviewCount =
    days.find((day) => day.priceHistory?.reviewCount !== undefined && day.priceHistory.reviewCount !== null)?.priceHistory?.reviewCount ??
    days.flatMap((day) => day.categoryRanks).find((item) => item.reviewCount !== undefined && item.reviewCount !== null)?.reviewCount ??
    days.flatMap((day) => day.events).find((event) => event.reviewCountAfter !== undefined && event.reviewCountAfter !== null)?.reviewCountAfter ??
    null;
  const reviewCountChanges = days
    .flatMap((day) => day.events)
    .map((event) => event.reviewCountChange)
    .filter((value): value is number => value !== undefined && value !== null);
  return {
    firstSeenDate: days.length ? days[days.length - 1].date : null,
    lastSeenDate: days[0]?.date ?? null,
    activeDays: days.length,
    bestCategoryRank: categoryRanks.length ? Math.min(...categoryRanks) : null,
    latestCategoryRank,
    bestKeywordRank: keywordRanks.length ? Math.min(...keywordRanks) : null,
    latestKeywordRank,
    priceLow: prices.length ? Math.min(...prices) : null,
    priceHigh: prices.length ? Math.max(...prices) : null,
    latestReviewCount,
    reviewCountChange: reviewCountChanges.length ? Math.max(...reviewCountChanges) : null,
    eventCount: days.reduce(
      (sum, day) => sum + day.events.length + day.actionInsights.length + day.categorySignals.length + day.keywordChanges.length,
      0
    )
  };
}

export function resolveProductIdentity(
  asin: string,
  categorySnapshots: BestsellerRankSnapshot[],
  keywordSnapshots: SerpSnapshot[],
  priceHistory: ProductPriceHistory[],
  events: CompetitorActivityEvent[]
): { marketplace: string; title: string | null; brand: string | null; imageUrl: string | null; productUrl: string | null } | null {
  const category = categorySnapshots[0];
  if (category) {
    return { marketplace: category.marketplace, title: category.title, brand: category.brand, imageUrl: category.imageUrl, productUrl: category.productUrl };
  }
  const keyword = keywordSnapshots[0];
  if (keyword) {
    return { marketplace: keyword.marketplace, title: keyword.title, brand: keyword.brand, imageUrl: keyword.imageUrl, productUrl: keyword.productUrl };
  }
  const price = priceHistory[0];
  if (price) {
    return { marketplace: price.marketplace, title: price.title, brand: price.brand, imageUrl: null, productUrl: `https://www.amazon.com/dp/${asin}` };
  }
  const event = events[0];
  if (event) {
    return { marketplace: event.marketplace, title: event.title, brand: event.brand, imageUrl: null, productUrl: `https://www.amazon.com/dp/${asin}` };
  }
  return null;
}

function dayActivityPrice(day: ProductActivityCalendarDay): number | null {
  return (
    day.priceHistory?.currentPrice ??
    day.categoryRanks.find((item) => item.price !== null)?.price ??
    day.keywordRanks.find((item) => item.price !== null)?.price ??
    null
  );
}
