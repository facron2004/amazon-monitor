import type {
  AsinWatchState,
  AttributionTag,
  BrandMatrixSnapshot,
  CompetitorPoolItem,
  InsightEventInput,
  InsightEventLevel,
  InsightEventType,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import {
  attributionTagLabels,
  insightEventTypeLabels
} from "@amazon-monitor/shared";
import { inferStrategyTags } from "@amazon-monitor/shared";
import type { CategoryInsightContext } from "./insight-event-generator.js";
import { scheduleReviewDate } from "./review-scheduler.js";
import { scoreInsightEvent, type InsightScoringInput } from "./scoring-engine.js";

/**
 * 判断一个 ASIN 是否属于"核心竞品"——综合三个信号源:
 *   1. 竞品池显式标记 (competitorTier === "core" 或 isKeyCompetitor)
 *   2. 用户在 watch state 里手动置为 CORE
 * 之前在 insight-event-builder.ts 和 insight-event-generator.ts 各有一份重复实现,
 * 现在统一从这里导出。
 */
export function isCoreCompetitor(
  competitor: CompetitorPoolItem | null,
  watch: AsinWatchState | null | undefined
): boolean {
  if (competitor?.competitorTier === "core" || competitor?.isKeyCompetitor === true) {
    return true;
  }
  return watch?.watchLevel === "CORE";
}

interface BuildInsightInput {
  eventType: InsightEventType;
  asin: string | null;
  brandName: string | null;
  title: string | null;
  productUrl: string | null;
  imageUrl: string | null;
  sourceEventKey: string;
  sourceEventType: string;
  currentRank: number | null;
  previousRank: number | null;
  rankChange: number | null;
  priceBefore: number | null;
  priceAfter: number | null;
  priceChangeRate: number | null;
  reviewCount: number | null;
  reviewCountBefore: number | null;
  reviewCountAfter: number | null;
  reviewCountChange: number | null;
  couponBefore: string | null;
  couponAfter: string | null;
  dealType: string | null;
  priceLowWindow: "T30" | "T60" | "T90" | "ALL" | null;
  attributionTags: AttributionTag[];
  evidenceItems: string[];
  suggestedAction: string;
  brand: BrandMatrixSnapshot | null;
  competitor: CompetitorPoolItem | null;
}

export function buildInsightEvent(context: CategoryInsightContext, input: BuildInsightInput): InsightEventInput {
  const watchState = input.asin ? context.watchByAsin.get(input.asin) ?? null : null;
  const coreCompetitor = isCoreCompetitor(input.competitor, watchState);
  const daysListed = input.competitor ? daysBetween(input.competitor.firstSeenDate, context.date) + 1 : input.previousRank === null ? 1 : null;
  const scoring = scoreInsightEvent(buildScoringInput(input, daysListed, coreCompetitor));
  const eventLevel = promoteCoreCompetitorEventLevel(eventLevelFromScore(scoring.total), input.eventType, coreCompetitor);
  const event: InsightEventInput = {
    id: insightEventId(context.date, context.category.id, input.asin, input.brandName, input.eventType),
    eventDate: context.date,
    asin: input.asin,
    brand: input.brandName,
    categoryId: context.category.id,
    keywordId: null,
    eventType: input.eventType,
    eventLevel,
    eventTitle: eventTitle(input),
    eventSummary: eventSummary(input, scoring.total),
    attributionTags: input.attributionTags,
    evidence: {
      sourceEventKey: input.sourceEventKey,
      sourceEventType: input.sourceEventType,
      marketplace: context.category.marketplace,
      categoryName: context.category.name,
      productUrl: input.productUrl,
      imageUrl: input.imageUrl,
      title: input.title,
      currentRank: input.currentRank,
      previousRank: input.previousRank,
      rankChange: input.rankChange,
      priceBefore: input.priceBefore,
      priceAfter: input.priceAfter,
      priceChangeRate: input.priceChangeRate,
      reviewCountBefore: input.reviewCountBefore,
      reviewCountAfter: input.reviewCountAfter,
      reviewCountChange: input.reviewCountChange,
      couponBefore: input.couponBefore,
      couponAfter: input.couponAfter,
      dealType: input.dealType,
      brandRisingCount: input.brand?.rankUpCount ?? null,
      brandNewEntryCount: input.brand?.newEntryCount ?? null,
      brandTop100Count: input.brand?.productCountTop100 ?? null,
      priceLowWindow: input.priceLowWindow,
      isCoreCompetitor: coreCompetitor,
      strategyTags: inferStrategyTags({
        eventType: input.eventType,
        attributionTags: input.attributionTags,
        currentRank: input.currentRank,
        previousRank: input.previousRank,
        rankChange: input.rankChange,
        brandRisingCount: input.brand?.rankUpCount ?? null,
        brandNewEntryCount: input.brand?.newEntryCount ?? null,
        isCoreCompetitor: coreCompetitor
      }),
      evidenceItems: input.evidenceItems
    },
    scoreTotal: scoring.total,
    scoreLevel: scoring.level,
    scoreBreakdown: scoring.breakdown,
    suggestedAction: input.suggestedAction,
    status: "TODO",
    reviewDueDate: scheduleReviewDate({
      eventDate: context.date,
      eventType: input.eventType,
      scoreLevel: scoring.level,
      attributionTags: input.attributionTags
    }),
    reviewResult: null,
    userNote: null
  };
  return event;
}

function buildScoringInput(input: BuildInsightInput, daysListed: number | null, isCoreCompetitor: boolean): InsightScoringInput {
  return {
    eventType: input.eventType,
    currentRank: input.currentRank,
    previousRank: input.previousRank,
    rankChange: input.rankChange,
    reviewCount: input.reviewCount,
    daysListed,
    couponAdded: !input.couponBefore && Boolean(input.couponAfter),
    dealAdded: input.sourceEventType === "deal_start",
    priceChangeRate: input.priceChangeRate,
    priceLowWindow: input.priceLowWindow,
    brandRisingCount: input.brand?.rankUpCount ?? null,
    brandNewTop100Count: input.brand?.newEntryCount ?? null,
    brandTop100ShareChange: null,
    isCoreCompetitor,
    coreCompetitorRising3Days: false
  };
}

export function rankDelta(previousRank: number | null | undefined, currentRank: number | null | undefined): number | null {
  if (previousRank === null || previousRank === undefined || currentRank === null || currentRank === undefined) {
    return null;
  }
  return previousRank - currentRank;
}

export function priceRate(previousPrice: number | null, currentPrice: number | null): number | null {
  if (!previousPrice || currentPrice === null) {
    return null;
  }
  return Math.round(((currentPrice - previousPrice) / previousPrice) * 10000) / 10000;
}

export function priceLowWindowFor(price: ProductPriceHistory): "T30" | "T60" | "T90" | "ALL" | null {
  if (price.currentPrice === null) {
    return null;
  }
  if (price.t90LowPrice !== null && price.currentPrice <= price.t90LowPrice) return "T90";
  if (price.t60LowPrice !== null && price.currentPrice <= price.t60LowPrice) return "T60";
  if (price.t30LowPrice !== null && price.currentPrice <= price.t30LowPrice) return "T30";
  if (price.monitoringLowPrice !== null && price.currentPrice <= price.monitoringLowPrice) return "ALL";
  return null;
}

export function medianPositiveReviewChange(items: ProductPriceHistory[]): number | null {
  const values = items
    .map((item) => item.reviewCountChange)
    .filter((value): value is number => value !== null && value !== undefined && value > 0)
    .sort((left, right) => left - right);
  if (values.length === 0) {
    return null;
  }
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 0) {
    return ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2;
  }
  return values[middle] ?? null;
}

