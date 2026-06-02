export type NullableNumber = number | null;

export type KeywordStatus = "enabled" | "disabled";

export interface KeywordMonitor {
  id: number;
  keyword: string;
  marketplace: string;
  zipCode: string | null;
  language: string | null;
  categoryTag: string | null;
  crawlPages: number;
  status: KeywordStatus;
  createdAt: string;
  updatedAt: string;
  lastCollectedAt: string | null;
  todayStatus: "success" | "failed" | "pending";
}

export type CategoryStatus = "enabled" | "disabled";

export interface CategoryMonitor {
  id: number;
  name: string;
  marketplace: string;
  categoryUrl: string;
  categoryPath: string | null;
  crawlTopN: number;
  status: CategoryStatus;
  createdAt: string;
  updatedAt: string;
  lastCollectedAt: string | null;
  todayStatus: "success" | "failed" | "pending";
}

export interface CategoryMonitorInput {
  name: string;
  marketplace: string;
  categoryUrl: string;
  categoryPath?: string | null;
  crawlTopN?: number;
  status?: CategoryStatus;
}

export interface SerpProductInput {
  asin: string;
  title: string;
  brand: string | null;
  imageUrl: string;
  productUrl: string;
  currentPrice: NullableNumber;
  originalPrice?: NullableNumber;
  couponText: string | null;
  currency: string;
  rating: NullableNumber;
  reviewCount: NullableNumber;
  isSponsored: boolean;
  isPrime: boolean;
  dealBadge: string | null;
  deliveryText: string | null;
  bsrRank?: NullableNumber;
  bsrCategory?: string | null;
  bsrText?: string | null;
  bestsellerRanks?: ProductRanking[];
  detailCollectedAt?: string | null;
}

export interface SerpSnapshot extends SerpProductInput {
  id?: number;
  keywordId: number;
  keyword: string;
  marketplace: string;
  snapshotDate: string;
  pageNo: number;
  positionInPage: number;
  absoluteRank: number;
  organicRank: NullableNumber;
  sponsoredRank: NullableNumber;
  couponValue: NullableNumber;
  couponRate: NullableNumber;
  finalEstimatedPrice: NullableNumber;
  bsrRank: NullableNumber;
  bsrCategory: string | null;
  bsrText: string | null;
  bestsellerRanks: ProductRanking[];
  detailCollectedAt: string | null;
  createdAt?: string;
}

export interface BestSellerProductInput {
  rank: number;
  asin: string;
  title: string;
  brand: string | null;
  imageUrl: string;
  productUrl: string;
  currentPrice: NullableNumber;
  originalPrice?: NullableNumber;
  couponText: string | null;
  currency: string;
  rating: NullableNumber;
  reviewCount: NullableNumber;
  isPrime: boolean;
  dealBadge: string | null;
  bsrRank?: NullableNumber;
  bsrCategory?: string | null;
}

export interface BestsellerRankSnapshot extends BestSellerProductInput {
  id?: number;
  categoryId: number;
  categoryName: string;
  marketplace: string;
  snapshotDate: string;
  couponValue: NullableNumber;
  couponRate: NullableNumber;
  finalEstimatedPrice: NullableNumber;
  bsrRank: NullableNumber;
  bsrCategory: string | null;
  createdAt?: string;
}

export interface ProductRanking {
  rank: number;
  category: string;
  url: string | null;
}

export type BsrSourceType = "category_bestseller" | "keyword_detail";

export type BsrRankChangeType = "new_entry" | "dropped" | "rank_up" | "rank_down" | "unchanged";

export interface BsrRankHistory {
  id?: number;
  snapshotDate: string;
  sourceType: BsrSourceType;
  sourceId: number | null;
  sourceName: string;
  marketplace: string;
  asin: string;
  title: string;
  brand: string | null;
  category: string;
  rank: number;
  rankUrl: string | null;
  productUrl: string | null;
  currentPrice: NullableNumber;
  parentRank: NullableNumber;
  isSpecificRank: boolean;
  createdAt?: string;
}

export interface BsrRankChange {
  snapshotDate: string;
  previousDate: string | null;
  sourceType: BsrSourceType;
  sourceId: number | null;
  sourceName: string;
  marketplace: string;
  category: string;
  asin: string;
  title: string;
  brand: string | null;
  currentRank: NullableNumber;
  previousRank: NullableNumber;
  rankChange: NullableNumber;
  changeType: BsrRankChangeType;
  productUrl: string | null;
  currentPrice: NullableNumber;
}

export type BsrSnapshotQualityStatus = "ok" | "partial" | "empty";

export interface BsrSnapshotQuality {
  id?: number;
  snapshotDate: string;
  sourceType: BsrSourceType;
  sourceId: number | null;
  sourceName: string;
  marketplace: string;
  category: string;
  expectedCount: NullableNumber;
  actualCount: number;
  uniqueAsinCount: number;
  uniqueRankCount: number;
  minRank: NullableNumber;
  maxRank: NullableNumber;
  qualityStatus: BsrSnapshotQualityStatus;
  issue: string | null;
  createdAt?: string;
}

export type CompetitorActionInsightType =
  | "bsr_new_entry"
  | "bsr_fast_rise"
  | "bsr_rank_drop"
  | "bsr_dropped"
  | "price_drop_rank_lift"
  | "coupon_rank_lift"
  | "deal_rank_lift"
  | "brand_push";

export type CompetitorActionInsightConfidence = "high" | "medium" | "low";

export interface CompetitorActionInsight {
  id?: number;
  insightDate: string;
  previousDate: string | null;
  sourceType: BsrSourceType;
  sourceId: number | null;
  sourceName: string;
  marketplace: string;
  category: string;
  asin: string | null;
  brand: string | null;
  title: string | null;
  insightType: CompetitorActionInsightType;
  confidence: CompetitorActionInsightConfidence;
  currentRank: NullableNumber;
  previousRank: NullableNumber;
  rankChange: NullableNumber;
  price: NullableNumber;
  productUrl: string | null;
  evidence: string;
  inferredAction: string;
  suggestedResponse: string;
  createdAt?: string;
}

export interface CompetitorActionInsightInput {
  date: string;
  bsrChanges: BsrRankChange[];
  activityEvents?: CompetitorActivityEvent[];
}

export function selectSpecificBestsellerRank(ranks: ProductRanking[] | null | undefined): ProductRanking | null {
  if (!ranks?.length) {
    return null;
  }

  return ranks[ranks.length - 1] ?? null;
}

