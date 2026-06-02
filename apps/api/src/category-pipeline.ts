import {
  analyzeCategorySignals,
  buildCompetitorActionInsights,
  buildCategoryActivityEvents,
  buildBrandMatrixSnapshots,
  buildCategoryReportMarkdown,
  decorateBestsellerSnapshots,
  describeRankCoverageGaps,
  type BsrRankHistory,
  type BestSellerProductInput,
  type CategoryMonitor,
  type CollectTaskLog
} from "@amazon-monitor/shared";
import { PlaywrightAmazonBestSellerCollector, runLimitedConcurrency } from "./amazon-collector.js";
import type { Store } from "./store.js";
import { isoDate } from "./pipeline.js";

export interface CollectedBestSellerPage {
  pageNo: number;
  products: BestSellerProductInput[];
  url: string;
}

export interface AmazonBestSellerCollector {
  collect(category: CategoryMonitor, date: string): Promise<CollectedBestSellerPage[]>;
}

export interface CategoryCollectionOptions {
  collector?: AmazonBestSellerCollector;
}

const defaultCategoryCollector = new PlaywrightAmazonBestSellerCollector();

class StrictBsrCountError extends Error {
  actualCount: number;
  expectedCount: number;
  uniqueAsinCount: number;
  uniqueRankCount: number;
  minRank: number | null;
  maxRank: number | null;
  pageCount: number;

  constructor(category: CategoryMonitor, pages: CollectedBestSellerPage[], products: BestSellerProductInput[], reason?: string) {
    const pageCounts = pages.map((page) => `p${page.pageNo}=${page.products.length}`).join(", ") || "none";
    const ranks = products.map((product) => product.rank);
    const detail = describeRankCoverageGaps(ranks, category.crawlTopN);
    const strictReason = reason ?? `expected ${category.crawlTopN}, collected ${products.length}.${detail ? ` ${detail}` : ""}`;
    super(`Amazon Best Sellers strict count failed for "${category.name}": ${strictReason}. Page counts: ${pageCounts}.`);
    this.actualCount = products.length;
    this.expectedCount = category.crawlTopN;
    this.uniqueAsinCount = new Set(products.map((product) => product.asin)).size;
    this.uniqueRankCount = new Set(ranks).size;
    this.minRank = ranks.length ? Math.min(...ranks) : null;
    this.maxRank = ranks.length ? Math.max(...ranks) : null;
    this.pageCount = pages.length;
  }
}

export async function runCategoryCollectionForAll(
  store: Store,
  date = isoDate(),
  options: CategoryCollectionOptions = {}
): Promise<CollectTaskLog[]> {
  const logs: CollectTaskLog[] = [];
  const categories = store.listCategoryMonitors().filter((category) => category.status === "enabled");

  logs.push(
    ...(await runLimitedConcurrency(categories, categoryCollectionConcurrency(), (category) =>
      runCategoryCollectionForMonitor(store, category.id, date, options)
    ))
  );

  return logs;
}

