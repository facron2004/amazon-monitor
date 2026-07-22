import type { InsightEventInput } from "@amazon-monitor/shared";
import type { InsightBuildContext } from "./insight-build-context.js";
import { buildInsightEvent, priceRate, rankDelta } from "./insight-event-builder.js";
import { canonicalImageUrl, normalizeListingText, ratingDelta } from "./listing-diff.js";

export interface SnapshotDiffProduct {
  asin: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  rank: number;
  currentPrice: number | null;
  rating: number | null;
  reviewCount: number | null;
  couponText: string | null;
  dealBadge: string | null;
}

export function buildSnapshotDiffEvents(
  context: InsightBuildContext,
  snapshot: SnapshotDiffProduct,
  previous: SnapshotDiffProduct
): InsightEventInput[] {
  const events: InsightEventInput[] = [];
  const ratingChange = ratingDelta(previous.rating, snapshot.rating);
  if (ratingChange !== null && ratingChange <= -0.2) {
    events.push(buildSnapshotDiffEvent(context, snapshot, previous, {
      eventType: "RATING_DROP",
      sourceEventType: "rating_drop",
      evidenceItems: [`评分 ${previous.rating?.toFixed(1)} -> ${snapshot.rating?.toFixed(1)}（${ratingChange.toFixed(1)}）`],
      suggestedAction: "复核近期差评主题、评分分布和 Listing 承诺，观察后续 3 天转化与排名变化。",
      ratingChange
    }));
  }

  const changedFields: Array<"title" | "mainImage"> = [];
  if (normalizeListingText(previous.title) !== normalizeListingText(snapshot.title)) changedFields.push("title");
  if (canonicalImageUrl(previous.imageUrl) !== canonicalImageUrl(snapshot.imageUrl)) changedFields.push("mainImage");
  if (changedFields.length > 0) {
    events.push(buildSnapshotDiffEvent(context, snapshot, previous, {
      eventType: "LISTING_CHANGED",
      sourceEventType: "listing_changed",
      evidenceItems: changedFields.map((field) => field === "title"
        ? `标题变化：${previous.title} -> ${snapshot.title}`
        : `主图变化：${previous.imageUrl} -> ${snapshot.imageUrl}`),
      suggestedAction: "记录 Listing 变更并观察后续 3 天排名、价格和 Review 节奏，判断是否改善点击或转化。",
      listingChangedFields: changedFields
    }));
  }
  return events;
}

export function snapshotDiffEventKey(event: Pick<InsightEventInput, "eventDate" | "asin" | "eventType">): string | null {
  if (!event.asin || (event.eventType !== "RATING_DROP" && event.eventType !== "LISTING_CHANGED")) return null;
  return `${event.eventDate}|${event.asin}|${event.eventType}`;
}

interface SnapshotDiffDetails {
  eventType: "RATING_DROP" | "LISTING_CHANGED";
  sourceEventType: "rating_drop" | "listing_changed";
  evidenceItems: string[];
  suggestedAction: string;
  ratingChange?: number;
  listingChangedFields?: Array<"title" | "mainImage">;
}

function buildSnapshotDiffEvent(
  context: InsightBuildContext,
  snapshot: SnapshotDiffProduct,
  previous: SnapshotDiffProduct,
  details: SnapshotDiffDetails
): InsightEventInput {
  return buildInsightEvent(context, {
    eventType: details.eventType,
    asin: snapshot.asin,
    brandName: snapshot.brand,
    title: snapshot.title,
    productUrl: snapshot.productUrl,
    imageUrl: snapshot.imageUrl,
    sourceEventKey: `${details.sourceEventType}:${snapshot.asin}`,
    sourceEventType: details.sourceEventType,
    currentRank: snapshot.rank,
    previousRank: previous.rank,
    rankChange: rankDelta(previous.rank, snapshot.rank),
    priceBefore: previous.currentPrice,
    priceAfter: snapshot.currentPrice,
    priceChangeRate: priceRate(previous.currentPrice, snapshot.currentPrice),
    reviewCount: snapshot.reviewCount,
    reviewCountBefore: previous.reviewCount,
    reviewCountAfter: snapshot.reviewCount,
    reviewCountChange: nullableDelta(previous.reviewCount, snapshot.reviewCount),
    ratingBefore: previous.rating,
    ratingAfter: snapshot.rating,
    ratingChange: details.ratingChange,
    titleBefore: previous.title,
    titleAfter: snapshot.title,
    imageUrlBefore: previous.imageUrl,
    imageUrlAfter: snapshot.imageUrl,
    listingChangedFields: details.listingChangedFields,
    couponBefore: previous.couponText,
    couponAfter: snapshot.couponText,
    dealType: snapshot.dealBadge,
    priceLowWindow: null,
    attributionTags: ["NO_CLEAR_DRIVER"],
    evidenceItems: details.evidenceItems,
    suggestedAction: details.suggestedAction,
    brand: snapshot.brand ? context.brandByName.get(snapshot.brand) ?? null : null,
    competitor: context.competitorsByAsin.get(snapshot.asin) ?? null
  });
}

function nullableDelta(before: number | null, after: number | null): number | null {
  return before === null || after === null ? null : after - before;
}
