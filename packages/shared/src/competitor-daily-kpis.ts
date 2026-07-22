import type { AsinWatchState } from "./insight-events.js";
import type {
  CompetitorDailyKpiDelta,
  CompetitorDailyKpiSnapshot,
  CompetitorPoolItem,
} from "./types-competitors.js";

type WatchState = Pick<AsinWatchState, "asin" | "watchLevel">;

const couponPattern = /\b(coupon|save)\b/i;
const dealPattern =
  /\b(limited\s+time\s+deal|prime[\s-]*exclusive\s+(?:deal|savings)|prime[\s-]*day'?s?[\s-]*(?:deals?|exclusive|savings|sale)|prime[\s-]*big[\s-]*deal[\s-]*days?|prime[\s-]*early[\s-]*access[\s-]*deal|prime[\s-]*member[\s-]*exclusive[\s-]*deal|deal\s+of\s+the\s+day|lightning\s+deal|black\s+friday\s+deal|cyber\s+monday\s+deal)\b|^deal$/i;

export function hasCompetitorPriceActivity(
  item: Pick<CompetitorPoolItem, "couponText" | "dealBadge">,
): boolean {
  const coupon = item.couponText?.trim() ?? "";
  const deal = item.dealBadge?.trim() ?? "";
  return (
    (coupon.length <= 90 && couponPattern.test(coupon)) ||
    (deal.length <= 90 && dealPattern.test(deal))
  );
}

export function buildCompetitorDailyKpiSnapshot(
  date: string,
  competitors: CompetitorPoolItem[],
  watchStates: WatchState[] = [],
): CompetitorDailyKpiSnapshot {
  const watchByAsin = new Map(
    watchStates.map((state) => [state.asin, state.watchLevel]),
  );
  const dateMs = Date.parse(`${date}T00:00:00.000Z`);
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  return {
    date,
    total: competitors.length,
    core: competitors.filter(
      (item) =>
        item.competitorTier === "core" ||
        item.isKeyCompetitor ||
        watchByAsin.get(item.asin) === "CORE",
    ).length,
    new: competitors.filter((item) => {
      const firstSeenMs = Date.parse(`${item.firstSeenDate}T00:00:00.000Z`);
      return (
        Number.isFinite(dateMs) &&
        Number.isFinite(firstSeenMs) &&
        firstSeenMs <= dateMs &&
        dateMs - firstSeenMs < sevenDaysMs
      );
    }).length,
    priceActive: competitors.filter(hasCompetitorPriceActivity).length,
    key: competitors.filter((item) => item.isKeyCompetitor).length,
  };
}

export function diffCompetitorDailyKpis(
  current: CompetitorDailyKpiSnapshot,
  previous: CompetitorDailyKpiSnapshot | null,
): CompetitorDailyKpiDelta {
  return {
    total: previous ? current.total - previous.total : null,
    core: previous ? current.core - previous.core : null,
    new: previous ? current.new - previous.new : null,
    priceActive: previous ? current.priceActive - previous.priceActive : null,
    key: previous ? current.key - previous.key : null,
  };
}
