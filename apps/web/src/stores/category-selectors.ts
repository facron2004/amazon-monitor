import type { BestsellerRankSnapshot, BsrSnapshotQuality, CompetitorActivityEvent } from "@amazon-monitor/shared";
import type { CategoryDetail } from "../api-types";
import type { ActivityEventFilter, ActivityEventOption } from "../types/category-activity";
import type { CategoryRankWindow } from "./category";
import { changeLabel, promoText } from "../utils/formatters";

const UNKNOWN_BRAND_LABEL = "未知品牌";

interface TopCategorySnapshotsOptions {
  categoryDetail: CategoryDetail | null;
  categoryProductQuery: string;
  categoryBrandFilter: string;
  categoryRankWindow: CategoryRankWindow;
}

export function getCategoryBrandOptions(categoryDetail: CategoryDetail | null): string[] {
  return Array.from(new Set((categoryDetail?.snapshots ?? []).map((item) => item.brand || UNKNOWN_BRAND_LABEL))).sort((a, b) => a.localeCompare(b));
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
    return matchesBrand && matchesRank && matchesQuery;
  });
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