export function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }
  return Math.floor((end - start) / 86_400_000);
}

function insightEventId(date: string, categoryId: number, asin: string | null, brand: string | null, eventType: InsightEventType): string {
  const target = asin ? `asin:${asin}` : `brand:${brand ?? "unknown"}`;
  return [date, `category:${categoryId}`, target, eventType].join("|");
}

function eventLevelFromScore(score: number): InsightEventLevel {
  if (score >= 85) return "P0";
  if (score >= 55) return "P1";
  return "P2";
}

const corePriorityEventTypes = new Set<InsightEventType>([
  "NEW_TOP20_ENTRY",
  "NEW_TOP50_ENTRY",
  "PRICE_NEW_LOW",
  "COUPON_ADDED",
  "COUPON_REMOVED",
  "CORE_COMPETITOR_RISK"
]);

function promoteCoreCompetitorEventLevel(
  level: InsightEventLevel,
  eventType: InsightEventType,
  isCoreCompetitor: boolean
): InsightEventLevel {
  if (!isCoreCompetitor || !corePriorityEventTypes.has(eventType)) {
    return level;
  }
  if (level === "P2") return "P1";
  if (level === "P1") return "P0";
  return level;
}

function eventTitle(input: BuildInsightInput): string {
  const target = [input.brandName, input.asin].filter(Boolean).join(" ") || input.brandName || input.asin || "品牌事件";
  if (input.eventType === "NEW_TOP20_ENTRY" || input.eventType === "NEW_TOP50_ENTRY" || input.eventType === "NEW_TOP100_ENTRY") {
    return `【${eventTypeLabel(input.eventType)}】${target} 进入 ${formatRank(input.currentRank)}`;
  }
  if (input.eventType === "BRAND_MATRIX_SURGE") {
    return `【品牌矩阵上攻】${input.brandName ?? "未知品牌"} 多 ASIN 同步上升`;
  }
  if (input.eventType === "PRICE_NEW_LOW") {
    return `【价格新低】${target} 触达 ${input.priceLowWindow ?? ""} 低价`;
  }
  return `【${eventTypeLabel(input.eventType)}】${target}`;
}

