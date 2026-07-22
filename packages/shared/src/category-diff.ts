import type {
  CategorySnapshotDiffItem,
  CategorySnapshotDiffResponse,
  CategorySnapshotDiffType
} from "./types-category.js";
import type { BestsellerRankSnapshot } from "./types-products.js";

export interface BuildCategorySnapshotDiffInput {
  categoryId: number;
  date: string;
  compareDate: string;
  current: BestsellerRankSnapshot[];
  comparison: BestsellerRankSnapshot[];
}

export function buildCategorySnapshotDiff(input: BuildCategorySnapshotDiffInput): CategorySnapshotDiffResponse {
  const currentByProduct = indexSnapshots(input.current);
  const comparisonByProduct = indexSnapshots(input.comparison);
  const productKeys = new Set([...currentByProduct.keys(), ...comparisonByProduct.keys()]);
  const items: CategorySnapshotDiffItem[] = [];

  for (const key of productKeys) {
    const current = currentByProduct.get(key);
    const previous = comparisonByProduct.get(key);
    const changeTypes = collectChangeTypes(current, previous);
    if (changeTypes.length === 0) continue;

    const product = current ?? previous;
    if (!product) continue;
    items.push({
      asin: product.asin,
      marketplace: product.marketplace,
      title: current?.title ?? previous?.title ?? "",
      brand: current?.brand ?? previous?.brand ?? null,
      imageUrl: current?.imageUrl ?? previous?.imageUrl ?? "",
      productUrl: current?.productUrl ?? previous?.productUrl ?? "",
      changeTypes,
      currentRank: current?.rank ?? null,
      previousRank: previous?.rank ?? null,
      rankChange: current && previous ? previous.rank - current.rank : null,
      currentPrice: current?.currentPrice ?? null,
      previousPrice: previous?.currentPrice ?? null,
      priceChange: numberChange(current?.currentPrice, previous?.currentPrice),
      currentCoupon: normalizeLabel(current?.couponText),
      previousCoupon: normalizeLabel(previous?.couponText),
      currentDeal: normalizeLabel(current?.dealBadge),
      previousDeal: normalizeLabel(previous?.dealBadge),
      currentReviewCount: current?.reviewCount ?? null,
      previousReviewCount: previous?.reviewCount ?? null,
      reviewCountChange: numberChange(current?.reviewCount, previous?.reviewCount)
    });
  }

  items.sort(compareDiffImpact);
  return {
    categoryId: input.categoryId,
    date: input.date,
    compareDate: input.compareDate,
    currentCount: input.current.length,
    compareCount: input.comparison.length,
    items
  };
}

function indexSnapshots(items: BestsellerRankSnapshot[]): Map<string, BestsellerRankSnapshot> {
  return new Map(items.map((item) => [`${item.marketplace}:${item.asin}`, item]));
}

function collectChangeTypes(
  current: BestsellerRankSnapshot | undefined,
  previous: BestsellerRankSnapshot | undefined
): CategorySnapshotDiffType[] {
  if (current && !previous) return ["new_entry"];
  if (!current && previous) return ["dropped"];
  if (!current || !previous) return [];

  const types: CategorySnapshotDiffType[] = [];
  if (current.rank < previous.rank) types.push("rank_up");
  if (current.rank > previous.rank) types.push("rank_down");
  if (current.currentPrice !== previous.currentPrice) types.push("price_changed");
  if (normalizeLabel(current.couponText) !== normalizeLabel(previous.couponText)) types.push("coupon_changed");
  if (normalizeLabel(current.dealBadge) !== normalizeLabel(previous.dealBadge)) types.push("deal_changed");
  if (current.reviewCount !== null && previous.reviewCount !== null && current.reviewCount > previous.reviewCount) {
    types.push("review_growth");
  }
  return types;
}

function normalizeLabel(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function numberChange(current: number | null | undefined, previous: number | null | undefined): number | null {
  return current !== null && current !== undefined && previous !== null && previous !== undefined
    ? current - previous
    : null;
}

function compareDiffImpact(left: CategorySnapshotDiffItem, right: CategorySnapshotDiffItem): number {
  const priority = (item: CategorySnapshotDiffItem): number => {
    if (item.changeTypes.includes("new_entry")) return 0;
    if (item.changeTypes.includes("dropped")) return 1;
    return 2;
  };
  const priorityDifference = priority(left) - priority(right);
  if (priorityDifference !== 0) return priorityDifference;
  const movementDifference = Math.abs(right.rankChange ?? 0) - Math.abs(left.rankChange ?? 0);
  if (movementDifference !== 0) return movementDifference;
  return (left.currentRank ?? left.previousRank ?? 9999) - (right.currentRank ?? right.previousRank ?? 9999);
}
