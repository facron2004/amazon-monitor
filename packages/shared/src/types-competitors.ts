import type { IceTypeTag, NullableNumber } from "./types-common.js";
import type { BsrRankChange, BsrRankHistory, BsrSourceType, ProductRanking } from "./types-products.js";
import type { CategorySignalLog, ProductPriceHistory, CompetitorActivityEvent } from "./types-category.js";
import type { DailyChange } from "./types-operational.js";

export type CompetitorActionInsightType =
  | "bsr_new_entry"
  | "bsr_fast_rise"
  | "bsr_rank_drop"
  | "bsr_dropped"
  | "price_drop_rank_lift"
  | "coupon_rank_lift"
  | "deal_rank_lift"
  | "brand_push";

export type CompetitorActionInsightConfidence = "high" | "medium" | "low";

export interface CompetitorActionInsight {
  id?: number;
  insightDate: string;
  previousDate: string | null;
  sourceType: BsrSourceType;
  sourceId: number | null;
  sourceName: string;
  marketplace: string;
  category: string;
  asin: string | null;
  brand: string | null;
  title: string | null;
  insightType: CompetitorActionInsightType;
  confidence: CompetitorActionInsightConfidence;
  currentRank: NullableNumber;
  previousRank: NullableNumber;
  rankChange: NullableNumber;
  price: NullableNumber;
  productUrl: string | null;
  evidence: string;
  inferredAction: string;
  suggestedResponse: string;
  createdAt?: string;
}

export interface CompetitorActionInsightInput {
  date: string;
  bsrChanges: BsrRankChange[];
  activityEvents?: CompetitorActivityEvent[];
}

export interface CompetitorPoolItem {
  id: number;
  asin: string;
  marketplace: string;
  title: string;
  brand: string | null;
  imageUrl: string;
  firstSeenKeyword: string;
  firstSeenDate: string;
  lastSeenDate: string;
  appearKeywordCount: number;
  bestRank: number;
  latestRank: number;
  lowestPrice: NullableNumber;
  latestPrice: NullableNumber;
  latestReviewCount?: NullableNumber;
  latestProductUrl: string;
  couponText: string | null;
  dealBadge: string | null;
  latestBsrRank: NullableNumber;
  latestBsrCategory: string | null;
  latestBsrText: string | null;
  latestBestsellerRanks: ProductRanking[];
  sourceType: CompetitorSourceType;
  firstSeenSource: string | null;
  latestCategoryName: string | null;
  latestCategoryRank: NullableNumber;
  iceType?: IceTypeTag | null;
  competitorTier: CompetitorTier;
  competitorReasons: string[];
  isKeyCompetitor: boolean;
  status: "active" | "ignored";
  createdAt: string;
  updatedAt: string;
}

export type CompetitorSourceType = "keyword" | "category" | "hybrid";

export type CompetitorTier = "core" | "rising" | "activity" | "watch";

export interface CompetitorFolder {
  keywordId: number;
  keyword: string;
  marketplace: string;
  competitorCount: number;
  latestSnapshotDate: string | null;
}

export interface ProductLink {
  asin: string;
  marketplace: string;
  url: string;
}

export interface ProductActivityCategoryRank {
  categoryId: number;
  categoryName: string;
  rank: number;
  price: NullableNumber;
  finalEstimatedPrice: NullableNumber;
  reviewCount?: NullableNumber;
  iceType?: IceTypeTag | null;
  couponText: string | null;
  dealBadge: string | null;
  productUrl: string;
}

export interface ProductActivityKeywordRank {
  keywordId: number;
  keyword: string;
  absoluteRank: number;
  organicRank: NullableNumber;
  sponsoredRank: NullableNumber;
  price: NullableNumber;
  couponText: string | null;
  dealBadge: string | null;
  productUrl: string;
}

export interface ProductActivityCalendarDay {
  date: string;
  asin: string;
  marketplace: string;
  title: string | null;
  brand: string | null;
  imageUrl: string | null;
  categoryRanks: ProductActivityCategoryRank[];
  keywordRanks: ProductActivityKeywordRank[];
  bsrRanks: BsrRankHistory[];
  priceHistory: ProductPriceHistory | null;
  events: CompetitorActivityEvent[];
  actionInsights: CompetitorActionInsight[];
  categorySignals: CategorySignalLog[];
  keywordChanges: DailyChange[];
}

export interface ProductActivityCalendarSummary {
  firstSeenDate: string | null;
  lastSeenDate: string | null;
  activeDays: number;
  bestCategoryRank: NullableNumber;
  latestCategoryRank: NullableNumber;
  bestKeywordRank: NullableNumber;
  latestKeywordRank: NullableNumber;
  priceLow: NullableNumber;
  priceHigh: NullableNumber;
  latestReviewCount?: NullableNumber;
  reviewCountChange?: NullableNumber;
  eventCount: number;
}

export interface ProductActivityCalendar {
  asin: string;
  marketplace: string;
  title: string | null;
  brand: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  summary: ProductActivityCalendarSummary;
  days: ProductActivityCalendarDay[];
}
