import {
  analyzeDailyChanges,
  buildCompetitorActionInsights,
  buildDailyReportMarkdown,
  decorateSnapshotRanks,
  isoDate,
  selectSpecificBestsellerRank,
  summarizePriceBand,
  type BsrRankHistory,
  type CollectTaskLog,
  type KeywordMonitor,
  type SerpSnapshot
} from "@amazon-monitor/shared";
import { PlaywrightAmazonSearchCollector, runLimitedConcurrency, type AmazonSearchCollector } from "./amazon-collector.js";
import { formatDuration, ts } from "./log.js";
import type { Store } from "./store.js";

export interface CollectionOptions {
  collector?: AmazonSearchCollector;
}

const defaultCollector = new PlaywrightAmazonSearchCollector();

export async function runCollectionForAll(
  store: Store,
  date = isoDate(),
  options: CollectionOptions = {}
): Promise<CollectTaskLog[]> {
  const logs: CollectTaskLog[] = [];
  const keywords = store.listKeywords().filter((keyword) => keyword.status === "enabled");

  logs.push(...(await runLimitedConcurrency(keywords, keywordCollectionConcurrency(), (keyword) => runCollectionForKeyword(store, keyword.id, date, options))));

  return logs;
}

export async function runCollectionForKeyword(
  store: Store,
  keywordId: number,
  date = isoDate(),
  options: CollectionOptions = {}
): Promise<CollectTaskLog> {
  const keyword = store.getKeyword(keywordId);
  if (!keyword) {
    throw new Error(`Keyword ${keywordId} not found`);
  }

  const startTime = new Date().toISOString();
  const t0 = Date.now();
  const collector = options.collector ?? defaultCollector;

  try {
    console.log(`[${ts()}] [Pipeline] Collecting keyword="${keyword.keyword}" marketplace=${keyword.marketplace} pages=${keyword.crawlPages}...`);
    const pages = await collector.collect(keyword, date);
    const t1 = Date.now();
    console.log(`[${ts()}] [Pipeline] Crawl done in ${formatDuration(t1 - t0)} — ${pages.length} pages, processing snapshots...`);
    const allSnapshots = pages.flatMap((page) =>
      decorateSnapshotRanks({
        keywordId: keyword.id,
        keyword: keyword.keyword,
        marketplace: keyword.marketplace,
        snapshotDate: date,
        pageNo: page.pageNo,
        productsPerPage: 48,
        products: page.products
      })
    );

    // Deduplicate: same ASIN may appear across pages (organic + sponsored). Keep first occurrence (best rank).
    const seenAsins = new Set<string>();
    const snapshots = allSnapshots.filter((s) => {
      if (seenAsins.has(s.asin)) return false;
      seenAsins.add(s.asin);
      return true;
    });

    if (snapshots.length === 0) {
      throw new Error(`No Amazon search cards collected for "${keyword.keyword}".`);
    }

    const previous = store.getPreviousSnapshots(keyword.id, date);
    const historyLowestPrices = store.getHistoryLowestPrices(snapshots.map((item) => item.asin));

    const analysis = analyzeDailyChanges({
      today: snapshots,
      yesterday: previous,
      historyLowestPrices
    });

    const report = buildDailyReportMarkdown({
      date,
      keyword: keyword.keyword,
      analysis,
      priceBand: summarizePriceBand(snapshots, 20)
    });

    const t2 = Date.now();
    console.log(`[${ts()}] [Pipeline] Analysis done in ${formatDuration(t2 - t1)} — ${snapshots.length} snapshots, storing...`);
    store.runInTransaction(() => {
      store.deleteSnapshotsForKeywordDate(keyword.id, date);
      store.insertSnapshots(snapshots);
      store.replaceBsrRankHistoryForDate({
        sourceType: "keyword_detail",
        sourceId: keyword.id,
        date,
        items: buildKeywordBsrRankHistory(keyword, snapshots)
      });
      store.replaceCompetitorActionInsights({
        sourceType: "keyword_detail",
        sourceId: keyword.id,
        date,
        items: buildCompetitorActionInsights({
          date,
          bsrChanges: store.listBsrRankChanges({ date, sourceType: "keyword_detail", sourceId: keyword.id })
        })
      });
      store.insertDailyChanges(analysis.changes);
      store.insertAlerts(analysis.alerts);
      store.upsertCompetitorsFromSnapshots(snapshots);
      store.saveDailyReport(date, keyword.keyword, report);
    });

    const totalMs = Date.now() - t0;
    console.log(`[${ts()}] [Pipeline] ✓ Keyword "${keyword.keyword}" stored in ${formatDuration(Date.now() - t2)}. Total: ${formatDuration(totalMs)}`);

    const log = store.insertTaskLog({
      taskType: "keyword_collect",
      keywordId: keyword.id,
      keyword: keyword.keyword,
      marketplace: keyword.marketplace,
      status: "success",
      startTime,
      endTime: new Date().toISOString(),
      pageCount: pages.length,
      successCount: snapshots.length,
      failCount: 0,
      errorMessage: null,
      retryCount: 0
    });
    markKeywordCollected(store, keyword, "success");
    return log;
  } catch (error) {
    const totalMs = Date.now() - t0;
    console.error(`[${ts()}] [Pipeline] ✗ Keyword "${keyword.keyword}" FAILED after ${formatDuration(totalMs)}: ${error instanceof Error ? error.message : String(error)}`);
    const log = store.insertTaskLog({
      taskType: "keyword_collect",
      keywordId: keyword.id,
      keyword: keyword.keyword,
      marketplace: keyword.marketplace,
      status: "failed",
      startTime,
      endTime: new Date().toISOString(),
      pageCount: keyword.crawlPages,
      successCount: 0,
      failCount: 1,
      errorMessage: error instanceof Error ? error.message : String(error),
      retryCount: 0
    });
    markKeywordCollected(store, keyword, "failed");
    return log;
  }
}

function markKeywordCollected(store: Store, keyword: KeywordMonitor, status: "success" | "failed"): void {
  store.markKeywordCollection(keyword.id, status);
}

function buildKeywordBsrRankHistory(keyword: KeywordMonitor, snapshots: SerpSnapshot[]): BsrRankHistory[] {
  return snapshots.flatMap((snapshot) => {
    const specific = selectSpecificBestsellerRank(snapshot.bestsellerRanks);
    const parentRank = snapshot.bestsellerRanks[0]?.rank ?? null;
    return snapshot.bestsellerRanks.map((rank) => ({
      snapshotDate: snapshot.snapshotDate,
      sourceType: "keyword_detail",
      sourceId: keyword.id,
      sourceName: keyword.keyword,
      marketplace: snapshot.marketplace,
      asin: snapshot.asin,
      title: snapshot.title,
      brand: snapshot.brand,
      category: rank.category,
      rank: rank.rank,
      rankUrl: rank.url,
      productUrl: snapshot.productUrl,
      currentPrice: snapshot.currentPrice,
      parentRank,
      isSpecificRank: specific?.category === rank.category && specific.rank === rank.rank
    }));
  });
}

function keywordCollectionConcurrency(): number {
  return Number(process.env.AMAZON_COLLECT_KEYWORD_CONCURRENCY ?? 2);
}

export { isoDate };