export function describeRankCoverageGaps(ranks: number[], expectedCount: number): string {
  const counts = new Map<number, number>();
  for (const rank of ranks) {
    if (!Number.isFinite(rank) || rank <= 0) {
      continue;
    }
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }

  const missing: number[] = [];
  for (let rank = 1; rank <= expectedCount; rank += 1) {
    if (!counts.has(rank)) {
      missing.push(rank);
    }
  }
  const duplicates = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([rank]) => rank)
    .sort((a, b) => a - b);

  return [rankListDetail("Missing ranks", missing), rankListDetail("Duplicate ranks", duplicates)].filter(Boolean).join(" ");
}

function rankListDetail(label: string, ranks: number[]): string | null {
  if (ranks.length === 0) {
    return null;
  }
  const shown = ranks.slice(0, 10).map((rank) => `#${rank}`).join(", ");
  const rest = ranks.length > 10 ? ` (+${ranks.length - 10} more)` : "";
  return `${label}: ${shown}${rest}.`;
}

export interface DecorateSnapshotInput {
  keywordId: number;
  keyword: string;
  marketplace: string;
  snapshotDate: string;
  pageNo: number;
  productsPerPage: number;
  products: SerpProductInput[];
}

export interface CompetitorPoolItem {
  id: number;
  asin: string;
  marketplace: string;
  title: string;
  brand: string | null;
  imageUrl: string;
  firstSeenKeyword: string;
  firstSeenDate: string;
  lastSeenDate: string;
  appearKeywordCount: number;
  bestRank: number;
  latestRank: number;
  lowestPrice: NullableNumber;
  latestPrice: NullableNumber;
  latestProductUrl: string;
  latestBsrRank: NullableNumber;
  latestBsrCategory: string | null;
  latestBsrText: string | null;
  latestBestsellerRanks: ProductRanking[];
  sourceType: CompetitorSourceType;
  firstSeenSource: string | null;
  latestCategoryName: string | null;
  latestCategoryRank: NullableNumber;
  competitorTier: CompetitorTier;
  competitorReasons: string[];
  isKeyCompetitor: boolean;
  status: "active" | "ignored";
  createdAt: string;
  updatedAt: string;
}

export type CompetitorSourceType = "keyword" | "category" | "hybrid";

export type CompetitorTier = "core" | "rising" | "activity" | "watch";

export interface CompetitorFolder {
  keywordId: number;
  keyword: string;
  marketplace: string;
  competitorCount: number;
  latestSnapshotDate: string | null;
}

export interface ProductLink {
  asin: string;
  marketplace: string;
  url: string;
}

export interface ProductActivityCategoryRank {
  categoryId: number;
  categoryName: string;
  rank: number;
  price: NullableNumber;
  finalEstimatedPrice: NullableNumber;
  couponText: string | null;
  dealBadge: string | null;
  productUrl: string;
}

export interface ProductActivityKeywordRank {
  keywordId: number;
  keyword: string;
  absoluteRank: number;
  organicRank: NullableNumber;
  sponsoredRank: NullableNumber;
  price: NullableNumber;
  couponText: string | null;
  dealBadge: string | null;
  productUrl: string;
}

export interface ProductActivityCalendarDay {
  date: string;
  asin: string;
  marketplace: string;
  title: string | null;
  brand: string | null;
  imageUrl: string | null;
  categoryRanks: ProductActivityCategoryRank[];
  keywordRanks: ProductActivityKeywordRank[];
  bsrRanks: BsrRankHistory[];
  priceHistory: ProductPriceHistory | null;
  events: CompetitorActivityEvent[];
  actionInsights: CompetitorActionInsight[];
  categorySignals: CategorySignalLog[];
  keywordChanges: DailyChange[];
}

export interface ProductActivityCalendarSummary {
  firstSeenDate: string | null;
  lastSeenDate: string | null;
  activeDays: number;
  bestCategoryRank: NullableNumber;
  latestCategoryRank: NullableNumber;
  bestKeywordRank: NullableNumber;
  latestKeywordRank: NullableNumber;
  priceLow: NullableNumber;
  priceHigh: NullableNumber;
  eventCount: number;
}

export interface ProductActivityCalendar {
  asin: string;
  marketplace: string;
  title: string | null;
  brand: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  summary: ProductActivityCalendarSummary;
  days: ProductActivityCalendarDay[];
}

export type ChangeType =
  | "price_drop"
  | "price_rise"
  | "new_coupon"
  | "coupon_disappeared"
  | "coupon_strengthened"
  | "coupon_weakened"
  | "rank_up"
  | "rank_down"
  | "entered_top_10"
  | "entered_top_20"
  | "new_sponsored"
  | "sponsored_disappeared"
  | "new_competitor"
  | "dropped_competitor"
  | "historical_low";

export interface DailyChange {
  asin: string;
  keyword: string;
  marketplace: string;
  snapshotDate: string;
  yesterdayRank: NullableNumber;
  todayRank: NullableNumber;
  rankChange: NullableNumber;
  yesterdayPrice: NullableNumber;
  todayPrice: NullableNumber;
  priceChange: NullableNumber;
  priceChangeRate: NullableNumber;
  yesterdaySponsored: boolean | null;
  todaySponsored: boolean | null;
  changeType: ChangeType;
  title: string;
  brand: string | null;
}

export type AlertLevel = "critical" | "high" | "medium" | "low";

export interface AlertLog {
  id?: number;
  alertDate: string;
  alertType: string;
  alertLevel: AlertLevel;
  keyword: string;
  asin: string;
  title: string;
  brand: string | null;
  alertContent: string;
  oldValue: string | null;
  newValue: string | null;
  status: "pending" | "viewed" | "followed" | "ignored";
  createdAt?: string;
}

export interface AnalyzeDailyChangesInput {
  today: SerpSnapshot[];
  yesterday: SerpSnapshot[];
  historyLowestPrices: Record<string, NullableNumber>;
}

export interface DailyAnalysisResult {
  changes: DailyChange[];
  alerts: AlertLog[];
}

export interface PriceBandSummary {
  count: number;
  minPrice: NullableNumber;
  maxPrice: NullableNumber;
  averagePrice: NullableNumber;
}

export interface DailyReportInput {
  date: string;
  keyword: string;
  analysis: DailyAnalysisResult;
  priceBand: PriceBandSummary;
  failedKeywords?: string[];
}

export interface DecorateBestsellerInput {
  categoryId: number;
  categoryName: string;
  marketplace: string;
  snapshotDate: string;
  products: BestSellerProductInput[];
}

export interface BrandMatrixSnapshot {
  id?: number;
  categoryId: number;
  categoryName: string;
  marketplace: string;
  snapshotDate: string;
  brand: string;
  productCountTop100: number;
  productCountTop50: number;
  productCountTop20: number;
  bestRank: NullableNumber;
  averageRank: NullableNumber;
  newEntryCount: number;
  droppedCount: number;
  rankUpCount: number;
  rankDownCount: number;
  priceDownCount: number;
  couponCount: number;
  dealCount: number;
  topAsins: string[];
  createdAt?: string;
}

