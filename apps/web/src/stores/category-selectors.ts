import type { BestsellerRankSnapshot, BsrSnapshotQuality, CompetitorActivityEvent } from "@amazon-monitor/shared";
import type { CategoryDetail } from "../api-types";
import type { ActivityEventFilter, ActivityEventOption } from "../types/category-activity";
import type { CategoryRankWindow } from "./category";
import { changeLabel, iceTypeLabel, promoText } from "../utils/formatters";

const UNKNOWN_BRAND_LABEL = "未知品牌";

export type DealCouponFilter = "all" | "with-promotion" | "coupon-only" | "deal-only";

interface TopCategorySnapshotsOptions {
  categoryDetail: CategoryDetail | null;
  categoryProductQuery: string;
  categoryBrandFilter: string;
  categoryRankWindow: CategoryRankWindow;
  iceTypeFilter: string;
  dealCouponFilter: DealCouponFilter;
}

export interface PagedSnapshotsOptions extends TopCategorySnapshotsOptions {
  page: number;
  pageSize: number;
}

export interface PagedSnapshotsResult {
  rows: BestsellerRankSnapshot[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

function hasCoupon(item: BestsellerRankSnapshot): boolean {
  return Boolean(item.couponText && item.couponText.trim().length > 0);
}

function hasDeal(item: BestsellerRankSnapshot): boolean {
  return Boolean(item.dealBadge && item.dealBadge.trim().length > 0);
}

function matchesDealCoupon(
  item: BestsellerRankSnapshot,
  filter: DealCouponFilter
): boolean {
  if (filter === "all") return true;
  const coupon = hasCoupon(item);
  const deal = hasDeal(item);
  if (filter === "with-promotion") return coupon || deal;
  if (filter === "coupon-only") return coupon && !deal;
  if (filter === "deal-only") return deal && !coupon;
  return true;
}

export function getCategoryBrandOptions(categoryDetail: CategoryDetail | null): string[] {
  return Array.from(new Set((categoryDetail?.snapshots ?? []).map((item) => item.brand || UNKNOWN_BRAND_LABEL))).sort((a, b) => a.localeCompare(b));
}

export function getCategoryIceTypeOptions(categoryDetail: CategoryDetail | null): string[] {
  const labels = new Set<string>();
  for (const item of categoryDetail?.snapshots ?? []) {
    const label = iceTypeLabel(item.iceType);
    if (label && label !== "-") {
      labels.add(label);
    }
  }
  return Array.from(labels).sort((a, b) => a.localeCompare(b));
}

export function getTopCategorySnapshots(options: TopCategorySnapshotsOptions): BestsellerRankSnapshot[] {
  const query = options.categoryProductQuery.trim().toLowerCase();
  const rankMax =
    options.categoryRankWindow === "top20"
      ? 20
      : options.categoryRankWindow === "top50"
        ? 50
        : options.categoryRankWindow === "top100"
          ? 100
          : Infinity;

  return (options.categoryDetail?.snapshots ?? []).filter((item) => {
    const brand = item.brand || UNKNOWN_BRAND_LABEL;
    const matchesBrand = options.categoryBrandFilter === "all" || brand === options.categoryBrandFilter;
    const matchesRank = item.rank <= rankMax;
    const matchesQuery =
      !query ||
      item.asin.toLowerCase().includes(query) ||
      item.title.toLowerCase().includes(query) ||
      brand.toLowerCase().includes(query) ||
      promoText(item).toLowerCase().includes(query);
    const matchesIceType = options.iceTypeFilter === "all" || iceTypeLabel(item.iceType) === options.iceTypeFilter;
    const dealCouponMatch = matchesDealCoupon(item, options.dealCouponFilter);
    return matchesBrand && matchesRank && matchesQuery && matchesIceType && dealCouponMatch;
  });
}

export function getPagedCategorySnapshots(options: PagedSnapshotsOptions): PagedSnapshotsResult {
  const all = getTopCategorySnapshots(options);
  const pageSize = Math.max(1, options.pageSize);
  const total = all.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, options.page), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    rows: all.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    pageCount
  };
}

export function getFilteredActivityEvents(activityEvents: CompetitorActivityEvent[], activityEventFilter: ActivityEventFilter): CompetitorActivityEvent[] {
  return activityEvents.filter((item) => activityEventFilter === "all" || item.eventType === activityEventFilter);
}

export function getReviewGrowthEvents(activityEvents: CompetitorActivityEvent[]): CompetitorActivityEvent[] {
  return activityEvents
    .filter((item) => item.eventType === "review_growth" && (item.reviewCountChange ?? 0) > 0)
    .sort((a, b) => (b.reviewCountChange ?? 0) - (a.reviewCountChange ?? 0));
}

export function getBadBsrQuality(bsrQuality: BsrSnapshotQuality[]): BsrSnapshotQuality[] {
  return bsrQuality.filter((item) => item.qualityStatus !== "ok");
}

export function getActivityEventOptions(activityEvents: CompetitorActivityEvent[]): ActivityEventOption[] {
  return Array.from(new Set(activityEvents.map((item) => item.eventType)))
    .sort()
    .map((eventType) => ({ eventType, label: changeLabel(eventType) }));
}
