import {
  analyzeCategorySignals,
  buildCompetitorActionInsights,
  buildCategoryActivityEvents,
  buildBrandMatrixSnapshots,
  buildCategoryReportMarkdown,
  decorateBestsellerSnapshots,
  describeRankCoverageGaps,
  type BestSellerProductInput,
  type CategoryMonitor,
  type CollectTaskLog
} from "@amazon-monitor/shared";
import { PlaywrightAmazonBestSellerCollector, runLimitedConcurrency } from "./amazon-collector.js";
import { abortErrorIfSignaled, type AbortableCollectOptions, throwIfAborted } from "./amazon/abort.js";
import {
  buildCategoryBsrRankHistory,
  dedupeProductsByAsin,
  normalizeBestSellerPageRanks,
  preserveKnownCommercialFields,
  strictBsrRankCoverageIssue,
  totalPageRetryCount
} from "./category-pipeline-helpers.js";
import { formatDuration, ts } from "./log.js";
import { generateInsightEvents } from "./insights/insight-event-generator.js";
import { evaluateDueInsightEventReviews } from "./insights/review-evaluator.js";
import type { Store } from "./store.js";
import { isoDate } from "./pipeline.js";
import { intEnv } from "./amazon/config.js";

export interface CollectedBestSellerPage {
  pageNo: number;
  products: BestSellerProductInput[];
  url: string;
  retryCount?: number;
}

export interface AmazonBestSellerCollector {
  collect(category: CategoryMonitor, date: string, options?: AbortableCollectOptions): Promise<CollectedBestSellerPage[]>;
}

export interface CategoryCollectionOptions {
  collector?: AmazonBestSellerCollector;
  signal?: AbortSignal;
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
  retryCount: number;

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
    this.retryCount = totalPageRetryCount(pages);
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
  const t0 = Date.now();
  const collector = options.collector ?? defaultCategoryCollector;

  try {
    throwIfAborted(options.signal);
    console.log(`[${ts()}] [Pipeline] Collecting category="${category.name}" marketplace=${category.marketplace} topN=${category.crawlTopN}...`);
    const pages = await collector.collect(category, date, { signal: options.signal });
    throwIfAborted(options.signal);
    const t1 = Date.now();
    console.log(`[${ts()}] [Pipeline] Crawl done in ${formatDuration(t1 - t0)} — ${pages.length} pages, processing products...`);
    const retryCount = totalPageRetryCount(pages);
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

    // Data quality grading: save partial data instead of failing hard
    const ratio = category.crawlTopN > 0 ? products.length / category.crawlTopN : 1;
    let dataQuality: "ok" | "partial";
    if (ratio >= 0.95) {
      dataQuality = "ok";
    } else if (ratio >= 0.8) {
      dataQuality = "partial";
    } else {
      throw new StrictBsrCountError(category, pages, products);
    }
    const rankCoverageIssue = strictBsrRankCoverageIssue(products, category.crawlTopN);
    if (rankCoverageIssue) {
      // Coverage gaps (missing ranks, duplicates) degrade quality to partial,
      // but still save the data so we don't lose everything for one gap.
      dataQuality = "partial";
    }
    const decoratedSnapshots = decorateBestsellerSnapshots({
      categoryId: category.id,
      categoryName: category.name,
      marketplace: category.marketplace,
      snapshotDate: date,
      products
    });

    if (decoratedSnapshots.length === 0) {
      throw new Error(`No Amazon Best Sellers products collected for "${category.name}".`);
    }

    const previous = store.getPreviousCategorySnapshots(category.id, date);
    const snapshots = preserveKnownCommercialFields(decoratedSnapshots, previous);
    const t2 = Date.now();
    console.log(`[${ts()}] [Pipeline] Processing done in ${formatDuration(t2 - t1)} — ${snapshots.length} products, analyzing & storing...`);
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

    throwIfAborted(options.signal);

    // Wrap all writes in a single transaction to maintain consistency
    store.runInTransaction(() => {
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
      generateInsightEvents(store, date, { categoryId: category.id });
      evaluateDueInsightEventReviews(store, date, { categoryId: category.id });
    });

    // Record BSR quality for partial collections
    if (dataQuality === "partial") {
      const issueParts: string[] = [];
      if (ratio < 1) {
        issueParts.push(`Collected ${products.length}/${category.crawlTopN} (${Math.round(ratio * 100)}%)`);
      }
      if (rankCoverageIssue) {
        issueParts.push(rankCoverageIssue);
      }
      store.recordBsrSnapshotQuality({
        snapshotDate: date,
        sourceType: "category_bestseller",
        sourceId: category.id,
        sourceName: category.name,
        marketplace: category.marketplace,
        category: category.name,
        expectedCount: category.crawlTopN,
        actualCount: products.length,
        uniqueAsinCount: new Set(products.map((p) => p.asin)).size,
        uniqueRankCount: new Set(products.map((p) => p.rank)).size,
        minRank: products.length ? Math.min(...products.map((p) => p.rank)) : null,
        maxRank: products.length ? Math.max(...products.map((p) => p.rank)) : null,
        qualityStatus: "partial",
        issue: issueParts.join("; ")
      });
    }

    const totalMs = Date.now() - t0;
    console.log(`[${ts()}] [Pipeline] ✓ Category "${category.name}" stored in ${formatDuration(Date.now() - t2)}. Total: ${formatDuration(totalMs)} (${snapshots.length} products, quality=${dataQuality})`);

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
      errorMessage: dataQuality === "partial" ? `Partial data: ${products.length}/${category.crawlTopN} collected` : null,
      retryCount
    });
    store.markCategoryCollection(category.id, "success");
    return log;
  } catch (error) {
    // Don't log aborted jobs as failures — the worker handles that
    const abortError = abortErrorIfSignaled(options.signal);
    if (abortError) throw abortError;
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    const totalMs = Date.now() - t0;
    console.error(`[${ts()}] [Pipeline] ✗ Category "${category.name}" FAILED after ${formatDuration(totalMs)}: ${error instanceof Error ? error.message : String(error)}`);
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
      retryCount: error instanceof StrictBsrCountError ? error.retryCount : 0
    });
    if (!hasOkCategoryBsrSnapshot(store, category.id, date)) {
      store.markCategoryCollection(category.id, "failed");
    }
    return log;
  }
}

function hasOkCategoryBsrSnapshot(store: Store, categoryId: number, date: string): boolean {
  return (
    store.listBsrSnapshotQuality({
      date,
      sourceType: "category_bestseller",
      sourceId: categoryId,
      qualityStatus: "ok",
      limit: 1
    }).length > 0
  );
}

function categoryCollectionConcurrency(): number {
  return intEnv("AMAZON_COLLECT_CATEGORY_CONCURRENCY", 1, 1, 10);
}

export { normalizeBestSellerPageRanks };