export type CategorySignalType =
  | "new_top_100"
  | "new_top_50"
  | "new_top_20"
  | "dropped_top_100"
  | "dropped_top_50"
  | "dropped_top_20"
  | "major_rank_up"
  | "major_rank_down"
  | "price_drop"
  | "new_coupon"
  | "new_deal"
  | "new_product_breakout";

export interface CategorySignalLog {
  id?: number;
  signalDate: string;
  categoryId: number;
  categoryName: string;
  marketplace: string;
  signalType: CategorySignalType;
  alertLevel: AlertLevel;
  asin: string | null;
  brand: string | null;
  title: string | null;
  rank: NullableNumber;
  previousRank: NullableNumber;
  price: NullableNumber;
  previousPrice: NullableNumber;
  content: string;
  createdAt?: string;
}

export interface ProductPriceHistory {
  id?: number;
  snapshotDate: string;
  categoryId: number;
  categoryName: string;
  marketplace: string;
  asin: string;
  brand: string | null;
  title: string;
  currentPrice: NullableNumber;
  couponValue: NullableNumber;
  couponRate: NullableNumber;
  finalEstimatedPrice: NullableNumber;
  t30LowPrice: NullableNumber;
  t60LowPrice: NullableNumber;
  t90LowPrice: NullableNumber;
  monitoringLowPrice: NullableNumber;
  createdAt?: string;
}

export type ActivityEventType =
  | "price_drop"
  | "coupon_start"
  | "coupon_end"
  | "coupon_increase"
  | "deal_start"
  | "deal_end"
  | "rank_surge"
  | "new_entry_top100"
  | "new_entry_top50"
  | "brand_matrix_push"
  | "activity_end_rank_drop";

export interface CompetitorActivityEvent {
  id?: number;
  eventKey: string;
  eventDate: string;
  eventType: ActivityEventType;
  eventLevel: AlertLevel;
  categoryId: number;
  categoryName: string;
  marketplace: string;
  asin: string | null;
  brand: string | null;
  title: string | null;
  priceBefore: NullableNumber;
  priceAfter: NullableNumber;
  priceChangeRate: NullableNumber;
  couponBefore: string | null;
  couponAfter: string | null;
  dealType: string | null;
  rankBefore: NullableNumber;
  rankAfter: NullableNumber;
  rankChange: NullableNumber;
  keywordRankBefore: NullableNumber;
  keywordRankAfter: NullableNumber;
  eventSummary: string;
  possibleStrategy: string;
  suggestedAction: string;
  createdAt?: string;
}

export interface BrandMatrixInput {
  category: CategoryMonitor;
  date: string;
  today: BestsellerRankSnapshot[];
  yesterday: BestsellerRankSnapshot[];
}

export interface CategorySignalInput extends BrandMatrixInput {}

export interface CategoryActivityEventInput extends BrandMatrixInput {
  brandMatrix: BrandMatrixSnapshot[];
}

export interface CategoryReportInput {
  date: string;
  category: CategoryMonitor;
  snapshots: BestsellerRankSnapshot[];
  brandMatrix: BrandMatrixSnapshot[];
  signals: CategorySignalLog[];
  activityEvents?: CompetitorActivityEvent[];
}

export interface DashboardSummary {
  keywordCount: number;
  activeKeywordCount: number;
  categoryMonitorCount: number;
  activeCategoryCount: number;
  todaySnapshotCount: number;
  categorySnapshotCount: number;
  competitorCount: number;
  alertCount: number;
  categorySignalCount: number;
  criticalAlertCount: number;
  latestReportDate: string | null;
}

export interface CollectTaskLog {
  id: number;
  taskType: string;
  keywordId: number | null;
  keyword: string | null;
  marketplace: string | null;
  status: "success" | "failed" | "running";
  startTime: string;
  endTime: string | null;
  pageCount: number;
  successCount: number;
  failCount: number;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
}

export type NotificationChannel = "email" | "feishu";
export type NotificationStatus = "enabled" | "disabled";
export type NotificationSendStatus = "success" | "failed";

export interface NotificationSchedule {
  id: number;
  name: string;
  channel: NotificationChannel;
  target: string;
  sendTime: string;
  timezone: string;
  status: NotificationStatus;
  lastSentAt: string | null;
  lastSentDate: string | null;
  lastStatus: NotificationSendStatus | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationScheduleInput {
  name: string;
  channel: NotificationChannel;
  target: string;
  sendTime: string;
  timezone?: string | null;
  status?: NotificationStatus;
}

export interface NotificationSendLog {
  id: number;
  scheduleId: number;
  scheduleName: string;
  channel: NotificationChannel;
  target: string;
  reportDate: string;
  status: NotificationSendStatus;
  message: string | null;
  errorMessage: string | null;
  sentAt: string;
  createdAt: string;
}

const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const roundRate = (value: number): number => Math.round((value + Number.EPSILON) * 10000) / 10000;

export function parseCoupon(couponText: string | null | undefined): {
  couponValue: NullableNumber;
  couponRate: NullableNumber;
} {
  if (!couponText) {
    return { couponValue: null, couponRate: null };
  }

  const amountMatch = couponText.match(/\$\s*(\d+(?:\.\d+)?)/i);
  if (amountMatch) {
    return { couponValue: Number(amountMatch[1]), couponRate: null };
  }

  const percentMatch = couponText.match(/(\d+(?:\.\d+)?)\s*%/i);
  if (percentMatch) {
    return { couponValue: null, couponRate: Number(percentMatch[1]) / 100 };
  }

  return { couponValue: null, couponRate: null };
}

export function estimateFinalPrice(
  currentPrice: NullableNumber,
  couponValue: NullableNumber,
  couponRate: NullableNumber
): NullableNumber {
  if (currentPrice === null) {
    return null;
  }
  if (couponValue !== null) {
    return roundCurrency(Math.max(0, currentPrice - couponValue));
  }
  if (couponRate !== null) {
    return roundCurrency(Math.max(0, currentPrice * (1 - couponRate)));
  }
  return roundCurrency(currentPrice);
}

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
        bsrRank: product.bsrRank ?? rank,
        bsrCategory: product.bsrCategory ?? input.categoryName
      };
    })
    .sort((a, b) => a.rank - b.rank);
}

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

