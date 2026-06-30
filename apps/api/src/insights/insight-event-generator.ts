import type {
  AsinWatchState,
  AttributionTag,
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  BsrRankChange,
  CategoryMonitor,
  CategorySignalLog,
  CompetitorActivityEvent,
  CompetitorPoolItem,
  InsightEvent,
  InsightEventInput,
  InsightEventType,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { inferAttribution, type AttributionInput } from "./attribution-engine.js";
import {
  buildInsightEvent,
  isCoreCompetitor,
  daysBetween,
  medianPositiveReviewChange,
  priceLowWindowFor,
  priceRate,
  rankDelta
} from "./insight-event-builder.js";

export interface GenerateInsightEventsOptions {
  categoryId?: number;
}

export interface CategoryInsightContext {
  category: CategoryMonitor;
  date: string;
  snapshotsByAsin: Map<string, BestsellerRankSnapshot>;
  priceByAsin: Map<string, ProductPriceHistory>;
  brandByName: Map<string, BrandMatrixSnapshot>;
  competitorsByAsin: Map<string, CompetitorPoolItem>;
  watchByAsin: Map<string, AsinWatchState>;
  medianReviewChange: number | null;
}

export function generateInsightEvents(store: Store, date: string, options: GenerateInsightEventsOptions = {}): InsightEvent[] {
  const categories = resolveCategories(store, options.categoryId);
  const generated = new Map<string, InsightEventInput>();

  // Hoist competitor pool and watch states out of the per-category loop —
  // both are global (not category-scoped) and were previously re-queried
  // for every category, causing N full-table scans of competitor_pool.
  const competitors = store.listCompetitors();
  const watchStates = store.listAsinWatchStates();
  const competitorsByAsin = new Map(competitors.map((item) => [item.asin, item]));
  const watchByAsin = new Map(watchStates.map((item) => [item.asin, item]));

  for (const category of categories) {
    const snapshots = store.listCategorySnapshots({ date, categoryId: category.id, limit: category.crawlTopN || 1000 });
    if (snapshots.length === 0) {
      continue;
    }

    const priceHistory = store.listProductPriceHistory({ date, categoryId: category.id, limit: 1000 });
    const activityEvents = store.listCategoryActivityEvents({ date, categoryId: category.id, limit: 1000 });
    const rankChanges = store.listBsrRankChanges({
      date,
      sourceType: "category_bestseller",
      sourceId: category.id,
      includeUnchanged: false,
      limit: 1000
    });
    const brandMatrix = store.listBrandMatrix({ date, categoryId: category.id });
    const categorySignals = store.listCategorySignals({ date, categoryId: category.id, limit: 1000 });
    const context: CategoryInsightContext = {
      category,
      date,
      snapshotsByAsin: new Map(snapshots.map((item) => [item.asin, item])),
      priceByAsin: new Map(priceHistory.map((item) => [item.asin, item])),
      brandByName: new Map(brandMatrix.map((item) => [item.brand, item])),
      competitorsByAsin,
      watchByAsin,
      medianReviewChange: medianPositiveReviewChange(priceHistory)
    };

    for (const event of activityEvents) {
      const insight = insightFromActivityEvent(context, event);
      if (insight) {
        generated.set(insight.id, insight);
      }
    }

    for (const change of rankChanges) {
      const insight = insightFromRankChange(context, change);
      if (insight) {
        generated.set(insight.id, insight);
      }
    }

    for (const price of priceHistory) {
      const insight = insightFromPriceLow(context, price, activityEvents);
      if (insight) {
        generated.set(insight.id, insight);
      }
    }

    for (const signal of categorySignals) {
      const insight = insightFromSignal(context, signal);
      if (insight) {
        generated.set(insight.id, insight);
      }
    }

    for (const snapshot of snapshots) {
      const lowReview = insightFromLowReviewHighRank(context, snapshot);
      if (lowReview) {
        generated.set(lowReview.id, lowReview);
      }
      const coreRisk = insightFromCoreCompetitor(context, snapshot);
      if (coreRisk) {
        generated.set(coreRisk.id, coreRisk);
      }
    }
  }

  const persisted: InsightEvent[] = [];
  store.runInTransaction(() => {
    for (const event of generated.values()) {
      persisted.push(store.upsertInsightEvent(event));
    }
  });
  return persisted.sort((left, right) => right.scoreTotal - left.scoreTotal || left.id.localeCompare(right.id));
}

function resolveCategories(store: Store, categoryId?: number): CategoryMonitor[] {
  if (categoryId !== undefined) {
    const category = store.getCategoryMonitor(categoryId);
    return category ? [category] : [];
  }
  return store.listCategoryMonitors().filter((category) => category.status === "enabled");
}

function insightFromActivityEvent(context: CategoryInsightContext, event: CompetitorActivityEvent): InsightEventInput | null {
  const eventType = mapActivityEventType(event);
  if (!eventType) {
    return null;
  }
  const snapshot = event.asin ? context.snapshotsByAsin.get(event.asin) ?? null : null;
  const price = event.asin ? context.priceByAsin.get(event.asin) ?? null : null;
  const brand = event.brand ? context.brandByName.get(event.brand) ?? null : null;
  const competitor = event.asin ? context.competitorsByAsin.get(event.asin) ?? null : null;
  const attribution = inferAttribution(buildAttributionInput(context, {
    currentRank: event.rankAfter,
    previousRank: event.rankBefore,
    priceChangeRate: event.priceChangeRate,
    couponBefore: event.couponBefore,
    couponAfter: event.couponAfter,
    dealBefore: event.eventType === "deal_end" || event.eventType === "activity_end_rank_drop" ? event.dealType : null,
    dealAfter: event.eventType === "deal_start" ? event.dealType : null,
    reviewCount: event.reviewCountAfter ?? snapshot?.reviewCount ?? null,
    reviewCountChange: event.reviewCountChange ?? null,
    brand,
    daysListed: competitor ? daysBetween(competitor.firstSeenDate, context.date) + 1 : null
  }));
  const priceLowWindow = event.priceChangeRate !== null && event.priceChangeRate < 0 && price ? priceLowWindowFor(price) : null;
  return buildInsightEvent(context, {
    eventType,
    asin: event.asin,
    brandName: event.brand,
    title: event.title ?? snapshot?.title ?? null,
    productUrl: snapshot?.productUrl ?? null,
    imageUrl: snapshot?.imageUrl ?? null,
    sourceEventKey: event.eventKey,
    sourceEventType: event.eventType,
    currentRank: event.rankAfter,
    previousRank: event.rankBefore,
    rankChange: event.rankChange,
    priceBefore: event.priceBefore,
    priceAfter: event.priceAfter,
    priceChangeRate: event.priceChangeRate,
    reviewCount: event.reviewCountAfter ?? snapshot?.reviewCount ?? null,
    reviewCountBefore: event.reviewCountBefore ?? null,
    reviewCountAfter: event.reviewCountAfter ?? null,
    reviewCountChange: event.reviewCountChange ?? null,
    couponBefore: event.couponBefore,
    couponAfter: event.couponAfter,
    dealType: event.dealType,
    priceLowWindow,
    attributionTags: attribution.tags,
    evidenceItems: attribution.evidenceItems,
    suggestedAction: event.suggestedAction,
    brand,
    competitor
  });
}

function insightFromRankChange(context: CategoryInsightContext, change: BsrRankChange): InsightEventInput | null {
  if (change.changeType !== "dropped" && !(change.changeType === "rank_down" && (change.rankChange ?? 0) <= -20)) {
    return null;
  }
  const snapshot = context.snapshotsByAsin.get(change.asin) ?? null;
  const price = context.priceByAsin.get(change.asin) ?? null;
  const brand = change.brand ? context.brandByName.get(change.brand) ?? null : null;
  const competitor = context.competitorsByAsin.get(change.asin) ?? null;
  const eventType: InsightEventType = change.changeType === "dropped" ? "DROPPED_FROM_TOP100" : "RANK_DROP";
  const attribution = inferAttribution(buildAttributionInput(context, {
    currentRank: change.currentRank,
    previousRank: change.previousRank,
    priceChangeRate: null,
    couponBefore: null,
    couponAfter: snapshot?.couponText ?? null,
    dealBefore: null,
    dealAfter: snapshot?.dealBadge ?? null,
    reviewCount: snapshot?.reviewCount ?? null,
    reviewCountChange: price?.reviewCountChange ?? null,
    brand,
    daysListed: competitor ? daysBetween(competitor.firstSeenDate, context.date) + 1 : null
  }));
  return buildInsightEvent(context, {
    eventType,
    asin: change.asin,
    brandName: change.brand,
    title: change.title,
    productUrl: snapshot?.productUrl ?? change.productUrl,
    imageUrl: snapshot?.imageUrl ?? null,
    sourceEventKey: `bsr_change:${change.asin}:${change.changeType}`,
    sourceEventType: change.changeType,
    currentRank: change.currentRank,
    previousRank: change.previousRank,
    rankChange: change.rankChange,
    priceBefore: null,
    priceAfter: change.currentPrice,
    priceChangeRate: null,
    reviewCount: snapshot?.reviewCount ?? null,
    reviewCountBefore: price?.previousReviewCount ?? null,
    reviewCountAfter: price?.reviewCount ?? null,
    reviewCountChange: price?.reviewCountChange ?? null,
    couponBefore: null,
    couponAfter: snapshot?.couponText ?? null,
    dealType: snapshot?.dealBadge ?? null,
    priceLowWindow: null,
    attributionTags: attribution.tags,
    evidenceItems: attribution.evidenceItems,
    suggestedAction: change.changeType === "dropped" ? "复盘该 ASIN 跌出 Top100 的价格、活动和品牌位变化。" : "检查是否由活动结束、价格变化或竞品上攻导致排名下滑。",
    brand,
    competitor
  });
}

function insightFromPriceLow(
  context: CategoryInsightContext,
  price: ProductPriceHistory,
  activityEvents: CompetitorActivityEvent[]
): InsightEventInput | null {
  const lowWindow = priceLowWindowFor(price);
  if (!lowWindow) {
    return null;
  }
  const priceDropEvent = activityEvents.find((event) => event.asin === price.asin && event.eventType === "price_drop");
  if (!priceDropEvent) {
    return null;
  }
  const snapshot = context.snapshotsByAsin.get(price.asin) ?? null;
  const brand = price.brand ? context.brandByName.get(price.brand) ?? null : null;
  const competitor = context.competitorsByAsin.get(price.asin) ?? null;
  const attribution = inferAttribution(buildAttributionInput(context, {
    currentRank: snapshot?.rank ?? null,
    previousRank: priceDropEvent.rankBefore,
    priceChangeRate: priceDropEvent.priceChangeRate,
    couponBefore: priceDropEvent.couponBefore,
    couponAfter: priceDropEvent.couponAfter,
    dealBefore: null,
    dealAfter: priceDropEvent.dealType,
    reviewCount: price.reviewCount ?? null,
    reviewCountChange: price.reviewCountChange ?? null,
    brand,
    daysListed: competitor ? daysBetween(competitor.firstSeenDate, context.date) + 1 : null
  }));
  return buildInsightEvent(context, {
    eventType: "PRICE_NEW_LOW",
    asin: price.asin,
    brandName: price.brand,
    title: price.title,
    productUrl: price.productUrl ?? snapshot?.productUrl ?? null,
    imageUrl: price.imageUrl ?? snapshot?.imageUrl ?? null,
    sourceEventKey: `price_low:${price.asin}:${lowWindow}`,
    sourceEventType: "price_low",
    currentRank: snapshot?.rank ?? null,
    previousRank: priceDropEvent.rankBefore,
    rankChange: rankDelta(priceDropEvent.rankBefore, snapshot?.rank ?? priceDropEvent.rankAfter),
    priceBefore: priceDropEvent.priceBefore,
    priceAfter: price.currentPrice,
    priceChangeRate: priceDropEvent.priceChangeRate,
    reviewCount: price.reviewCount ?? null,
    reviewCountBefore: price.previousReviewCount ?? null,
    reviewCountAfter: price.reviewCount ?? null,
    reviewCountChange: price.reviewCountChange ?? null,
    couponBefore: priceDropEvent.couponBefore,
    couponAfter: price.couponText ?? null,
    dealType: price.dealBadge ?? null,
    priceLowWindow: lowWindow,
    attributionTags: attribution.tags,
    evidenceItems: [...attribution.evidenceItems, `价格触达 ${lowWindow} 新低`],
    suggestedAction: "记录该低价点，连续观察 3 天排名是否维持，判断是否为价格战信号。",
    brand,
    competitor
  });
}

function insightFromSignal(context: CategoryInsightContext, signal: CategorySignalLog): InsightEventInput | null {
  if (signal.signalType !== "new_product_breakout" || !signal.asin) {
    return null;
  }
  const snapshot = context.snapshotsByAsin.get(signal.asin) ?? null;
  const price = context.priceByAsin.get(signal.asin) ?? null;
  const brand = signal.brand ? context.brandByName.get(signal.brand) ?? null : null;
  const competitor = context.competitorsByAsin.get(signal.asin) ?? null;
  const attribution = inferAttribution(buildAttributionInput(context, {
    currentRank: signal.rank,
    previousRank: signal.previousRank,
    priceChangeRate: null,
    couponBefore: null,
    couponAfter: snapshot?.couponText ?? null,
    dealBefore: null,
    dealAfter: snapshot?.dealBadge ?? null,
    reviewCount: snapshot?.reviewCount ?? null,
    reviewCountChange: price?.reviewCountChange ?? null,
    brand,
    daysListed: competitor ? daysBetween(competitor.firstSeenDate, context.date) + 1 : null
  }));
  return buildInsightEvent(context, {
    eventType: "NEW_PRODUCT_BREAKOUT",
    asin: signal.asin,
    brandName: signal.brand,
    title: signal.title ?? snapshot?.title ?? null,
    productUrl: snapshot?.productUrl ?? null,
    imageUrl: snapshot?.imageUrl ?? null,
    sourceEventKey: `signal:${signal.signalType}:${signal.asin}`,
    sourceEventType: signal.signalType,
    currentRank: signal.rank,
    previousRank: signal.previousRank,
    rankChange: rankDelta(signal.previousRank, signal.rank),
    priceBefore: signal.previousPrice,
    priceAfter: signal.price,
    priceChangeRate: priceRate(signal.previousPrice, signal.price),
    reviewCount: snapshot?.reviewCount ?? null,
    reviewCountBefore: price?.previousReviewCount ?? null,
    reviewCountAfter: price?.reviewCount ?? snapshot?.reviewCount ?? null,
    reviewCountChange: price?.reviewCountChange ?? null,
    couponBefore: null,
    couponAfter: snapshot?.couponText ?? null,
    dealType: snapshot?.dealBadge ?? null,
    priceLowWindow: price ? priceLowWindowFor(price) : null,
    attributionTags: attribution.tags,
    evidenceItems: [...attribution.evidenceItems, signal.content],
    suggestedAction: "加入观察，跟踪 3/7/14 天后是否仍能维持 Top50/Top100。",
    brand,
    competitor
  });
}

function insightFromLowReviewHighRank(context: CategoryInsightContext, snapshot: BestsellerRankSnapshot): InsightEventInput | null {
  if (snapshot.reviewCount === null || snapshot.reviewCount >= 100 || snapshot.rank > 50) {
    return null;
  }
  const price = context.priceByAsin.get(snapshot.asin) ?? null;
  const brand = snapshot.brand ? context.brandByName.get(snapshot.brand) ?? null : null;
  const competitor = context.competitorsByAsin.get(snapshot.asin) ?? null;
  const attribution = inferAttribution(buildAttributionInput(context, {
    currentRank: snapshot.rank,
    previousRank: null,
    priceChangeRate: null,
    couponBefore: null,
    couponAfter: snapshot.couponText,
    dealBefore: null,
    dealAfter: snapshot.dealBadge,
    reviewCount: snapshot.reviewCount,
    reviewCountChange: price?.reviewCountChange ?? null,
    brand,
    daysListed: competitor ? daysBetween(competitor.firstSeenDate, context.date) + 1 : null
  }));
  return buildInsightEvent(context, {
    eventType: "LOW_REVIEW_HIGH_RANK",
    asin: snapshot.asin,
    brandName: snapshot.brand,
    title: snapshot.title,
    productUrl: snapshot.productUrl,
    imageUrl: snapshot.imageUrl,
    sourceEventKey: `low_review_high_rank:${snapshot.asin}`,
    sourceEventType: "low_review_high_rank",
    currentRank: snapshot.rank,
    previousRank: null,
    rankChange: null,
    priceBefore: null,
    priceAfter: snapshot.currentPrice,
    priceChangeRate: null,
    reviewCount: snapshot.reviewCount,
    reviewCountBefore: price?.previousReviewCount ?? null,
    reviewCountAfter: snapshot.reviewCount,
    reviewCountChange: price?.reviewCountChange ?? null,
    couponBefore: null,
    couponAfter: snapshot.couponText,
    dealType: snapshot.dealBadge,
    priceLowWindow: price ? priceLowWindowFor(price) : null,
    attributionTags: attribution.tags,
    evidenceItems: [...attribution.evidenceItems, `Review ${snapshot.reviewCount}，当前排名 #${snapshot.rank}`],
    suggestedAction: "加入新品/低评论高排名观察清单，判断是否存在可学习的价格或活动节奏。",
    brand,
    competitor
  });
}

function insightFromCoreCompetitor(context: CategoryInsightContext, snapshot: BestsellerRankSnapshot): InsightEventInput | null {
  const competitor = context.competitorsByAsin.get(snapshot.asin) ?? null;
  const watch = context.watchByAsin.get(snapshot.asin) ?? null;
  const isCore = isCoreCompetitor(competitor, watch);
  if (!isCore || snapshot.rank > 50) {
    return null;
  }
  const price = context.priceByAsin.get(snapshot.asin) ?? null;
  const brand = snapshot.brand ? context.brandByName.get(snapshot.brand) ?? null : null;
  const attribution = inferAttribution(buildAttributionInput(context, {
    currentRank: snapshot.rank,
    previousRank: null,
    priceChangeRate: null,
    couponBefore: null,
    couponAfter: snapshot.couponText,
    dealBefore: null,
    dealAfter: snapshot.dealBadge,
    reviewCount: snapshot.reviewCount,
    reviewCountChange: price?.reviewCountChange ?? null,
    brand,
    daysListed: competitor ? daysBetween(competitor.firstSeenDate, context.date) + 1 : null
  }));
  return buildInsightEvent(context, {
    eventType: "CORE_COMPETITOR_RISK",
    asin: snapshot.asin,
    brandName: snapshot.brand,
    title: snapshot.title,
    productUrl: snapshot.productUrl,
    imageUrl: snapshot.imageUrl,
    sourceEventKey: `core_risk:${snapshot.asin}`,
    sourceEventType: "core_competitor",
    currentRank: snapshot.rank,
    previousRank: null,
    rankChange: null,
    priceBefore: null,
    priceAfter: snapshot.currentPrice,
    priceChangeRate: null,
    reviewCount: snapshot.reviewCount,
    reviewCountBefore: price?.previousReviewCount ?? null,
    reviewCountAfter: snapshot.reviewCount,
    reviewCountChange: price?.reviewCountChange ?? null,
    couponBefore: null,
    couponAfter: snapshot.couponText,
    dealType: snapshot.dealBadge,
    priceLowWindow: price ? priceLowWindowFor(price) : null,
    attributionTags: attribution.tags,
    evidenceItems: [...attribution.evidenceItems, `核心竞品当前进入 Top${snapshot.rank <= 20 ? "20" : "50"}`],
    suggestedAction: "复核该核心竞品的价格、Coupon/Deal 和 Review 节奏，必要时升级为今日重点跟进。",
    brand,
    competitor
  });
}

function buildAttributionInput(
  context: CategoryInsightContext,
  input: Omit<AttributionInput, "medianReviewChange" | "brandRisingCount" | "brandNewTop100Count"> & {
    brand: BrandMatrixSnapshot | null;
    daysListed: number | null;
  }
): AttributionInput {
  return {
    currentRank: input.currentRank,
    previousRank: input.previousRank,
    priceChangeRate: input.priceChangeRate,
    couponBefore: input.couponBefore,
    couponAfter: input.couponAfter,
    dealBefore: input.dealBefore,
    dealAfter: input.dealAfter,
    reviewCount: input.reviewCount,
    reviewCountChange: input.reviewCountChange,
    medianReviewChange: context.medianReviewChange,
    daysListed: input.daysListed,
    brandRisingCount: input.brand?.rankUpCount ?? null,
    brandNewTop100Count: input.brand?.newEntryCount ?? null
  };
}

function mapActivityEventType(event: CompetitorActivityEvent): InsightEventType | null {
  if (event.eventType === "new_entry_top50") {
    return event.rankAfter !== null && event.rankAfter <= 20 ? "NEW_TOP20_ENTRY" : "NEW_TOP50_ENTRY";
  }
  if (event.eventType === "new_entry_top100") return "NEW_TOP100_ENTRY";
  if (event.eventType === "rank_surge") return "RANK_SURGE";
  if (event.eventType === "price_drop") return "PRICE_DROP";
  if (event.eventType === "coupon_start" || event.eventType === "coupon_increase") return "COUPON_ADDED";
  if (event.eventType === "coupon_end") return "COUPON_REMOVED";
  if (event.eventType === "deal_start") return "DEAL_ADDED";
  if (event.eventType === "deal_end") return "DEAL_REMOVED";
  if (event.eventType === "review_growth") return "REVIEW_SPIKE";
  if (event.eventType === "brand_matrix_push") return "BRAND_MATRIX_SURGE";
  if (event.eventType === "brand_matrix_drop") return "BRAND_MATRIX_DROP";
  if (event.eventType === "activity_end_rank_drop") return "RANK_DROP";
  return null;
}
