import type { InsightEvent, KeywordMonitor, SerpSnapshot } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import type { InsightBuildContext } from "./insight-build-context.js";
import {
  buildSnapshotDiffEvents,
  snapshotDiffEventKey,
  type SnapshotDiffProduct
} from "./snapshot-diff-events.js";

export function generateKeywordSnapshotDiffEvents(
  store: Store,
  keyword: KeywordMonitor,
  date: string,
  snapshots: SerpSnapshot[],
  previousSnapshots: SerpSnapshot[]
): InsightEvent[] {
  const previousByAsin = new Map(previousSnapshots.map((snapshot) => [snapshot.asin, snapshot]));
  const competitors = store.listCompetitors({ orgId: keyword.orgId });
  const context: InsightBuildContext = {
    date,
    category: null,
    keyword,
    brandByName: new Map(),
    brandTop100ShareChangeByName: new Map(),
    coreCompetitorRising3DaysByAsin: new Set(),
    competitorsByAsin: new Map(competitors.map((item) => [item.asin, item])),
    watchByAsin: new Map(store.listAsinWatchStates(keyword.orgId).map((item) => [item.asin, item]))
  };
  const generated = new Map<string, InsightEvent>();

  for (const snapshot of snapshots) {
    const previous = previousByAsin.get(snapshot.asin);
    if (!previous) continue;
    for (const input of buildSnapshotDiffEvents(context, toSnapshotDiffProduct(snapshot), toSnapshotDiffProduct(previous))) {
      const key = snapshotDiffEventKey(input);
      if (!key) continue;
      const existing = store.listInsightEvents({
        orgId: keyword.orgId,
        date,
        asin: input.asin ?? undefined,
        eventType: input.eventType,
        limit: 1
      })[0];
      if (existing?.categoryId !== null && existing?.categoryId !== undefined) continue;
      generated.set(key, store.upsertInsightEvent({
        ...input,
        id: existing?.id ?? input.id,
        orgId: keyword.orgId
      }));
    }
  }

  return [...generated.values()];
}

function toSnapshotDiffProduct(snapshot: SerpSnapshot): SnapshotDiffProduct {
  return {
    asin: snapshot.asin,
    title: snapshot.title,
    brand: snapshot.brand,
    imageUrl: snapshot.imageUrl,
    productUrl: snapshot.productUrl,
    rank: snapshot.organicRank ?? snapshot.absoluteRank,
    currentPrice: snapshot.currentPrice,
    rating: snapshot.rating,
    reviewCount: snapshot.reviewCount,
    couponText: snapshot.couponText,
    dealBadge: snapshot.dealBadge
  };
}
