import type {
  ActivityEventType,
  BsrRankChange,
  CompetitorActionInsight,
  CompetitorActionInsightConfidence,
  CompetitorActionInsightInput,
  CompetitorActionInsightType,
  CompetitorActivityEvent,
  NullableNumber
} from "./types.js";
import { roundCurrency } from "./report-formatters.js";

export function buildCompetitorActionInsights(input: CompetitorActionInsightInput): CompetitorActionInsight[] {
  const insights = new Map<string, CompetitorActionInsight>();
  const changesByAsin = new Map<string, BsrRankChange>();

  for (const change of input.bsrChanges) {
    changesByAsin.set(actionInsightChangeKey(change), change);
    const rankMove = change.rankChange ?? 0;

    if (change.changeType === "new_entry" && change.currentRank !== null && change.previousDate !== null) {
      pushActionInsight(insights, {
        insightDate: input.date,
        sourceType: change.sourceType,
        sourceId: change.sourceId,
        sourceName: change.sourceName,
        previousDate: change.previousDate,
        marketplace: change.marketplace,
        category: change.category,
        asin: change.asin,
        brand: change.brand,
        title: change.title,
        insightType: "bsr_new_entry",
        confidence: change.currentRank <= 20 ? "high" : change.currentRank <= 50 ? "medium" : "low",
        currentRank: change.currentRank,
        previousRank: null,
        rankChange: null,
        price: change.currentPrice,
        productUrl: change.productUrl,
        evidence: `${change.asin} entered ${change.category} Best Sellers at #${change.currentRank}. Evidence dates: ${formatEvidenceDatePath(change.previousDate, input.date)}.`,
        inferredAction: "New listing, relaunch, promotion, ads, or external traffic may be pushing the product into the list.",
        suggestedResponse: change.currentRank <= 50 ? "Track this ASIN daily for 7 days and review price, coupon, deal, and keyword rank changes." : "Keep monitoring; promote to watchlist if rank keeps improving."
      });
      continue;
    }

    if (change.changeType === "rank_up" && rankMove >= 20 && change.currentRank !== null) {
      pushActionInsight(insights, {
        insightDate: input.date,
        sourceType: change.sourceType,
        sourceId: change.sourceId,
        sourceName: change.sourceName,
        previousDate: change.previousDate,
        marketplace: change.marketplace,
        category: change.category,
        asin: change.asin,
        brand: change.brand,
        title: change.title,
        insightType: "bsr_fast_rise",
        confidence: rankMove >= 50 || change.currentRank <= 20 ? "high" : "medium",
        currentRank: change.currentRank,
        previousRank: change.previousRank,
        rankChange: rankMove,
        price: change.currentPrice,
        productUrl: change.productUrl,
        evidence: `${change.asin} moved from #${change.previousRank} to #${change.currentRank}, up ${rankMove} places. Evidence dates: ${formatEvidenceDatePath(change.previousDate, input.date)}.`,
        inferredAction: "Fast BSR lift often points to a promotion, advertising push, off-site traffic, or demand spike.",
        suggestedResponse: "Check same-day price, coupon, deal, review, and keyword-rank signals, then compare the next 3-day rank path."
      });
      continue;
    }

    if (change.changeType === "rank_down" && rankMove <= -20 && change.previousRank !== null) {
      pushActionInsight(insights, {
        insightDate: input.date,
        sourceType: change.sourceType,
        sourceId: change.sourceId,
        sourceName: change.sourceName,
        previousDate: change.previousDate,
        marketplace: change.marketplace,
        category: change.category,
        asin: change.asin,
        brand: change.brand,
        title: change.title,
        insightType: "bsr_rank_drop",
        confidence: change.previousRank <= 20 ? "high" : "medium",
        currentRank: change.currentRank,
        previousRank: change.previousRank,
        rankChange: rankMove,
        price: change.currentPrice,
        productUrl: change.productUrl,
        evidence: `${change.asin} moved down ${Math.abs(rankMove)} places from #${change.previousRank} to #${change.currentRank}. Evidence dates: ${formatEvidenceDatePath(change.previousDate, input.date)}.`,
        inferredAction: "The product may have lost traffic, ended an activity, changed price, or faced stronger competitors.",
        suggestedResponse: "Use this as a decay signal and compare against activity end, price rise, stock, and review changes."
      });
      continue;
    }

    if (change.changeType === "dropped" && change.previousRank !== null) {
      pushActionInsight(insights, {
        insightDate: input.date,
        sourceType: change.sourceType,
        sourceId: change.sourceId,
        sourceName: change.sourceName,
        previousDate: change.previousDate,
        marketplace: change.marketplace,
        category: change.category,
        asin: change.asin,
        brand: change.brand,
        title: change.title,
        insightType: "bsr_dropped",
        confidence: change.previousRank <= 20 ? "high" : change.previousRank <= 50 ? "medium" : "low",
        currentRank: null,
        previousRank: change.previousRank,
        rankChange: null,
        price: change.currentPrice,
        productUrl: change.productUrl,
        evidence: `${change.asin} dropped out of ${change.category} after ranking #${change.previousRank}. Evidence dates: ${formatEvidenceDatePath(change.previousDate, input.date)}.`,
        inferredAction: "The product lost enough sales velocity to leave the tracked Best Sellers scope.",
        suggestedResponse: "Check whether this was activity-end decay, stock issue, price change, or a temporary Amazon ranking fluctuation."
      });
    }
  }

  for (const event of input.activityEvents ?? []) {
    if (event.eventType === "brand_matrix_push") {
      pushActionInsight(insights, {
        insightDate: input.date,
        sourceType: "category_bestseller",
        sourceId: event.categoryId,
        sourceName: event.categoryName,
        previousDate: null,
        marketplace: event.marketplace,
        category: event.categoryName,
        asin: null,
        brand: event.brand,
        title: null,
        insightType: "brand_push",
        confidence: event.eventLevel === "critical" || event.eventLevel === "high" ? "high" : "medium",
        currentRank: event.rankAfter,
        previousRank: event.rankBefore,
        rankChange: event.rankChange,
        price: null,
        productUrl: null,
        evidence: event.eventSummary,
        inferredAction: event.possibleStrategy,
        suggestedResponse: event.suggestedAction
      });
      continue;
    }

    if (!event.asin) {
      continue;
    }

    const insightType = activityEventInsightType(event.eventType);
    if (!insightType) {
      continue;
    }

    const change = changesByAsin.get(actionInsightChangeKeyFromEvent(event));
    const rankChange = change?.rankChange ?? event.rankChange ?? null;
    const currentRank = change?.currentRank ?? event.rankAfter;
    const previousRank = change?.previousRank ?? event.rankBefore;
    const hasRankLift = (rankChange ?? 0) > 0 || (previousRank === null && currentRank !== null);
    if (!hasRankLift) {
      continue;
    }

    pushActionInsight(insights, {
      insightDate: input.date,
      sourceType: "category_bestseller",
      sourceId: event.categoryId,
      sourceName: event.categoryName,
      previousDate: change?.previousDate ?? null,
      marketplace: event.marketplace,
      category: event.categoryName,
      asin: event.asin,
      brand: event.brand,
      title: event.title,
      insightType,
      confidence: activityEventInsightConfidence(event, currentRank, rankChange),
      currentRank,
      previousRank,
      rankChange,
      price: event.priceAfter,
      productUrl: change?.productUrl ?? amazonProductUrl(event.marketplace, event.asin),
      evidence: formatActivityInsightEvidence(event, previousRank, currentRank),
      inferredAction: event.possibleStrategy,
      suggestedResponse: event.suggestedAction
    });
  }

  return Array.from(insights.values()).sort(compareActionInsights);
}

