import type {
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  BrandPlaybookActivityFrequency,
  BrandPlaybookAsinCountChanges,
  BrandPlaybookCouponIntensity,
  BrandPlaybookNewProductFrequency,
  BrandPlaybookPriceBand,
  BrandPlaybookProfile,
  BrandPlaybookStrongAsin,
  BrandPlaybookSurgeCycle,
  CompetitorActivityEvent,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import { isoDateOffset } from "../store/date-utils.js";
import type { Store } from "../store.js";

export interface BrandPlaybookInput {
  categoryId: number;
  brand: string;
  date: string;
  windowDays?: number;
}

interface StrongAsinAccumulator {
  asin: string;
  title: string;
  productUrl: string | null;
  imageUrl: string | null;
  bestRank: number | null;
  latestRank: number | null;
  latestDate: string;
  daysInTop20: number;
  daysInTop50: number;
  latestPrice: number | null;
  latestReviewCount: number | null;
}

const defaultWindowDays = 30;
const maxWindowDays = 180;
const topStrongAsinLimit = 5;

export function buildBrandPlaybookProfile(store: Store, input: BrandPlaybookInput): BrandPlaybookProfile | null {
  const category = store.getCategoryMonitor(input.categoryId);
  if (!category) {
    return null;
  }

  const windowDays = clampWindowDays(input.windowDays ?? defaultWindowDays);
  const dates = dateWindow(input.date, windowDays);
  const brandKey = normalizeBrand(input.brand);
  const matrices: BrandMatrixSnapshot[] = [];
  const snapshots: BestsellerRankSnapshot[] = [];
  const priceRows: ProductPriceHistory[] = [];
  const activityEvents: CompetitorActivityEvent[] = [];

  for (const date of dates) {
    matrices.push(...store.listBrandMatrix({ categoryId: input.categoryId, date }).filter((item) => normalizeBrand(item.brand) === brandKey));
    snapshots.push(...store.listCategorySnapshots({ categoryId: input.categoryId, date, limit: 1000 }).filter((item) => normalizeBrand(item.brand) === brandKey));
    priceRows.push(...store.listProductPriceHistory({ categoryId: input.categoryId, date, limit: 1000 }).filter((item) => normalizeBrand(item.brand) === brandKey));
    activityEvents.push(...store.listCategoryActivityEvents({ categoryId: input.categoryId, date, limit: 1000 }).filter((item) => normalizeBrand(item.brand) === brandKey));
  }

  const evidenceDates = new Set<string>();
  for (const item of matrices) evidenceDates.add(item.snapshotDate);
  for (const item of snapshots) evidenceDates.add(item.snapshotDate);
  for (const item of priceRows) evidenceDates.add(item.snapshotDate);
  for (const item of activityEvents) evidenceDates.add(item.eventDate);

  const latestMatrix = latestByDate(matrices, (item) => item.snapshotDate);
  const latestSnapshot = latestByDate(snapshots, (item) => item.snapshotDate);
  const latestPrice = latestByDate(priceRows, (item) => item.snapshotDate);
  const latestEvent = latestByDate(activityEvents, (item) => item.eventDate);
  const latestEvidenceDate = latestString(Array.from(evidenceDates));

  return {
    categoryId: input.categoryId,
    categoryName: latestMatrix?.categoryName ?? latestSnapshot?.categoryName ?? latestPrice?.categoryName ?? latestEvent?.categoryName ?? category.name,
    marketplace: latestMatrix?.marketplace ?? latestSnapshot?.marketplace ?? latestPrice?.marketplace ?? latestEvent?.marketplace ?? category.marketplace,
    brand: latestMatrix?.brand ?? latestSnapshot?.brand ?? latestPrice?.brand ?? latestEvent?.brand ?? input.brand,
    endDate: input.date,
    windowDays,
    observedDays: evidenceDates.size,
    latestEvidenceDate,
    commonPriceBand: buildPriceBand(priceRows),
    couponIntensity: buildCouponIntensity(priceRows, activityEvents),
    activityFrequency: buildActivityFrequency(activityEvents, windowDays),
    asinCountChanges: buildAsinCountChanges(matrices, snapshots),
    newProductLaunchFrequency: buildNewProductFrequency(matrices, activityEvents, windowDays),
    surgeCycle: buildSurgeCycle(matrices, activityEvents),
    historicalStrongAsins: buildStrongAsins(snapshots),
    evidenceItems: buildEvidenceItems(dates[0], input.date, matrices, snapshots, priceRows, activityEvents)
  };
}

function buildPriceBand(rows: ProductPriceHistory[]): BrandPlaybookPriceBand {
  const prices = rows.map(priceForBand).filter(isPositiveNumber).sort((left, right) => left - right);
  return {
    sampleSize: prices.length,
    minPrice: prices[0] ?? null,
    maxPrice: prices.length ? prices[prices.length - 1] : null,
    averagePrice: average(prices),
    medianPrice: median(prices)
  };
}

function buildCouponIntensity(rows: ProductPriceHistory[], events: CompetitorActivityEvent[]): BrandPlaybookCouponIntensity {
  const activeRows = rows.filter(hasCoupon);
  const discountValues = activeRows.map((row) => row.couponValue).filter(isPositiveNumber);
  const discountRates = activeRows.map((row) => row.couponRate).filter(isPositiveNumber);
  return {
    sampleSize: rows.length,
    activeAsinDays: activeRows.length,
    activeRate: rows.length ? round(activeRows.length / rows.length, 4) : null,
    couponEventCount: events.filter(isCouponEvent).length,
    averageDiscountValue: average(discountValues),
    averageDiscountRate: average(discountRates)
  };
}

function buildActivityFrequency(events: CompetitorActivityEvent[], windowDays: number): BrandPlaybookActivityFrequency {
  return {
    totalEvents: events.length,
    dailyAverage: round(events.length / windowDays, 2),
    rankSurgeCount: countEvents(events, ["rank_surge"]),
    priceDropCount: countEvents(events, ["price_drop"]),
    couponEventCount: events.filter(isCouponEvent).length,
    dealEventCount: countEvents(events, ["deal_start", "deal_end"]),
    reviewGrowthCount: countEvents(events, ["review_growth"]),
    brandMatrixPushCount: countEvents(events, ["brand_matrix_push"]),
    brandMatrixDropCount: countEvents(events, ["brand_matrix_drop"])
  };
}

function buildAsinCountChanges(matrices: BrandMatrixSnapshot[], snapshots: BestsellerRankSnapshot[]): BrandPlaybookAsinCountChanges {
  const sortedMatrices = [...matrices].sort((left, right) => left.snapshotDate.localeCompare(right.snapshotDate));
  const firstMatrix = sortedMatrices[0] ?? null;
  const latestMatrix = sortedMatrices[sortedMatrices.length - 1] ?? null;
  if (firstMatrix && latestMatrix) {
    return {
      firstSnapshotDate: firstMatrix.snapshotDate,
      latestSnapshotDate: latestMatrix.snapshotDate,
      firstTop100Count: firstMatrix.productCountTop100,
      latestTop100Count: latestMatrix.productCountTop100,
      top100Change: latestMatrix.productCountTop100 - firstMatrix.productCountTop100,
      latestTop50Count: latestMatrix.productCountTop50,
      latestTop20Count: latestMatrix.productCountTop20
    };
  }

  const snapshotCounts = countSnapshotsByDate(snapshots);
  const dates = Array.from(snapshotCounts.keys()).sort();
  const firstDate = dates[0] ?? null;
  const latestDate = dates[dates.length - 1] ?? null;
  const firstCounts = firstDate ? snapshotCounts.get(firstDate) ?? null : null;
  const latestCounts = latestDate ? snapshotCounts.get(latestDate) ?? null : null;
  return {
    firstSnapshotDate: firstDate,
    latestSnapshotDate: latestDate,
    firstTop100Count: firstCounts?.top100 ?? null,
    latestTop100Count: latestCounts?.top100 ?? null,
    top100Change: firstCounts && latestCounts ? latestCounts.top100 - firstCounts.top100 : null,
    latestTop50Count: latestCounts?.top50 ?? null,
    latestTop20Count: latestCounts?.top20 ?? null
  };
}

function buildNewProductFrequency(
  matrices: BrandMatrixSnapshot[],
  events: CompetitorActivityEvent[],
  windowDays: number
): BrandPlaybookNewProductFrequency {
  const matrixNewEntryCount = matrices.reduce((sum, item) => sum + item.newEntryCount, 0);
  const newEntryEvents = events.filter((event) => event.eventType === "new_entry_top100" || event.eventType === "new_entry_top50");
  const dates = new Set<string>();
  for (const item of matrices) {
    if (item.newEntryCount > 0) dates.add(item.snapshotDate);
  }
  for (const event of newEntryEvents) {
    dates.add(event.eventDate);
  }
  const newEntryCount = matrixNewEntryCount > 0 ? matrixNewEntryCount : newEntryEvents.length;
  return {
    newEntryCount,
    newEntryDays: dates.size,
    dailyAverage: round(newEntryCount / windowDays, 2)
  };
}

function buildSurgeCycle(matrices: BrandMatrixSnapshot[], events: CompetitorActivityEvent[]): BrandPlaybookSurgeCycle {
  const surgeDates = new Set<string>();
  const dropDates = new Set<string>();
  for (const item of matrices) {
    if (item.rankUpCount > 0 && item.rankUpCount >= item.rankDownCount) surgeDates.add(item.snapshotDate);
    if (item.rankDownCount > 0 && item.rankDownCount > item.rankUpCount) dropDates.add(item.snapshotDate);
  }
  for (const event of events) {
    if (event.eventType === "brand_matrix_push" || event.eventType === "rank_surge") surgeDates.add(event.eventDate);
    if (event.eventType === "brand_matrix_drop" || event.eventType === "activity_end_rank_drop") dropDates.add(event.eventDate);
  }
  return {
    surgeDays: surgeDates.size,
    dropDays: dropDates.size,
    lastSurgeDate: latestString(Array.from(surgeDates)),
    lastDropDate: latestString(Array.from(dropDates))
  };
}

function buildStrongAsins(snapshots: BestsellerRankSnapshot[]): BrandPlaybookStrongAsin[] {
  const byAsin = new Map<string, StrongAsinAccumulator>();
  for (const item of snapshots) {
    const current = byAsin.get(item.asin) ?? {
      asin: item.asin,
      title: item.title,
      productUrl: item.productUrl,
      imageUrl: item.imageUrl,
      bestRank: null,
      latestRank: null,
      latestDate: "",
      daysInTop20: 0,
      daysInTop50: 0,
      latestPrice: null,
      latestReviewCount: null
    };
    current.bestRank = current.bestRank === null ? item.rank : Math.min(current.bestRank, item.rank);
    if (item.rank <= 20) current.daysInTop20 += 1;
    if (item.rank <= 50) current.daysInTop50 += 1;
    if (item.snapshotDate >= current.latestDate) {
      current.title = item.title;
      current.productUrl = item.productUrl;
      current.imageUrl = item.imageUrl;
      current.latestRank = item.rank;
      current.latestDate = item.snapshotDate;
      current.latestPrice = item.currentPrice;
      current.latestReviewCount = item.reviewCount;
    }
    byAsin.set(item.asin, current);
  }

  return Array.from(byAsin.values())
    .sort((left, right) => {
      const top20 = right.daysInTop20 - left.daysInTop20;
      if (top20 !== 0) return top20;
      const bestRank = (left.bestRank ?? Number.POSITIVE_INFINITY) - (right.bestRank ?? Number.POSITIVE_INFINITY);
      if (bestRank !== 0) return bestRank;
      return right.daysInTop50 - left.daysInTop50;
    })
    .slice(0, topStrongAsinLimit)
    .map(({ latestDate: _latestDate, ...item }) => item);
}

function buildEvidenceItems(
  startDate: string,
  endDate: string,
  matrices: BrandMatrixSnapshot[],
  snapshots: BestsellerRankSnapshot[],
  priceRows: ProductPriceHistory[],
  events: CompetitorActivityEvent[]
): string[] {
  const matrixDays = new Set(matrices.map((item) => item.snapshotDate)).size;
  const snapshotDays = new Set(snapshots.map((item) => item.snapshotDate)).size;
  const eventDays = new Set(events.map((item) => item.eventDate)).size;
  return [
    `Window ${startDate} to ${endDate}`,
    `${matrixDays} brand-matrix days, ${snapshotDays} bestseller snapshot days`,
    `${priceRows.length} price-history ASIN-day rows`,
    `${events.length} activity events across ${eventDays} days`
  ];
}

function countSnapshotsByDate(snapshots: BestsellerRankSnapshot[]): Map<string, { top100: number; top50: number; top20: number }> {
  const counts = new Map<string, { top100: Set<string>; top50: Set<string>; top20: Set<string> }>();
  for (const item of snapshots) {
    const current = counts.get(item.snapshotDate) ?? { top100: new Set<string>(), top50: new Set<string>(), top20: new Set<string>() };
    if (item.rank <= 100) current.top100.add(item.asin);
    if (item.rank <= 50) current.top50.add(item.asin);
    if (item.rank <= 20) current.top20.add(item.asin);
    counts.set(item.snapshotDate, current);
  }
  return new Map(Array.from(counts.entries()).map(([date, value]) => [date, {
    top100: value.top100.size,
    top50: value.top50.size,
    top20: value.top20.size
  }]));
}

function dateWindow(endDate: string, windowDays: number): string[] {
  const startOffset = -(windowDays - 1);
  return Array.from({ length: windowDays }, (_value, index) => isoDateOffset(endDate, startOffset + index));
}

function clampWindowDays(value: number): number {
  if (!Number.isFinite(value)) return defaultWindowDays;
  return Math.max(1, Math.min(maxWindowDays, Math.trunc(value)));
}

function normalizeBrand(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

function latestByDate<T>(items: T[], getDate: (item: T) => string): T | null {
  let latest: T | null = null;
  for (const item of items) {
    if (!latest || getDate(item) > getDate(latest)) {
      latest = item;
    }
  }
  return latest;
}

function latestString(values: string[]): string | null {
  return values.length ? [...values].sort().at(-1) ?? null : null;
}

function priceForBand(row: ProductPriceHistory): number | null {
  return row.finalEstimatedPrice ?? row.currentPrice;
}

function hasCoupon(row: ProductPriceHistory): boolean {
  return Boolean(row.couponText) || Boolean(row.couponValue && row.couponValue > 0) || Boolean(row.couponRate && row.couponRate > 0);
}

function isCouponEvent(event: CompetitorActivityEvent): boolean {
  return event.eventType === "coupon_start" || event.eventType === "coupon_end" || event.eventType === "coupon_increase";
}

function countEvents(events: CompetitorActivityEvent[], types: CompetitorActivityEvent["eventType"][]): number {
  const set = new Set(types);
  return events.filter((event) => set.has(event.eventType)).length;
}

function isPositiveNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 0) {
    return round(((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2, 2);
  }
  return values[middle] ?? null;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}