export function buildCategoryActivityEvents(input: CategoryActivityEventInput): CompetitorActivityEvent[] {
  const yesterdayByAsin = new Map(input.yesterday.map((item) => [item.asin, item]));
  const events: CompetitorActivityEvent[] = [];

  const pushEvent = (
    eventType: ActivityEventType,
    level: AlertLevel,
    item: BestsellerRankSnapshot,
    previous: BestsellerRankSnapshot | null,
    summary: string,
    possibleStrategy: string,
    suggestedAction: string
  ) => {
    const rankChange = previous ? previous.rank - item.rank : null;
    const priceChangeRate =
      previous?.currentPrice && item.currentPrice !== null ? roundRate((item.currentPrice - previous.currentPrice) / previous.currentPrice) : null;
    events.push({
      eventKey: `${eventType}:${item.asin}`,
      eventDate: input.date,
      eventType,
      eventLevel: level,
      categoryId: input.category.id,
      categoryName: input.category.name,
      marketplace: input.category.marketplace,
      asin: item.asin,
      brand: item.brand,
      title: item.title,
      priceBefore: previous?.currentPrice ?? null,
      priceAfter: item.currentPrice,
      priceChangeRate,
      couponBefore: previous?.couponText ?? null,
      couponAfter: item.couponText ?? null,
      dealType: item.dealBadge ?? previous?.dealBadge ?? null,
      rankBefore: previous?.rank ?? null,
      rankAfter: item.rank,
      rankChange,
      keywordRankBefore: null,
      keywordRankAfter: null,
      eventSummary: summary,
      possibleStrategy,
      suggestedAction
    });
  };

  for (const item of input.today) {
    const previous = yesterdayByAsin.get(item.asin) ?? null;
    if (!previous) {
      const eventType: ActivityEventType = item.rank <= 50 ? "new_entry_top50" : "new_entry_top100";
      pushEvent(
        eventType,
        item.rank <= 20 ? "high" : item.rank <= 50 ? "medium" : "low",
        item,
        null,
        `${item.asin} entered ${input.category.name} Top ${topBoundary(item.rank)} at #${item.rank}.`,
        item.rank <= 50 ? "Possible new-entry or relaunch push with price, coupon, deal, ads, or external traffic." : "New Top 100 entry; observe whether it stays ranked.",
        item.rank <= 50 ? "Add to Top competitor watchlist and track the next 7 days." : "Keep monitoring; promote to key competitor if rank keeps improving."
      );
      continue;
    }

    const rankDelta = previous.rank - item.rank;
    const priceChangeRate =
      previous.currentPrice && item.currentPrice !== null ? roundRate((item.currentPrice - previous.currentPrice) / previous.currentPrice) : null;

    if (rankDelta >= 20) {
      pushEvent(
        "rank_surge",
        item.rank <= 20 ? "high" : "medium",
        item,
        previous,
        `${item.asin} moved from #${previous.rank} to #${item.rank}, up ${rankDelta} places.`,
        "Fast Best Sellers rank surge; likely related to promotion, ads, external traffic, or demand lift.",
        "Check price, coupon, deal, and keyword-rank signals around the same date."
      );
    }

    if (rankDelta <= -20 && (previous.couponText || previous.dealBadge) && !item.couponText && !item.dealBadge) {
      pushEvent(
        "activity_end_rank_drop",
        "medium",
        item,
        previous,
        `${item.asin} lost activity signals and dropped from #${previous.rank} to #${item.rank}.`,
        "Rank dropped after promotion ended; this item may rely on activity to hold rank.",
        "Track the next 3 days to measure post-activity rank decay."
      );
    }

    if (priceChangeRate !== null && priceChangeRate <= -0.05) {
      pushEvent(
        "price_drop",
        rankDelta > 0 ? "high" : "medium",
        item,
        previous,
        `${item.asin} price dropped from ${formatMoney(previous.currentPrice!, item.currency)} to ${formatMoney(item.currentPrice!, item.currency)}.`,
        rankDelta > 0 ? "Price drop and rank improvement appeared together; possible price-push ranking move." : "Meaningful price drop; ranking effect still needs observation.",
        "Record this price point and track rank movement over the next 3 days."
      );
    }

    if (!previous.couponText && item.couponText) {
      pushEvent(
        "coupon_start",
        rankDelta > 0 ? "high" : "medium",
        item,
        previous,
        `${item.asin} added coupon: ${item.couponText}.`,
        rankDelta > 0 ? "Coupon start and rank improvement appeared together; possible coupon-led push." : "Coupon started; likely conversion or promotion test.",
        "Watch coupon duration and rank lift."
      );
    } else if (previous.couponText && !item.couponText) {
      pushEvent(
        "coupon_end",
        rankDelta < 0 ? "medium" : "low",
        item,
        previous,
        `${item.asin} coupon ended; previous coupon was ${previous.couponText}.`,
        rankDelta < 0 ? "Rank dropped after coupon ended; possible promotion dependency." : "Coupon ended without obvious rank decay yet.",
        "Keep tracking the 3-day post-coupon rank path."
      );
    } else if (couponStrength(item) > couponStrength(previous)) {
      pushEvent(
        "coupon_increase",
        "medium",
        item,
        previous,
        `${item.asin} coupon strength increased.`,
        "Coupon got stronger; possible conversion lift or rank push attempt.",
        "Check whether Best Sellers rank keeps improving."
      );
    }

    if (!previous.dealBadge && item.dealBadge) {
      pushEvent(
        "deal_start",
        rankDelta > 0 ? "high" : "medium",
        item,
        previous,
        `${item.asin} added deal badge: ${item.dealBadge}.`,
        rankDelta > 0 ? "Deal and rank lift appeared together; possible activity push." : "Deal started; item is likely in an activity period.",
        "Record deal start date and compare rank during and after the activity."
      );
    } else if (previous.dealBadge && !item.dealBadge) {
      pushEvent(
        "deal_end",
        rankDelta < 0 ? "medium" : "low",
        item,
        previous,
        `${item.asin} deal ended; previous deal was ${previous.dealBadge}.`,
        rankDelta < 0 ? "Rank dropped after deal ended; possible activity dependency." : "Deal ended without clear rank decay yet.",
        "Observe whether rank falls back over the next 3 days."
      );
    }
  }

  for (const brand of input.brandMatrix) {
    if (brand.productCountTop100 < 3) {
      continue;
    }
    const activeCount = brand.rankUpCount + brand.newEntryCount;
    const activityCount = brand.couponCount + brand.dealCount + brand.priceDownCount;
    if (activeCount < 2 || activityCount < 2) {
      continue;
    }
    events.push({
      eventKey: `brand_matrix_push:${brand.brand}`,
      eventDate: input.date,
      eventType: "brand_matrix_push",
      eventLevel: brand.productCountTop20 >= 2 || brand.newEntryCount >= 2 ? "high" : "medium",
      categoryId: input.category.id,
      categoryName: input.category.name,
      marketplace: input.category.marketplace,
      asin: null,
      brand: brand.brand,
      title: null,
      priceBefore: null,
      priceAfter: null,
      priceChangeRate: null,
      couponBefore: null,
      couponAfter: null,
      dealType: null,
      rankBefore: null,
      rankAfter: brand.bestRank,
      rankChange: null,
      keywordRankBefore: null,
      keywordRankAfter: null,
      eventSummary: `${brand.brand} has ${brand.productCountTop100} Top100 ASINs; ${activeCount} are new or rising, and ${activityCount} have price/coupon/deal activity.`,
      possibleStrategy: "Possible brand matrix push across multiple ASINs.",
      suggestedAction: "Watch whether this brand expands Top50/Top20 share over the next 7 days."
    });
  }

  return events.sort((a, b) => eventPriority(b) - eventPriority(a));
}