function pushActionInsight(map: Map<string, CompetitorActionInsight>, insight: CompetitorActionInsight): void {
  map.set(actionInsightKey(insight), insight);
}

function actionInsightKey(insight: CompetitorActionInsight): string {
  const targetKey = insight.asin ?? `brand:${insight.brand ?? ""}`;
  return [
    insight.insightDate,
    insight.sourceType,
    insight.sourceId ?? "",
    insight.category,
    targetKey,
    insight.insightType
  ].join("|");
}

function actionInsightChangeKey(change: BsrRankChange): string {
  return [change.sourceType, change.sourceId ?? "", change.marketplace, change.category, change.asin].join("|");
}

function actionInsightChangeKeyFromEvent(event: CompetitorActivityEvent): string {
  return ["category_bestseller", event.categoryId, event.marketplace, event.categoryName, event.asin ?? ""].join("|");
}

function formatActivityInsightEvidence(event: CompetitorActivityEvent, previousRank: NullableNumber, currentRank: NullableNumber): string {
  const details = [`Source event: ${event.eventType}`, `event date: ${event.eventDate}`, `BSR path: ${formatRankPath(previousRank, currentRank)}`];
  if (event.priceBefore !== null || event.priceAfter !== null) {
    details.push(`price: ${formatNullableMoney(event.priceBefore)} -> ${formatNullableMoney(event.priceAfter)}`);
  }
  if (event.couponBefore || event.couponAfter) {
    details.push(`coupon: ${event.couponBefore ?? "-"} -> ${event.couponAfter ?? "-"}`);
  }
  if (event.dealType) {
    details.push(`deal: ${event.dealType}`);
  }
  return `${event.eventSummary} ${details.join("; ")}.`;
}

