import type {
  BestsellerRankSnapshot,
  CompetitorPoolItem,
  CompetitorSnapshotEvidence,
  ProductActivityCalendar,
  SerpSnapshot
} from "@amazon-monitor/shared";
import { isoDate } from "../pipeline.js";
import type { Store } from "../store.js";

export interface CompetitorSnapshotQuery {
  date?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export function listCompetitorSnapshotEvidence(
  store: Store,
  competitor: CompetitorPoolItem,
  query: CompetitorSnapshotQuery = {}
): CompetitorSnapshotEvidence[] {
  const requested = Math.min((query.limit ?? 100) + (query.offset ?? 0), 1000);
  const common = {
    orgId: competitor.orgId,
    date: query.date,
    asin: competitor.asin,
    marketplace: competitor.marketplace,
    startDate: query.startDate,
    endDate: query.endDate,
    limit: requested
  };
  const keywordSnapshots = store.listSnapshots(common).map((item) => mapKeywordSnapshot(competitor.id, item));
  const categorySnapshots = store.listCategorySnapshots(common).map((item) => mapCategorySnapshot(competitor.id, item));
  const evidence = [...keywordSnapshots, ...categorySnapshots].sort(compareSnapshotEvidence);
  const offset = query.offset ?? 0;
  return evidence.slice(offset, offset + (query.limit ?? 100));
}

export function getCompetitorTimeline(
  store: Store,
  competitor: CompetitorPoolItem,
  query: { date?: string; limitDays?: number } = {}
): ProductActivityCalendar {
  const limitDays = Math.max(1, Math.min(query.limitDays ?? 90, 180));
  const endDate = query.date ?? isoDate();
  const startDate = offsetIsoDate(endDate, -(limitDays - 1));
  const calendar = store.getProductActivityCalendar(competitor.asin, {
    orgId: competitor.orgId,
    marketplace: competitor.marketplace,
    date: query.date,
    limitDays
  }) ?? emptyTimeline(competitor);
  const insightEvents = store.listInsightEvents({
    orgId: competitor.orgId,
    asin: competitor.asin,
    limit: 1000
  }).filter((event) => event.eventDate >= startDate && event.eventDate <= endDate);

  return {
    ...calendar,
    summary: {
      ...calendar.summary,
      eventCount: calendar.summary.eventCount + insightEvents.length
    },
    insightEvents
  };
}

function mapKeywordSnapshot(competitorId: number, item: SerpSnapshot): CompetitorSnapshotEvidence {
  return {
    id: `keyword:${item.id ?? `${item.keywordId}:${item.snapshotDate}:${item.absoluteRank}`}`,
    competitorId,
    sourceType: "keyword",
    sourceId: item.keywordId,
    sourceName: item.keyword,
    snapshotDate: item.snapshotDate,
    asin: item.asin,
    marketplace: item.marketplace,
    title: item.title,
    brand: item.brand,
    imageUrl: item.imageUrl,
    productUrl: item.productUrl,
    rank: item.absoluteRank,
    organicRank: item.organicRank,
    sponsoredRank: item.sponsoredRank,
    bsrRank: item.bsrRank,
    bsrCategory: item.bsrCategory,
    currentPrice: item.currentPrice,
    finalEstimatedPrice: item.finalEstimatedPrice,
    currency: item.currency,
    rating: item.rating,
    reviewCount: item.reviewCount,
    couponText: item.couponText,
    dealBadge: item.dealBadge,
    dataSource: item.dataSource ?? "legacy",
    lastSyncedAt: item.lastSyncedAt ?? null,
    syncStatus: item.syncStatus ?? "manual"
  };
}

function mapCategorySnapshot(competitorId: number, item: BestsellerRankSnapshot): CompetitorSnapshotEvidence {
  return {
    id: `category:${item.id ?? `${item.categoryId}:${item.snapshotDate}:${item.rank}`}`,
    competitorId,
    sourceType: "category",
    sourceId: item.categoryId,
    sourceName: item.categoryName,
    snapshotDate: item.snapshotDate,
    asin: item.asin,
    marketplace: item.marketplace,
    title: item.title,
    brand: item.brand,
    imageUrl: item.imageUrl,
    productUrl: item.productUrl,
    rank: item.rank,
    organicRank: null,
    sponsoredRank: null,
    bsrRank: item.bsrRank,
    bsrCategory: item.bsrCategory,
    currentPrice: item.currentPrice,
    finalEstimatedPrice: item.finalEstimatedPrice,
    currency: item.currency,
    rating: item.rating,
    reviewCount: item.reviewCount,
    couponText: item.couponText,
    dealBadge: item.dealBadge,
    dataSource: item.dataSource ?? "legacy",
    lastSyncedAt: item.lastSyncedAt ?? null,
    syncStatus: item.syncStatus ?? "manual"
  };
}

function compareSnapshotEvidence(a: CompetitorSnapshotEvidence, b: CompetitorSnapshotEvidence): number {
  return b.snapshotDate.localeCompare(a.snapshotDate)
    || a.sourceType.localeCompare(b.sourceType)
    || a.sourceId - b.sourceId
    || a.rank - b.rank;
}

function emptyTimeline(competitor: CompetitorPoolItem): ProductActivityCalendar {
  return {
    asin: competitor.asin,
    marketplace: competitor.marketplace,
    title: competitor.title,
    brand: competitor.brand,
    imageUrl: competitor.imageUrl || null,
    productUrl: competitor.latestProductUrl || null,
    summary: {
      firstSeenDate: competitor.firstSeenDate || null,
      lastSeenDate: competitor.lastSeenDate || null,
      activeDays: 0,
      bestCategoryRank: competitor.latestCategoryRank,
      latestCategoryRank: competitor.latestCategoryRank,
      bestKeywordRank: competitor.bestRank,
      latestKeywordRank: competitor.latestRank,
      priceLow: competitor.lowestPrice,
      priceHigh: competitor.latestPrice,
      latestReviewCount: competitor.latestReviewCount ?? null,
      reviewCountChange: null,
      eventCount: 0
    },
    days: [],
    insightEvents: []
  };
}

function offsetIsoDate(date: string, offsetDays: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}