export function buildCompetitorActionInsights(input: CompetitorActionInsightInput): CompetitorActionInsight[] {
  const insights = new Map<string, CompetitorActionInsight>();
  const changesByAsin = new Map<string, BsrRankChange>();

  for (const change of input.bsrChanges) {
    changesByAsin.set(actionInsightChangeKey(change), change);
    const rankMove = change.rankChange ?? 0;

    if (change.changeType === "new_entry" && change.currentRank !== null) {
      pushActionInsight(insights, {
        insightDate: input.date,
        sourceType: change.sourceType,
        sourceId: change.sourceId,
        sourceName: change.sourceName,
        previousDate: change.previousDate,
        marketplace: change.marketplace,
        category: change.category,
        asin: change.asin,
        brand: change.brand,
        title: change.title,
        insightType: "bsr_new_entry",
        confidence: change.currentRank <= 20 ? "high" : change.currentRank <= 50 ? "medium" : "low",
        currentRank: change.currentRank,
        previousRank: null,
        rankChange: null,
        price: change.currentPrice,
        productUrl: change.productUrl,
        evidence: `${change.asin} entered ${change.category} Best Sellers at #${change.currentRank}.`,
        inferredAction: "New listing, relaunch, promotion, ads, or external traffic may be pushing the product into the list.",
        suggestedResponse: change.currentRank <= 50 ? "Track this ASIN daily for 7 days and review price, coupon, deal, and keyword rank changes." : "Keep monitoring; promote to watchlist if rank keeps improving."
      });
      continue;
    }

    if (change.changeType === "rank_up" && rankMove >= 20 && change.currentRank !== null) {
      pushActionInsight(insights, {
        insightDate: input.date,
        sourceType: change.sourceType,
        sourceId: change.sourceId,
        sourceName: change.sourceName,
        previousDate: change.previousDate,
        marketplace: change.marketplace,
        category: change.category,
        asin: change.asin,
        brand: change.brand,
        title: change.title,
        insightType: "bsr_fast_rise",
        confidence: rankMove >= 50 || change.currentRank <= 20 ? "high" : "medium",
        currentRank: change.currentRank,
        previousRank: change.previousRank,
        rankChange: rankMove,
        price: change.currentPrice,
        productUrl: change.productUrl,
        evidence: `${change.asin} moved from #${change.previousRank} to #${change.currentRank}, up ${rankMove} places.`,
        inferredAction: "Fast BSR lift often points to a promotion, advertising push, off-site traffic, or demand spike.",
        suggestedResponse: "Check same-day price, coupon, deal, review, and keyword-rank signals, then compare the next 3-day rank path."
      });
      continue;
    }

    if (change.changeType === "rank_down" && rankMove <= -20 && change.previousRank !== null) {
      pushActionInsight(insights, {
        insightDate: input.date,
        sourceType: change.sourceType,
        sourceId: change.sourceId,
        sourceName: change.sourceName,
        previousDate: change.previousDate,
        marketplace: change.marketplace,
        category: change.category,
        asin: change.asin,
        brand: change.brand,
        title: change.title,
        insightType: "bsr_rank_drop",
        confidence: change.previousRank <= 20 ? "high" : "medium",
        currentRank: change.currentRank,
        previousRank: change.previousRank,
        rankChange: rankMove,
        price: change.currentPrice,
        productUrl: change.productUrl,
        evidence: `${change.asin} moved down ${Math.abs(rankMove)} places from #${change.previousRank} to #${change.currentRank}.`,
        inferredAction: "The product may have lost traffic, ended an activity, changed price, or faced stronger competitors.",
        suggestedResponse: "Use this as a decay signal and compare against activity end, price rise, stock, and review changes."
      });
      continue;
    }

    if (change.changeType === "dropped" && change.previousRank !== null) {
      pushActionInsight(insights, {
        insightDate: input.date,
        sourceType: change.sourceType,
        sourceId: change.sourceId,
        sourceName: change.sourceName,
        previousDate: change.previousDate,
        marketplace: change.marketplace,
        category: change.category,
        asin: change.asin,
        brand: change.brand,
        title: change.title,
        insightType: "bsr_dropped",
        confidence: change.previousRank <= 20 ? "high" : change.previousRank <= 50 ? "medium" : "low",
        currentRank: null,
        previousRank: change.previousRank,
        rankChange: null,
        price: change.currentPrice,
        productUrl: change.productUrl,
        evidence: `${change.asin} dropped out of ${change.category} after ranking #${change.previousRank}.`,
        inferredAction: "The product lost enough sales velocity to leave the tracked Best Sellers scope.",
        suggestedResponse: "Check whether this was activity-end decay, stock issue, price change, or a temporary Amazon ranking fluctuation."
      });
    }
  }

  for (const event of input.activityEvents ?? []) {
    if (event.eventType === "brand_matrix_push") {
      pushActionInsight(insights, {
        insightDate: input.date,
        sourceType: "category_bestseller",
        sourceId: event.categoryId,
        sourceName: event.categoryName,
        previousDate: null,
        marketplace: event.marketplace,
        category: event.categoryName,
        asin: null,
        brand: event.brand,
        title: null,
        insightType: "brand_push",
        confidence: event.eventLevel === "critical" || event.eventLevel === "high" ? "high" : "medium",
        currentRank: event.rankAfter,
        previousRank: event.rankBefore,
        rankChange: event.rankChange,
        price: null,
        productUrl: null,
        evidence: event.eventSummary,
        inferredAction: event.possibleStrategy,
        suggestedResponse: event.suggestedAction
      });
      continue;
    }

    if (!event.asin) {
      continue;
    }

    const insightType = activityEventInsightType(event.eventType);
    if (!insightType) {
      continue;
    }

    const change = changesByAsin.get(actionInsightChangeKeyFromEvent(event));
    const rankChange = change?.rankChange ?? event.rankChange ?? null;
    const currentRank = change?.currentRank ?? event.rankAfter;
    const previousRank = change?.previousRank ?? event.rankBefore;
    const hasRankLift = (rankChange ?? 0) > 0 || (previousRank === null && currentRank !== null);
    if (!hasRankLift) {
      continue;
    }

    pushActionInsight(insights, {
      insightDate: input.date,
      sourceType: "category_bestseller",
      sourceId: event.categoryId,
      sourceName: event.categoryName,
      previousDate: change?.previousDate ?? null,
      marketplace: event.marketplace,
      category: event.categoryName,
      asin: event.asin,
      brand: event.brand,
      title: event.title,
      insightType,
      confidence: activityEventInsightConfidence(event, currentRank, rankChange),
      currentRank,
      previousRank,
      rankChange,
      price: event.priceAfter,
      productUrl: change?.productUrl ?? amazonProductUrl(event.marketplace, event.asin),
      evidence: `${event.eventSummary} BSR path: ${formatRankPath(previousRank, currentRank)}.`,
      inferredAction: event.possibleStrategy,
      suggestedResponse: event.suggestedAction
    });
  }

  return Array.from(insights.values()).sort(compareActionInsights);
}

