import type { KeywordMonitor } from "./types-monitors.js";
import type {
  KeywordRankMatrixCell,
  KeywordRankMatrixProduct,
  KeywordRankMatrixProductReference,
  KeywordRankMatrixResponse
} from "./types-keyword-matrix.js";
import type { SerpSnapshot } from "./types-products.js";

export interface BuildKeywordRankMatrixInput {
  requestedDate: string;
  date: string | null;
  previousDate: string | null;
  sevenDayDate: string | null;
  keywords: KeywordMonitor[];
  monitoredProducts: KeywordRankMatrixProductReference[];
  current: SerpSnapshot[];
  previous: SerpSnapshot[];
  sevenDay: SerpSnapshot[];
}

export function buildKeywordRankMatrix(input: BuildKeywordRankMatrixInput): KeywordRankMatrixResponse {
  const references = indexProductReferences(input.monitoredProducts);
  const current = aggregateSnapshots(input.current, references);
  const previous = aggregateSnapshots(input.previous, references);
  const sevenDay = aggregateSnapshots(input.sevenDay, references);
  const products = buildProducts(current, references);

  return {
    requestedDate: input.requestedDate,
    date: input.date,
    previousDate: input.previousDate,
    sevenDayDate: input.sevenDayDate,
    isFallback: input.date !== null && input.date !== input.requestedDate,
    products,
    rows: input.keywords.map((keyword) => ({
      keywordId: keyword.id,
      keyword: keyword.keyword,
      priority: keyword.priority,
      marketplace: keyword.marketplace,
      categoryTag: keyword.categoryTag,
      cells: products.flatMap((product) => {
        const key = cellKey(keyword.id, product.key);
        const currentCell = current.get(key);
        if (!currentCell) return [];
        const previousCell = previous.get(key);
        const sevenDayCell = sevenDay.get(key);
        return [toMatrixCell(product.key, currentCell, previousCell, sevenDayCell)];
      })
    }))
  };
}

interface AggregatedSnapshot {
  snapshot: SerpSnapshot;
  organicRank: number | null;
  sponsoredRank: number | null;
  isSponsored: boolean;
  hasBestsellerRank: boolean;
  hasCoupon: boolean;
  hasDeal: boolean;
}

function indexProductReferences(items: KeywordRankMatrixProductReference[]): Map<string, KeywordRankMatrixProductReference> {
  const references = new Map<string, KeywordRankMatrixProductReference>();
  for (const item of items) {
    const key = productKey(item.marketplace, item.asin);
    const current = references.get(key);
    if (!current || item.kind === "owned") {
      references.set(key, item);
    }
  }
  return references;
}

function aggregateSnapshots(
  snapshots: SerpSnapshot[],
  references: Map<string, KeywordRankMatrixProductReference>
): Map<string, AggregatedSnapshot> {
  const result = new Map<string, AggregatedSnapshot>();
  for (const snapshot of snapshots) {
    const product = productKey(snapshot.marketplace, snapshot.asin);
    if (!references.has(product)) continue;
    const key = cellKey(snapshot.keywordId, product);
    const current = result.get(key);
    if (!current) {
      result.set(key, {
        snapshot,
        organicRank: snapshot.organicRank,
        sponsoredRank: snapshot.sponsoredRank,
        isSponsored: snapshot.isSponsored || snapshot.sponsoredRank !== null,
        hasBestsellerRank: snapshot.bsrRank !== null || snapshot.bestsellerRanks.length > 0,
        hasCoupon: hasLabel(snapshot.couponText),
        hasDeal: hasLabel(snapshot.dealBadge)
      });
      continue;
    }
    current.organicRank = bestRank(current.organicRank, snapshot.organicRank);
    current.sponsoredRank = bestRank(current.sponsoredRank, snapshot.sponsoredRank);
    current.isSponsored ||= snapshot.isSponsored || snapshot.sponsoredRank !== null;
    current.hasBestsellerRank ||= snapshot.bsrRank !== null || snapshot.bestsellerRanks.length > 0;
    current.hasCoupon ||= hasLabel(snapshot.couponText);
    current.hasDeal ||= hasLabel(snapshot.dealBadge);
    if (snapshot.absoluteRank < current.snapshot.absoluteRank) current.snapshot = snapshot;
  }
  return result;
}

function buildProducts(
  current: Map<string, AggregatedSnapshot>,
  references: Map<string, KeywordRankMatrixProductReference>
): KeywordRankMatrixProduct[] {
  const products = new Map<string, KeywordRankMatrixProduct>();
  for (const item of current.values()) {
    const key = productKey(item.snapshot.marketplace, item.snapshot.asin);
    const reference = references.get(key);
    if (!reference || products.has(key)) continue;
    products.set(key, {
      key,
      asin: item.snapshot.asin,
      marketplace: item.snapshot.marketplace,
      title: item.snapshot.title,
      brand: item.snapshot.brand,
      imageUrl: item.snapshot.imageUrl || null,
      productUrl: item.snapshot.productUrl || null,
      kind: reference.kind,
      isKeyCompetitor: reference.isKeyCompetitor ?? false
    });
  }
  return [...products.values()].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "owned" ? -1 : 1;
    if (left.isKeyCompetitor !== right.isKeyCompetitor) return left.isKeyCompetitor ? -1 : 1;
    return left.asin.localeCompare(right.asin);
  });
}

function toMatrixCell(
  product: string,
  current: AggregatedSnapshot,
  previous: AggregatedSnapshot | undefined,
  sevenDay: AggregatedSnapshot | undefined
): KeywordRankMatrixCell {
  return {
    productKey: product,
    currentOrganicRank: current.organicRank,
    previousOrganicRank: previous?.organicRank ?? null,
    sevenDayOrganicRank: sevenDay?.organicRank ?? null,
    sevenDayRankChange: rankChange(current.organicRank, sevenDay?.organicRank),
    sponsoredRank: current.sponsoredRank,
    isSponsored: current.isSponsored,
    isAmazonChoice: null,
    isBestSeller: null,
    hasBestsellerRank: current.hasBestsellerRank,
    hasCoupon: current.hasCoupon,
    hasDeal: current.hasDeal
  };
}

function productKey(marketplace: string, asin: string): string {
  return `${marketplace}:${asin}`;
}

function cellKey(keywordId: number, product: string): string {
  return `${keywordId}:${product}`;
}

function bestRank(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

function rankChange(current: number | null, reference: number | null | undefined): number | null {
  return current !== null && reference !== null && reference !== undefined ? reference - current : null;
}

function hasLabel(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}