function eventSummary(input: BuildInsightInput, scoreTotal: number): string {
  const whatHappened = `发生了什么：${rankSentence(input)}${priceSentence(input)}${promoSentence(input)}`;
  const attribution = `可能原因：${input.attributionTags.map(attributionLabel).join(" + ")}。`;
  const impact = `影响判断：机会分 ${scoreTotal}，当前证据来自排名、价格、活动、Review 和品牌矩阵字段。`;
  return [whatHappened, attribution, impact, `建议动作：${input.suggestedAction}`].join("\n");
}

function rankSentence(input: BuildInsightInput): string {
  if (input.previousRank === null && input.currentRank === null) {
    return "暂无明确排名路径。";
  }
  return `BSR ${formatRank(input.previousRank)} -> ${formatRank(input.currentRank)}，${rankChangeText(input.rankChange)}。`;
}

function priceSentence(input: BuildInsightInput): string {
  if (input.priceBefore === null && input.priceAfter === null) {
    return "";
  }
  return ` 价格 ${formatMoney(input.priceBefore)} -> ${formatMoney(input.priceAfter)}。`;
}

function promoSentence(input: BuildInsightInput): string {
  const promo = [input.couponAfter ? `Coupon: ${input.couponAfter}` : null, input.dealType ? `Deal: ${input.dealType}` : null].filter(Boolean);
  return promo.length ? ` 活动 ${promo.join("；")}。` : "";
}

function eventTypeLabel(type: InsightEventType): string {
  return insightEventTypeLabels[type];
}

function attributionLabel(tag: AttributionTag): string {
  return attributionTagLabels[tag];
}

function rankChangeText(value: number | null): string {
  if (value === null) return "排名变化暂无";
  if (value > 0) return `上升 ${value} 名`;
  if (value < 0) return `下滑 ${Math.abs(value)} 名`;
  return "排名持平";
}

function formatRank(rank: number | null): string {
  return rank === null ? "未上榜" : `#${rank}`;
}

function formatMoney(value: number | null): string {
  return value === null ? "-" : `$${Math.round(value * 100) / 100}`;
}