export function buildCategoryReportMarkdown(input: CategoryReportInput): string {
  const topBrands = input.brandMatrix
    .filter((brand) => brand.productCountTop100 > 0)
    .slice(0, 8)
    .map(
      (brand, index) =>
        `${index + 1}. ${brand.brand}: Top20 ${brand.productCountTop20}, Top50 ${brand.productCountTop50}, Top100 ${brand.productCountTop100}, best #${brand.bestRank ?? "-"}, new ${brand.newEntryCount}, activity ${brand.couponCount + brand.dealCount + brand.priceDownCount}`
    );
  const topSignals = input.signals
    .slice(0, 12)
    .map((signal) => `- [${signal.alertLevel}] ${signal.signalType} ${signal.asin ?? signal.brand ?? ""}: ${signal.content}`);
  const topEvents = (input.activityEvents ?? [])
    .slice(0, 12)
    .map(
      (event) =>
        `- [${event.eventLevel}] ${event.eventType} ${event.asin ?? event.brand ?? ""}: ${event.eventSummary} Action: ${event.suggestedAction}`
    );
  const newProducts = input.signals.filter((signal) => signal.signalType === "new_product_breakout");
  const activitySignals = input.signals.filter((signal) => ["price_drop", "new_coupon", "new_deal"].includes(signal.signalType));

  return [
    "# Amazon 类目竞品情报日报",
    "",
    `日期：${input.date}`,
    `类目：${input.category.name}`,
    `站点：${input.category.marketplace}`,
    `抓取范围：Top ${input.category.crawlTopN}`,
    "",
    "## 一、类目概览",
    `- 今日榜单 ASIN：${input.snapshots.length}`,
    `- 覆盖品牌数：${input.brandMatrix.filter((item) => item.productCountTop100 > 0).length}`,
    `- 榜单异动信号：${input.signals.length}`,
    `- 活动事件：${input.activityEvents?.length ?? 0}`,
    "",
    "## 二、品牌矩阵",
    ...(topBrands.length ? topBrands : ["- 暂无品牌矩阵数据"]),
    "",
    "## 三、竞品异动",
    ...(topSignals.length ? topSignals : ["- 暂无明显异动"]),
    "",
    "## 四、活动事件与策略判断",
    ...(topEvents.length ? topEvents : ["- 暂无活动事件"]),
    "",
    "## 五、新品爆发",
    ...renderCategorySignalLines(newProducts),
    "",
    "## 六、价格与促销",
    ...renderCategorySignalLines(activitySignals)
  ].join("\n");
}

