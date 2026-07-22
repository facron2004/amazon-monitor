import { inferIceType, selectSpecificBestsellerRank } from "@amazon-monitor/shared";
import type {
  BsrSourceType,
  CompetitorActionInsight,
  CompetitorFolder,
  CompetitorPoolItem,
  CompetitorTier,
  ProductRanking
} from "@amazon-monitor/shared";
import { parseJsonArray } from "./json-utils.js";

export interface ActionInsightRow {
  id: number;
  insight_date: string;
  previous_date: string | null;
  source_type: BsrSourceType;
  source_id: number | null;
  source_name: string;
  marketplace: string;
  category: string;
  asin: string | null;
  brand: string | null;
  title: string | null;
  insight_type: CompetitorActionInsight["insightType"];
  confidence: CompetitorActionInsight["confidence"];
  current_rank: number | null;
  previous_rank: number | null;
  rank_change: number | null;
  price: number | null;
  product_url: string | null;
  evidence: string;
  inferred_action: string;
  suggested_response: string;
  created_at: string;
}

export function mapActionInsight(row: ActionInsightRow): CompetitorActionInsight {
  return {
    id: row.id,
    insightDate: row.insight_date,
    previousDate: row.previous_date,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceName: row.source_name,
    marketplace: row.marketplace,
    category: row.category,
    asin: row.asin,
    brand: row.brand,
    title: row.title,
    insightType: row.insight_type,
    confidence: row.confidence,
    currentRank: row.current_rank,
    previousRank: row.previous_rank,
    rankChange: row.rank_change,
    price: row.price,
    productUrl: row.product_url,
    evidence: row.evidence,
    inferredAction: row.inferred_action,
    suggestedResponse: row.suggested_response,
    createdAt: row.created_at
  };
}

export interface CompetitorFolderRow {
  keyword_id: number;
  keyword: string;
  marketplace: string;
  competitor_count: number;
  latest_snapshot_date: string | null;
}

export function mapCompetitorFolder(row: CompetitorFolderRow): CompetitorFolder {
  return {
    keywordId: row.keyword_id,
    keyword: row.keyword,
    marketplace: row.marketplace,
    competitorCount: row.competitor_count,
    latestSnapshotDate: row.latest_snapshot_date
  };
}

export interface CompetitorRow {
  id: number;
  org_id: number;
  asin: string;
  marketplace: string;
  title: string;
  brand: string | null;
  image_url: string;
  first_seen_keyword: string;
  first_seen_date: string;
  last_seen_date: string;
  appear_keyword_count: number;
  best_rank: number | null;
  latest_rank: number | null;
  lowest_price: number | null;
  latest_price: number | null;
  latest_review_count: number | null;
  latest_product_url: string | null;
  coupon_text: string | null;
  deal_badge: string | null;
  latest_bsr_rank: number | null;
  latest_bsr_category: string | null;
  latest_bsr_text: string | null;
  latest_bestseller_ranks_json: string | null;
  source_type: CompetitorPoolItem["sourceType"] | null;
  first_seen_source: string | null;
  latest_category_name: string | null;
  latest_category_rank: number | null;
  ice_type: CompetitorPoolItem["iceType"] | null;
  competitor_tier: CompetitorTier | null;
  competitor_reasons_json: string | null;
  is_key_competitor: number;
  status: number;
  created_at: string;
  updated_at: string;
}

export function mapCompetitor(row: CompetitorRow): CompetitorPoolItem {
  const latestBestsellerRanks = parseJsonArray<ProductRanking>(row.latest_bestseller_ranks_json);
  const specificBsr = selectSpecificBestsellerRank(latestBestsellerRanks);
  return {
    id: row.id,
    orgId: row.org_id,
    asin: row.asin,
    marketplace: row.marketplace,
    title: row.title,
    brand: row.brand,
    imageUrl: row.image_url,
    firstSeenKeyword: row.first_seen_keyword,
    firstSeenDate: row.first_seen_date,
    lastSeenDate: row.last_seen_date,
    appearKeywordCount: row.appear_keyword_count,
    bestRank: row.best_rank,
    latestRank: row.latest_rank,
    lowestPrice: row.lowest_price,
    latestPrice: row.latest_price,
    latestReviewCount: row.latest_review_count,
    latestProductUrl: row.latest_product_url ?? `https://www.amazon.com/dp/${row.asin}`,
    couponText: row.coupon_text,
    dealBadge: row.deal_badge,
    latestBsrRank: specificBsr?.rank ?? row.latest_bsr_rank,
    latestBsrCategory: specificBsr?.category ?? row.latest_bsr_category,
    latestBsrText: row.latest_bsr_text,
    latestBestsellerRanks,
    sourceType: normalizeCompetitorSourceType(row.source_type),
    firstSeenSource: row.first_seen_source,
    latestCategoryName: row.latest_category_name,
    latestCategoryRank: row.latest_category_rank,
    iceType: row.ice_type ?? inferIceType(row.title),
    competitorTier: normalizeCompetitorTier(row.competitor_tier),
    competitorReasons: parseJsonArray<string>(row.competitor_reasons_json),
    isKeyCompetitor: Boolean(row.is_key_competitor),
    status: row.status === 1 ? "active" : "ignored",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function normalizeCompetitorSourceType(value: string | null): CompetitorPoolItem["sourceType"] {
  return value === "category" || value === "hybrid" || value === "keyword" || value === "manual" ? value : "keyword";
}

export function normalizeCompetitorTier(value: string | null): CompetitorTier {
  return value === "core" || value === "rising" || value === "activity" || value === "watch" ? value : "watch";
}
