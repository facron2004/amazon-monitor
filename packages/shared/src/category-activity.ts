import { parseCoupon, trustedPreviousReviewCount } from "./product.js";
import { roundCurrency } from "./report-formatters.js";
import type {
  ActivityEventType,
  AlertLevel,
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  CategoryActivityEventInput,
  CompetitorActivityEvent,
  NullableNumber
} from "./types.js";

export function buildCategoryActivityEvents(input: CategoryActivityEventInput): CompetitorActivityEvent[] {
  const yesterdayByAsin = new Map(input.yesterday.map((item) => [item.asin, item]));
  const events: CompetitorActivityEvent[] = [];

  const pushEvent = (
    eventType: ActivityEventType,
    level: AlertLevel,
    item: BestsellerRankSnapshot,
    previous: BestsellerRankSnapshot | null,
    summary: string,
    possibleStrategy: string,
    suggestedAction: string
  ) => {
    const rankChange = previous ? previous.rank - item.rank : null;
    const priceChangeRate =
      previous?.currentPrice && item.currentPrice !== null ? roundRate((item.currentPrice - previous.currentPrice) / previous.currentPrice) : null;
    const reviewCountBefore = trustedPreviousReviewCount(item.reviewCount, previous?.reviewCount ?? null);
    const reviewCountChange = reviewCountBefore !== null && item.reviewCount !== null ? item.reviewCount - reviewCountBefore : null;
    events.push({
      eventKey: `${eventType}:${item.asin}`,
      eventDate: input.date,
      eventType,
      eventLevel: level,
      categoryId: input.category.id,
      categoryName: input.category.name,
      marketplace: input.category.marketplace,
      asin: item.asin,
      brand: item.brand,
      title: item.title,
      priceBefore: previous?.currentPrice ?? null,
      priceAfter: item.currentPrice,
      priceChangeRate,
      reviewCountBefore,
      reviewCountAfter: item.reviewCount,
      reviewCountChange,
      couponBefore: previous?.couponText ?? null,
      couponAfter: item.couponText ?? null,
      dealType: item.dealBadge ?? previous?.dealBadge ?? null,
      rankBefore: previous?.rank ?? null,
      rankAfter: item.rank,
      rankChange,
      keywordRankBefore: null,
      keywordRankAfter: null,
      eventSummary: summary,
      possibleStrategy,
      suggestedAction
    });
  };

  for (const item of input.today) {
    const previous = yesterdayByAsin.get(item.asin) ?? null;
    if (!previous) {
      const eventType: ActivityEventType = item.rank <= 50 ? "new_entry_top50" : "new_entry_top100";
      pushEvent(
        eventType,
        item.rank <= 20 ? "high" : item.rank <= 50 ? "medium" : "low",
        item,
        null,
        `${item.asin} entered ${input.category.name} Top ${topBoundary(item.rank)} at #${item.rank}.`,
        item.rank <= 50 ? "Possible new-entry or relaunch push with price, coupon, deal, ads, or external traffic." : "New Top 100 entry; observe whether it stays ranked.",
        item.rank <= 50 ? "Add to Top competitor watchlist and track the next 7 days." : "Keep monitoring; promote to key competitor if rank keeps improving."
      );
      continue;
    }

    const rankDelta = previous.rank - item.rank;
    const priceChangeRate =
      previous.currentPrice && item.currentPrice !== null ? roundRate((item.currentPrice - previous.currentPrice) / previous.currentPrice) : null;

    if (rankDelta >= 20) {
      pushEvent(
        "rank_surge",
        item.rank <= 20 ? "high" : "medium",
        item,
        previous,
        `${item.asin} moved from #${previous.rank} to #${item.rank}, up ${rankDelta} places.`,
        "Fast Best Sellers rank surge; likely related to promotion, ads, external traffic, or demand lift.",
        "Check price, coupon, deal, and keyword-rank signals around the same date."
      );
    }

    if (rankDelta <= -20 && (previous.couponText || previous.dealBadge) && !item.couponText && !item.dealBadge) {
      pushEvent(
        "activity_end_rank_drop",
        "medium",
        item,
        previous,
        `${item.asin} lost activity signals and dropped from #${previous.rank} to #${item.rank}.`,
        "Rank dropped after promotion ended; this item may rely on activity to hold rank.",
        "Track the next 3 days to measure post-activity rank decay."
      );
    }

    if (priceChangeRate !== null && priceChangeRate <= -0.05) {
      pushEvent(
        "price_drop",
        rankDelta > 0 ? "high" : "medium",
        item,
        previous,
        `${item.asin} price dropped from ${formatMoney(previous.currentPrice!, item.currency)} to ${formatMoney(item.currentPrice!, item.currency)}.`,
        rankDelta > 0 ? "Price drop and rank improvement appeared together; possible price-push ranking move." : "Meaningful price drop; ranking effect still needs observation.",
        "Record this price point and track rank movement over the next 3 days."
      );
    }

    const previousReviewCount = trustedPreviousReviewCount(item.reviewCount, previous.reviewCount);
    const reviewCountChange = previousReviewCount !== null && item.reviewCount !== null ? item.reviewCount - previousReviewCount : null;
    if (reviewCountChange !== null && reviewCountChange >= 10) {
      pushEvent(
        "review_growth",
        reviewCountChange >= 50 ? "high" : "medium",
        item,
        previous,
        `${item.asin} reviews grew from ${previousReviewCount} to ${item.reviewCount}, up ${reviewCountChange}.`,
        "Review growth can indicate sustained sales velocity or a recent review-generation push.",
        "Compare review growth with rank, price, coupon, and deal movement for the same day."
      );
    }

    if (!previous.couponText && item.couponText) {
      pushEvent(
        "coupon_start",
        rankDelta > 0 ? "high" : "medium",
        item,
        previous,
        `${item.asin} added coupon: ${item.couponText}.`,
        rankDelta > 0 ? "Coupon start and rank improvement appeared together; possible coupon-led push." : "Coupon started; likely conversion or promotion test.",
        "Watch coupon duration and rank lift."
      );
    } else if (previous.couponText && !item.couponText) {
      pushEvent(
        "coupon_end",
        rankDelta < 0 ? "medium" : "low",
        item,
        previous,
        `${item.asin} coupon ended; previous coupon was ${previous.couponText}.`,
        rankDelta < 0 ? "Rank dropped after coupon ended; possible promotion dependency." : "Coupon ended without obvious rank decay yet.",
        "Keep tracking the 3-day post-coupon rank path."
      );
    } else if (couponStrength(item) > couponStrength(previous)) {
      pushEvent(
        "coupon_increase",
        "medium",
        item,
        previous,
        `${item.asin} coupon strength increased.`,
        "Coupon got stronger; possible conversion lift or rank push attempt.",
        "Check whether Best Sellers rank keeps improving."
      );
    }

    if (!previous.dealBadge && item.dealBadge) {
      pushEvent(
        "deal_start",
        rankDelta > 0 ? "high" : "medium",
        item,
        previous,
        `${item.asin} added deal badge: ${item.dealBadge}.`,
        rankDelta > 0 ? "Deal and rank lift appeared together; possible activity push." : "Deal started; item is likely in an activity period.",
        "Record deal start date and compare rank during and after the activity."
      );
    } else if (previous.dealBadge && !item.dealBadge) {
      pushEvent(
        "deal_end",
        rankDelta < 0 ? "medium" : "low",
        item,
        previous,
        `${item.asin} deal ended; previous deal was ${previous.dealBadge}.`,
        rankDelta < 0 ? "Rank dropped after deal ended; possible activity dependency." : "Deal ended without clear rank decay yet.",
        "Observe whether rank falls back over the next 3 days."
      );
    }
  }

  for (const brand of input.brandMatrix) {
    if (brand.productCountTop100 < 3) {
      continue;
    }
    const activeCount = brand.rankUpCount + brand.newEntryCount;
    const activityCount = brand.couponCount + brand.dealCount + brand.priceDownCount;
    if (activeCount < 2 || activityCount < 2) {
      continue;
    }
    const topAsinEvidence = formatBrandTopAsinEvidence(brand, input.today);
    events.push({
      eventKey: `brand_matrix_push:${brand.brand}`,
      eventDate: input.date,
      eventType: "brand_matrix_push",
      eventLevel: brand.productCountTop20 >= 2 || brand.newEntryCount >= 2 ? "high" : "medium",
      categoryId: input.category.id,
      categoryName: input.category.name,
      marketplace: input.category.marketplace,
      asin: null,
      brand: brand.brand,
      title: null,
      priceBefore: null,
      priceAfter: null,
      priceChangeRate: null,
      couponBefore: null,
      couponAfter: null,
      dealType: null,
      rankBefore: null,
      rankAfter: brand.bestRank,
      rankChange: null,
      keywordRankBefore: null,
      keywordRankAfter: null,
      eventSummary: `${brand.brand} has ${brand.productCountTop100} Top100 ASINs; ${activeCount} are new or rising, and ${activityCount} have price/coupon/deal activity.${topAsinEvidence ? ` ${topAsinEvidence}` : ""}`,
      possibleStrategy: "Possible brand matrix push across multiple ASINs.",
      suggestedAction: "Watch whether this brand expands Top50/Top20 share over the next 7 days."
    });
  }

  return events.sort((a, b) => eventPriority(b) - eventPriority(a));
}