export function analyzeDailyChanges(input: AnalyzeDailyChangesInput): DailyAnalysisResult {
  const todayByKey = new Map(input.today.map((item) => [snapshotKey(item), item]));
  const yesterdayByKey = new Map(input.yesterday.map((item) => [snapshotKey(item), item]));
  const analysisDate = input.today[0]?.snapshotDate ?? input.yesterday[0]?.snapshotDate ?? "";
  const changes: DailyChange[] = [];
  const alerts: AlertLog[] = [];

  const pushChange = (
    changeType: ChangeType,
    today: SerpSnapshot | null,
    yesterday: SerpSnapshot | null,
    alert?: Omit<AlertLog, "alertDate" | "keyword" | "asin" | "title" | "brand" | "status">
  ) => {
    const source = today ?? yesterday;
    if (!source) {
      return;
    }
    const priceChange =
      today?.currentPrice !== null &&
      today?.currentPrice !== undefined &&
      yesterday?.currentPrice !== null &&
      yesterday?.currentPrice !== undefined
        ? roundCurrency(today.currentPrice - yesterday.currentPrice)
        : null;
    const priceChangeRate =
      priceChange !== null && yesterday?.currentPrice ? roundRate(priceChange / yesterday.currentPrice) : null;
    const rankChange =
      today?.absoluteRank !== undefined && yesterday?.absoluteRank !== undefined
        ? yesterday.absoluteRank - today.absoluteRank
        : null;

    changes.push({
      asin: source.asin,
      keyword: source.keyword,
      marketplace: source.marketplace,
      snapshotDate: today?.snapshotDate ?? analysisDate,
      yesterdayRank: yesterday?.absoluteRank ?? null,
      todayRank: today?.absoluteRank ?? null,
      rankChange,
      yesterdayPrice: yesterday?.currentPrice ?? null,
      todayPrice: today?.currentPrice ?? null,
      priceChange,
      priceChangeRate,
      yesterdaySponsored: yesterday?.isSponsored ?? null,
      todaySponsored: today?.isSponsored ?? null,
      changeType,
      title: source.title,
      brand: source.brand
    });

    if (alert) {
      alerts.push({
        alertDate: today?.snapshotDate ?? analysisDate,
        keyword: source.keyword,
        asin: source.asin,
        title: source.title,
        brand: source.brand,
        status: "pending",
        ...alert
      });
    }
  };

  for (const today of input.today) {
    const yesterday = yesterdayByKey.get(snapshotKey(today)) ?? null;

    if (!yesterday) {
      pushChange("new_competitor", today, null, {
        alertType: "new_asin_entered",
        alertLevel: today.absoluteRank <= 20 ? "high" : "medium",
        alertContent: `${today.asin} 首次进入 ${today.keyword} 搜索结果，当前第 ${today.absoluteRank} 名。`,
        oldValue: null,
        newValue: String(today.absoluteRank)
      });
      continue;
    }

    if (today.currentPrice !== null && yesterday.currentPrice !== null) {
      const priceChange = roundCurrency(today.currentPrice - yesterday.currentPrice);
      const priceChangeRate = roundRate(priceChange / yesterday.currentPrice);
      if (priceChangeRate <= -0.05) {
        pushChange("price_drop", today, yesterday, {
          alertType: "significant_price_drop",
          alertLevel: "high",
          alertContent: `${today.asin} 价格从 ${formatMoney(yesterday.currentPrice, today.currency)} 降至 ${formatMoney(
            today.currentPrice,
            today.currency
          )}，降幅 ${formatPercent(Math.abs(priceChangeRate))}。`,
          oldValue: String(yesterday.currentPrice),
          newValue: String(today.currentPrice)
        });
      }
      if (priceChangeRate >= 0.1) {
        pushChange("price_rise", today, yesterday, {
          alertType: "significant_price_rise",
          alertLevel: "medium",
          alertContent: `${today.asin} 价格从 ${formatMoney(yesterday.currentPrice, today.currency)} 涨至 ${formatMoney(
            today.currentPrice,
            today.currency
          )}，涨幅 ${formatPercent(priceChangeRate)}。`,
          oldValue: String(yesterday.currentPrice),
          newValue: String(today.currentPrice)
        });
      }
      const lowestPrice = input.historyLowestPrices[today.asin];
      if (lowestPrice !== null && lowestPrice !== undefined && today.currentPrice < lowestPrice) {
        pushChange("historical_low", today, yesterday, {
          alertType: "historical_low",
          alertLevel: "high",
          alertContent: `${today.asin} 当前价格低于历史低价 ${formatMoney(lowestPrice, today.currency)}。`,
          oldValue: String(lowestPrice),
          newValue: String(today.currentPrice)
        });
      }
    }

    const hasTodayCoupon = Boolean(today.couponText);
    const hadYesterdayCoupon = Boolean(yesterday.couponText);

    if (!hadYesterdayCoupon && hasTodayCoupon) {
      pushChange("new_coupon", today, yesterday, {
        alertType: "new_coupon",
        alertLevel: "medium",
        alertContent: `${today.asin} 新增 Coupon：${today.couponText}。`,
        oldValue: null,
        newValue: today.couponText
      });
    } else if (hadYesterdayCoupon && !hasTodayCoupon) {
      pushChange("coupon_disappeared", today, yesterday, {
        alertType: "coupon_disappeared",
        alertLevel: "low",
        alertContent: `${today.asin} Coupon 消失。`,
        oldValue: yesterday.couponText,
        newValue: null
      });
    } else if (hadYesterdayCoupon && hasTodayCoupon) {
      if ((today.couponValue ?? 0) > (yesterday.couponValue ?? 0) || (today.couponRate ?? 0) > (yesterday.couponRate ?? 0)) {
        pushChange("coupon_strengthened", today, yesterday);
      }
      if ((today.couponValue ?? 0) < (yesterday.couponValue ?? 0) || (today.couponRate ?? 0) < (yesterday.couponRate ?? 0)) {
        pushChange("coupon_weakened", today, yesterday);
      }
    }

    const rankDelta = yesterday.absoluteRank - today.absoluteRank;
    if (today.absoluteRank <= 10 && yesterday.absoluteRank > 10) {
      pushChange("entered_top_10", today, yesterday, {
        alertType: "entered_top_10",
        alertLevel: "high",
        alertContent: `${today.asin} 从第 ${yesterday.absoluteRank} 名进入前 10，当前第 ${today.absoluteRank} 名。`,
        oldValue: String(yesterday.absoluteRank),
        newValue: String(today.absoluteRank)
      });
    } else if (today.absoluteRank <= 20 && yesterday.absoluteRank > 20) {
      pushChange("entered_top_20", today, yesterday, {
        alertType: "entered_top_20",
        alertLevel: "medium",
        alertContent: `${today.asin} 进入前 20，当前第 ${today.absoluteRank} 名。`,
        oldValue: String(yesterday.absoluteRank),
        newValue: String(today.absoluteRank)
      });
    }
    if (rankDelta > 10) {
      pushChange("rank_up", today, yesterday);
    }
    if (rankDelta < -10) {
      pushChange("rank_down", today, yesterday);
    }

    if (!yesterday.isSponsored && today.isSponsored) {
      pushChange("new_sponsored", today, yesterday, {
        alertType: "new_sponsored",
        alertLevel: today.absoluteRank <= 10 ? "high" : "medium",
        alertContent: `${today.asin} 新增 Sponsored 标识，当前综合排名第 ${today.absoluteRank}。`,
        oldValue: "false",
        newValue: "true"
      });
    }
    if (yesterday.isSponsored && !today.isSponsored) {
      pushChange("sponsored_disappeared", today, yesterday, {
        alertType: "sponsored_disappeared",
        alertLevel: "low",
        alertContent: `${today.asin} Sponsored 标识消失。`,
        oldValue: "true",
        newValue: "false"
      });
    }
  }

  for (const yesterday of input.yesterday) {
    if (!todayByKey.has(snapshotKey(yesterday))) {
      pushChange("dropped_competitor", null, yesterday, {
        alertType: "dropped_from_results",
        alertLevel: "medium",
        alertContent: `${yesterday.asin} 昨日出现在 ${yesterday.keyword}，今日未出现在采集结果中。`,
        oldValue: String(yesterday.absoluteRank),
        newValue: null
      });
    }
  }

  return { changes, alerts };
}

export function buildDailyReportMarkdown(input: DailyReportInput): string {
  const priceDrops = input.analysis.changes.filter((change) => change.changeType === "price_drop");
  const newCoupons = input.analysis.changes.filter((change) => change.changeType === "new_coupon");
  const rankingChanges = input.analysis.changes.filter((change) =>
    ["entered_top_10", "entered_top_20", "rank_up", "rank_down"].includes(change.changeType)
  );
  const newCompetitors = input.analysis.changes.filter((change) => change.changeType === "new_competitor");
  const adChanges = input.analysis.changes.filter((change) =>
    ["new_sponsored", "sponsored_disappeared"].includes(change.changeType)
  );

  return [
    "# Amazon 关键词竞品监控日报",
    "",
    `日期：${input.date}`,
    `关键词：${input.keyword}`,
    "",
    "## 一、今日重点变化",
    renderChangeList("明显降价", priceDrops),
    renderChangeList("新增 Coupon", newCoupons),
    "",
    "## 二、排名变化",
    renderChangeList("排名异动", rankingChanges),
    "",
    "## 三、新竞品进入",
    renderChangeList("新 ASIN", newCompetitors),
    "",
    "## 四、广告位变化",
    renderChangeList("广告位", adChanges),
    "",
    "## 五、关键词价格带变化",
    `- 样本数：${input.priceBand.count}`,
    `- 最低价：${formatNullableMoney(input.priceBand.minPrice)}`,
    `- 最高价：${formatNullableMoney(input.priceBand.maxPrice)}`,
    `- 均价：${formatNullableMoney(input.priceBand.averagePrice)}`,
    "",
    "## 六、采集异常",
    ...(input.failedKeywords?.length ? input.failedKeywords.map((keyword) => `- ${keyword}`) : ["- 无"])
  ].join("\n");
}