function formatEvidenceDatePath(previousDate: string | null, currentDate: string): string {
  return previousDate ? `${previousDate} -> ${currentDate}` : currentDate;
}

function activityEventInsightType(eventType: ActivityEventType): CompetitorActionInsightType | null {
  if (eventType === "price_drop") return "price_drop_rank_lift";
  if (eventType === "coupon_start" || eventType === "coupon_increase") return "coupon_rank_lift";
  if (eventType === "deal_start") return "deal_rank_lift";
  return null;
}

function activityEventInsightConfidence(
  event: CompetitorActivityEvent,
  currentRank: NullableNumber,
  rankChange: NullableNumber
): CompetitorActionInsightConfidence {
  if (event.eventLevel === "critical" || event.eventLevel === "high" || (currentRank !== null && currentRank <= 20) || (rankChange ?? 0) >= 20) {
    return "high";
  }
  if (event.eventLevel === "medium" || (currentRank !== null && currentRank <= 50)) {
    return "medium";
  }
  return "low";
}

function compareActionInsights(a: CompetitorActionInsight, b: CompetitorActionInsight): number {
  const confidenceScore: Record<CompetitorActionInsightConfidence, number> = { high: 3, medium: 2, low: 1 };
  const typeScore: Record<CompetitorActionInsightType, number> = {
    brand_push: 80,
    price_drop_rank_lift: 70,
    coupon_rank_lift: 68,
    deal_rank_lift: 68,
    bsr_new_entry: 60,
    bsr_fast_rise: 58,
    bsr_dropped: 45,
    bsr_rank_drop: 40
  };
  return (
    confidenceScore[b.confidence] - confidenceScore[a.confidence] ||
    typeScore[b.insightType] - typeScore[a.insightType] ||
    (a.currentRank ?? a.previousRank ?? 999999) - (b.currentRank ?? b.previousRank ?? 999999) ||
    (a.asin ?? a.brand ?? "").localeCompare(b.asin ?? b.brand ?? "")
  );
}

function formatRankPath(previousRank: NullableNumber, currentRank: NullableNumber): string {
  const previous = previousRank === null ? "not ranked" : `#${previousRank}`;
  const current = currentRank === null ? "not ranked" : `#${currentRank}`;
  return `${previous} -> ${current}`;
}

function amazonProductUrl(marketplace: string, asin: string): string {
  const domain = marketplace.includes(".") ? marketplace : "www.amazon.com";
  return `https://${domain}/dp/${asin}`;
}

function formatNullableMoney(value: NullableNumber): string {
  return value === null ? "无" : `$${roundCurrency(value).toFixed(2)}`;
}