function couponStrength(item: { couponValue?: NullableNumber; couponRate?: NullableNumber; couponText?: string | null } | null): number {
  if (!item) {
    return 0;
  }
  if (item.couponValue !== null && item.couponValue !== undefined) {
    return item.couponValue;
  }
  if (item.couponRate !== null && item.couponRate !== undefined) {
    return item.couponRate * 100;
  }
  const parsed = parseCoupon(item.couponText);
  return parsed.couponValue ?? (parsed.couponRate ? parsed.couponRate * 100 : 0);
}

function eventPriority(event: CompetitorActivityEvent): number {
  const levelScore: Record<AlertLevel, number> = { critical: 400, high: 300, medium: 200, low: 100 };
  const typeScore: Record<ActivityEventType, number> = {
    brand_matrix_push: 30,
    new_entry_top50: 28,
    rank_surge: 26,
    price_drop: 24,
    coupon_start: 22,
    deal_start: 22,
    review_growth: 21,
    activity_end_rank_drop: 20,
    new_entry_top100: 18,
    coupon_increase: 16,
    coupon_end: 12,
    deal_end: 12
  };
  return levelScore[event.eventLevel] + typeScore[event.eventType] - (event.rankAfter ?? 999) / 1000;
}

function formatBrandTopAsinEvidence(brand: BrandMatrixSnapshot, today: BestsellerRankSnapshot[]): string {
  const byAsin = new Map(today.map((item) => [item.asin, item]));
  const items = brand.topAsins
    .map((asin) => {
      const snapshot = byAsin.get(asin);
      return snapshot ? `${asin} (#${snapshot.rank})` : asin;
    })
    .slice(0, 5);
  return items.length ? `Top ASINs: ${items.join(", ")}.` : "";
}

function topBoundary(rank: number): number {
  if (rank <= 20) return 20;
  if (rank <= 50) return 50;
  return 100;
}

function formatMoney(value: number, currency = "$"): string {
  return `${currency}${roundCurrency(value).toFixed(2)}`;
}

function roundRate(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