function renderChangeList(title: string, changes: DailyChange[]): string {
  if (changes.length === 0) {
    return [`### ${title}`, "- 无"].join("\n");
  }
  return [
    `### ${title}`,
    ...changes.slice(0, 8).map((change) => {
      const rankText =
        change.todayRank !== null
          ? `当前排名：第 ${change.todayRank} 名`
          : change.yesterdayRank !== null
            ? `昨日排名：第 ${change.yesterdayRank} 名`
            : "排名：无";
      const priceText =
        change.todayPrice !== null
          ? `当前价格：${formatNullableMoney(change.todayPrice)}`
          : `昨日价格：${formatNullableMoney(change.yesterdayPrice)}`;
      return `- ASIN ${change.asin}：${change.title}，${rankText}，${priceText}`;
    })
  ].join("\n");
}

function snapshotKey(item: Pick<SerpSnapshot, "asin" | "keyword" | "marketplace">): string {
  return `${item.marketplace}::${item.keyword}::${item.asin}`;
}

function normalizeBrand(brand: string | null): string {
  return brand?.trim() || "Unknown";
}

function topBoundary(rank: number): number {
  if (rank <= 20) return 20;
  if (rank <= 50) return 50;
  return 100;
}

function couponStrength(item: { couponValue?: NullableNumber; couponRate?: NullableNumber; couponText?: string | null } | null): number {
  if (!item) {
    return 0;
  }
  if (item.couponValue !== null && item.couponValue !== undefined) {
    return item.couponValue;
  }
  if (item.couponRate !== null && item.couponRate !== undefined) {
    return item.couponRate * 100;
  }
  const parsed = parseCoupon(item.couponText);
  return parsed.couponValue ?? (parsed.couponRate ? parsed.couponRate * 100 : 0);
}

function eventPriority(event: CompetitorActivityEvent): number {
  const levelScore: Record<AlertLevel, number> = { critical: 400, high: 300, medium: 200, low: 100 };
  const typeScore: Record<ActivityEventType, number> = {
    brand_matrix_push: 30,
    new_entry_top50: 28,
    rank_surge: 26,
    price_drop: 24,
    coupon_start: 22,
    deal_start: 22,
    activity_end_rank_drop: 20,
    new_entry_top100: 18,
    coupon_increase: 16,
    coupon_end: 12,
    deal_end: 12
  };
  return levelScore[event.eventLevel] + typeScore[event.eventType] - (event.rankAfter ?? 999) / 1000;
}

function pushActionInsight(map: Map<string, CompetitorActionInsight>, insight: CompetitorActionInsight): void {
  map.set(actionInsightKey(insight), insight);
}

function actionInsightKey(insight: CompetitorActionInsight): string {
  const targetKey = insight.asin ?? `brand:${insight.brand ?? ""}`;
  return [
    insight.insightDate,
    insight.sourceType,
    insight.sourceId ?? "",
    insight.category,
    targetKey,
    insight.insightType
  ].join("|");
}

function actionInsightChangeKey(change: BsrRankChange): string {
  return [change.sourceType, change.sourceId ?? "", change.marketplace, change.category, change.asin].join("|");
}

function actionInsightChangeKeyFromEvent(event: CompetitorActivityEvent): string {
  return ["category_bestseller", event.categoryId, event.marketplace, event.categoryName, event.asin ?? ""].join("|");
}

function activityEventInsightType(eventType: ActivityEventType): CompetitorActionInsightType | null {
  if (eventType === "price_drop") return "price_drop_rank_lift";
  if (eventType === "coupon_start" || eventType === "coupon_increase") return "coupon_rank_lift";
  if (eventType === "deal_start") return "deal_rank_lift";
  return null;
}

function activityEventInsightConfidence(
  event: CompetitorActivityEvent,
  currentRank: NullableNumber,
  rankChange: NullableNumber
): CompetitorActionInsightConfidence {
  if (event.eventLevel === "critical" || event.eventLevel === "high" || (currentRank !== null && currentRank <= 20) || (rankChange ?? 0) >= 20) {
    return "high";
  }
  if (event.eventLevel === "medium" || (currentRank !== null && currentRank <= 50)) {
    return "medium";
  }
  return "low";
}

function compareActionInsights(a: CompetitorActionInsight, b: CompetitorActionInsight): number {
  const confidenceScore: Record<CompetitorActionInsightConfidence, number> = { high: 3, medium: 2, low: 1 };
  const typeScore: Record<CompetitorActionInsightType, number> = {
    brand_push: 80,
    price_drop_rank_lift: 70,
    coupon_rank_lift: 68,
    deal_rank_lift: 68,
    bsr_new_entry: 60,
    bsr_fast_rise: 58,
    bsr_dropped: 45,
    bsr_rank_drop: 40
  };
  return (
    confidenceScore[b.confidence] - confidenceScore[a.confidence] ||
    typeScore[b.insightType] - typeScore[a.insightType] ||
    (a.currentRank ?? a.previousRank ?? 999999) - (b.currentRank ?? b.previousRank ?? 999999) ||
    (a.asin ?? a.brand ?? "").localeCompare(b.asin ?? b.brand ?? "")
  );
}

function formatRankPath(previousRank: NullableNumber, currentRank: NullableNumber): string {
  const previous = previousRank === null ? "not ranked" : `#${previousRank}`;
  const current = currentRank === null ? "not ranked" : `#${currentRank}`;
  return `${previous} -> ${current}`;
}

function amazonProductUrl(marketplace: string, asin: string): string {
  const domain = marketplace.includes(".") ? marketplace : "www.amazon.com";
  return `https://${domain}/dp/${asin}`;
}

function renderCategorySignalLines(signals: CategorySignalLog[]): string[] {
  return signals.length ? signals.slice(0, 8).map((signal) => `- ${signal.asin ?? "-"}：${signal.content}`) : ["- 暂无"];
}

function formatMoney(value: number, currency = "$"): string {
  return `${currency}${roundCurrency(value).toFixed(2)}`;
}

function formatNullableMoney(value: NullableNumber): string {
  return value === null ? "无" : formatMoney(value);
}

function formatPercent(value: number): string {
  return `${roundCurrency(value * 100).toFixed(1)}%`;
}

export function isoDate(date = new Date(), timezone = "Asia/Shanghai"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