export async function runCategoryCollectionForMonitor(
  store: Store,
  categoryId: number,
  date = isoDate(),
  options: CategoryCollectionOptions = {}
): Promise<CollectTaskLog> {
  const category = store.getCategoryMonitor(categoryId);
  if (!category) {
    throw new Error(`Category monitor ${categoryId} not found`);
  }

  const startTime = new Date().toISOString();
  const collector = options.collector ?? defaultCategoryCollector;

  try {
    const pages = await collector.collect(category, date);
    const products = dedupeProductsByAsin(
      pages
        .reduce<{ items: BestSellerProductInput[]; seenCount: number }>(
          (state, page) => {
            const normalized = normalizeBestSellerPageRanks(page.products, state.seenCount);
            return {
              items: [...state.items, ...normalized],
              seenCount: state.seenCount + normalized.length
            };
          },
          { items: [], seenCount: 0 }
        )
        .items
        .filter((product) => product.rank >= 1)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, category.crawlTopN)
    );
    if (products.length < category.crawlTopN) {
      throw new StrictBsrCountError(category, pages, products);
    }
    const rankCoverageIssue = strictBsrRankCoverageIssue(products, category.crawlTopN);
    if (rankCoverageIssue) {
      throw new StrictBsrCountError(category, pages, products, rankCoverageIssue);
    }
    const snapshots = decorateBestsellerSnapshots({
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      snapshotDate: date,
      products
    });

    if (snapshots.length === 0) {
      throw new Error(`No Amazon Best Sellers products collected for "${category.name}".`);
    }

    const previous = store.getPreviousCategorySnapshots(category.id, date);
    const brandMatrix = buildBrandMatrixSnapshots({
      category,
      date,
      today: snapshots,
      yesterday: previous
    });
    const signals = analyzeCategorySignals({
      category,
      date,
      today: snapshots,
      yesterday: previous
    });
    const activityEvents = buildCategoryActivityEvents({
      category,
      date,
      today: snapshots,
      yesterday: previous,
      brandMatrix
    });
    const report = buildCategoryReportMarkdown({
      date,
      category,
      snapshots,
      brandMatrix,
      signals,
      activityEvents
    });

    store.deleteCategorySnapshotsForDate(category.id, date);
    store.insertCategorySnapshots(snapshots);
    store.replaceBsrRankHistoryForDate({
      sourceType: "category_bestseller",
      sourceId: category.id,
      date,
      items: buildCategoryBsrRankHistory(category, snapshots)
    });
    store.replaceCompetitorActionInsights({
      sourceType: "category_bestseller",
      sourceId: category.id,
      date,
      items: buildCompetitorActionInsights({
        date,
        bsrChanges: store.listBsrRankChanges({ date, sourceType: "category_bestseller", sourceId: category.id }),
        activityEvents
      })
    });
    store.upsertProductMasterFromCategorySnapshots(snapshots);
    store.upsertCompetitorsFromCategorySnapshots(snapshots, activityEvents);
    store.replaceProductPriceHistoryForDate(category.id, date, snapshots);
    store.replaceBrandMatrix(category.id, date, brandMatrix);
    store.replaceCategorySignals(category.id, date, signals);
    store.replaceCategoryActivityEvents(category.id, date, activityEvents);
    store.saveCategoryReport(date, category.id, report);

    const log = store.insertTaskLog({
      taskType: "category_collect",
      keywordId: null,
      keyword: category.name,
      marketplace: category.marketplace,
      status: "success",
      startTime,
      endTime: new Date().toISOString(),
      pageCount: pages.length,
      successCount: snapshots.length,
      failCount: 0,
      errorMessage: null,
      retryCount: 0
    });
    store.markCategoryCollection(category.id, "success");
    return log;
  } catch (error) {
    if (error instanceof StrictBsrCountError) {
      store.recordBsrSnapshotQuality({
        snapshotDate: date,
        sourceType: "category_bestseller",
        sourceId: category.id,
        sourceName: category.name,
        marketplace: category.marketplace,
        category: category.name,
        expectedCount: error.expectedCount,
        actualCount: error.actualCount,
        uniqueAsinCount: error.uniqueAsinCount,
        uniqueRankCount: error.uniqueRankCount,
        minRank: error.minRank,
        maxRank: error.maxRank,
        qualityStatus: error.actualCount > 0 ? "partial" : "empty",
        issue: error.message
      });
    }
    const log = store.insertTaskLog({
      taskType: "category_collect",
      keywordId: null,
      keyword: category.name,
      marketplace: category.marketplace,
      status: "failed",
      startTime,
      endTime: new Date().toISOString(),
      pageCount: error instanceof StrictBsrCountError ? error.pageCount : Math.ceil(category.crawlTopN / 50),
      successCount: error instanceof StrictBsrCountError ? error.actualCount : 0,
      failCount: 1,
      errorMessage: error instanceof Error ? error.message : String(error),
      retryCount: 0
    });
    store.markCategoryCollection(category.id, "failed");
    return log;
  }
}

function dedupeProductsByAsin(products: BestSellerProductInput[]): BestSellerProductInput[] {
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

function buildCategoryBsrRankHistory(category: CategoryMonitor, snapshots: ReturnType<typeof decorateBestsellerSnapshots>): BsrRankHistory[] {
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

function categoryCollectionConcurrency(): number {
  return Number(process.env.AMAZON_COLLECT_CATEGORY_CONCURRENCY ?? 1);
}

function strictBsrRankCoverageIssue(products: BestSellerProductInput[], expectedCount: number): string | null {
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
