import type { BestsellerRankSnapshot, BsrRankChange, BsrRankHistory, CompetitorActionInsight } from "@amazon-monitor/shared";

export function buildSnapshotLookup(items: BestsellerRankSnapshot[]): Map<string, BestsellerRankSnapshot> {
  const map = new Map<string, BestsellerRankSnapshot>();
  for (const item of items) {
    map.set(snapshotLookupKey(item.marketplace, item.categoryName, item.asin), item);
  }
  return map;
}

export function snapshotForBsrHistory(map: Map<string, BestsellerRankSnapshot>, item: BsrRankHistory): BestsellerRankSnapshot | null {
  return map.get(snapshotLookupKey(item.marketplace, item.category, item.asin)) ?? null;
}

export function snapshotForBsrChange(map: Map<string, BestsellerRankSnapshot>, item: BsrRankChange): BestsellerRankSnapshot | null {
  return map.get(snapshotLookupKey(item.marketplace, item.category, item.asin)) ?? null;
}

export function snapshotForActionInsight(map: Map<string, BestsellerRankSnapshot>, item: CompetitorActionInsight): BestsellerRankSnapshot | null {
  return item.asin ? map.get(snapshotLookupKey(item.marketplace, item.category, item.asin)) ?? null : null;
}

function snapshotLookupKey(marketplace: string, category: string, asin: string): string {
  return `${marketplace}|${category}|${asin}`;
}
