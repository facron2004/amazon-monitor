import { inferIceType } from "@amazon-monitor/shared";
import type {
  AlertLevel,
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  CategorySignalLog,
  CompetitorActivityEvent,
  IceTypeTag,
  ProductSyncStatus,
  ProductPriceHistory
} from "@amazon-monitor/shared";
import { parseJsonArray } from "./json-utils.js";

export interface BestsellerSnapshotRow {
  id: number;
  category_id: number;
  category_name: string;
  marketplace: string;
  snapshot_date: string;
  rank_no: number;
  asin: string;
  title: string;
  brand: string | null;
  image_url: string;
  product_url: string;
  current_price: number | null;
  original_price: number | null;
  coupon_text: string | null;
  effective_coupon_text?: string | null;
  coupon_value: number | null;
  coupon_rate: number | null;
  final_estimated_price: number | null;
  currency: string;
  rating: number | null;
  review_count: number | null;
  ice_type: IceTypeTag | null;
  is_prime: number;
  deal_badge: string | null;
  effective_deal_badge?: string | null;
  bsr_rank: number | null;
  bsr_category: string | null;
  data_source: string;
  last_synced_at: string | null;
  sync_status: ProductSyncStatus;
  created_at: string;
}

export function mapBestsellerSnapshot(row: BestsellerSnapshotRow): BestsellerRankSnapshot {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    marketplace: row.marketplace,
    snapshotDate: row.snapshot_date,
    rank: row.rank_no,
    asin: row.asin,
    title: row.title,
    brand: row.brand,
    imageUrl: row.image_url,
    productUrl: row.product_url,
    currentPrice: row.current_price,
    originalPrice: row.original_price,
    couponText: row.effective_coupon_text !== undefined ? row.effective_coupon_text : row.coupon_text,
    couponValue: row.coupon_value,
    couponRate: row.coupon_rate,
    finalEstimatedPrice: row.final_estimated_price,
    currency: row.currency,
    rating: row.rating,
    reviewCount: row.review_count,
    iceType: row.ice_type ?? inferIceType(row.title),
    isPrime: Boolean(row.is_prime),
    dealBadge: row.effective_deal_badge !== undefined ? row.effective_deal_badge : row.deal_badge,
    bsrRank: row.bsr_rank,
    bsrCategory: row.bsr_category,
    dataSource: row.data_source,
    lastSyncedAt: row.last_synced_at,
    syncStatus: row.sync_status,
    createdAt: row.created_at
  };
}

export interface BrandMatrixRow {
  id: number;
  category_id: number;
  category_name: string;
  marketplace: string;
  snapshot_date: string;
  brand: string;
  product_count_top100: number;
  product_count_top50: number;
  product_count_top20: number;
  best_rank: number | null;
  average_rank: number | null;
  new_entry_count: number;
  dropped_count: number;
  rank_up_count: number;
  rank_down_count: number;
  price_down_count: number;
  coupon_count: number;
  deal_count: number;
  top_asins_json: string | null;
  created_at: string;
}

export function mapBrandMatrix(row: BrandMatrixRow): BrandMatrixSnapshot {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    marketplace: row.marketplace,
    snapshotDate: row.snapshot_date,
    brand: row.brand,
    productCountTop100: row.product_count_top100,
    productCountTop50: row.product_count_top50,
    productCountTop20: row.product_count_top20,
    bestRank: row.best_rank,
    averageRank: row.average_rank,
    newEntryCount: row.new_entry_count,
    droppedCount: row.dropped_count,
    rankUpCount: row.rank_up_count,
    rankDownCount: row.rank_down_count,
    priceDownCount: row.price_down_count,
    couponCount: row.coupon_count,
    dealCount: row.deal_count,
    topAsins: parseJsonArray<string>(row.top_asins_json),
    createdAt: row.created_at
  };
}

export interface ProductPriceHistoryRow {
  id: number;
  snapshot_date: string;
  category_id: number;
  category_name: string;
  marketplace: string;
  asin: string;
  brand: string | null;
  title: string;
  image_url?: string | null;
  product_url?: string | null;
  current_price: number | null;
  review_count: number | null;
  previous_review_count: number | null;
  review_count_change: number | null;
  ice_type: IceTypeTag | null;
  coupon_text: string | null;
  effective_coupon_text?: string | null;
  coupon_value: number | null;
  coupon_rate: number | null;
  deal_badge: string | null;
  effective_deal_badge?: string | null;
  final_estimated_price: number | null;
  t30_low_price: number | null;
  t60_low_price: number | null;
  t90_low_price: number | null;
  monitoring_low_price: number | null;
  created_at: string;
}

export function mapProductPriceHistory(row: ProductPriceHistoryRow): ProductPriceHistory {
  return {
    id: row.id,
    snapshotDate: row.snapshot_date,
    categoryId: row.category_id,
    categoryName: row.category_name,
    marketplace: row.marketplace,
    asin: row.asin,
    brand: row.brand,
    title: row.title,
    imageUrl: row.image_url ?? null,
    productUrl: row.product_url ?? `https://www.amazon.com/dp/${row.asin}`,
    currentPrice: row.current_price,
    reviewCount: row.review_count,
    previousReviewCount: row.previous_review_count,
    reviewCountChange: row.review_count_change,
    iceType: row.ice_type ?? inferIceType(row.title),
    couponText: row.effective_coupon_text !== undefined ? row.effective_coupon_text : row.coupon_text,
    couponValue: row.coupon_value,
    couponRate: row.coupon_rate,
    dealBadge: row.effective_deal_badge !== undefined ? row.effective_deal_badge : row.deal_badge,
    finalEstimatedPrice: row.final_estimated_price,
    t30LowPrice: row.t30_low_price,
    t60LowPrice: row.t60_low_price,
    t90LowPrice: row.t90_low_price,
    monitoringLowPrice: row.monitoring_low_price,
    createdAt: row.created_at
  };
}

export interface CategorySignalRow {
  id: number;
  signal_date: string;
  category_id: number;
  category_name: string;
  marketplace: string;
  signal_type: CategorySignalLog["signalType"];
  alert_level: AlertLevel;
  asin: string | null;
  brand: string | null;
  title: string | null;
  rank_no: number | null;
  previous_rank: number | null;
  price: number | null;
  previous_price: number | null;
  content: string;
  created_at: string;
}

export function mapCategorySignal(row: CategorySignalRow): CategorySignalLog {
  return {
    id: row.id,
    signalDate: row.signal_date,
    categoryId: row.category_id,
    categoryName: row.category_name,
    marketplace: row.marketplace,
    signalType: row.signal_type,
    alertLevel: row.alert_level,
    asin: row.asin,
    brand: row.brand,
    title: row.title,
    rank: row.rank_no,
    previousRank: row.previous_rank,
    price: row.price,
    previousPrice: row.previous_price,
    content: row.content,
    createdAt: row.created_at
  };
}

export interface ActivityEventRow {
  id: number;
  event_key: string;
  event_date: string;
  event_type: CompetitorActivityEvent["eventType"];
  event_level: AlertLevel;
  category_id: number;
  category_name: string;
  marketplace: string;
  asin: string | null;
  brand: string | null;
  title: string | null;
  price_before: number | null;
  price_after: number | null;
  price_change_rate: number | null;
  review_count_before: number | null;
  review_count_after: number | null;
  review_count_change: number | null;
  coupon_before: string | null;
  coupon_after: string | null;
  deal_type: string | null;
  rank_before: number | null;
  rank_after: number | null;
  rank_change: number | null;
  keyword_rank_before: number | null;
  keyword_rank_after: number | null;
  event_summary: string;
  possible_strategy: string;
  suggested_action: string;
  created_at: string;
}

export function mapActivityEvent(row: ActivityEventRow): CompetitorActivityEvent {
  return {
    id: row.id,
    eventKey: row.event_key,
    eventDate: row.event_date,
    eventType: row.event_type,
    eventLevel: row.event_level,
    categoryId: row.category_id,
    categoryName: row.category_name,
    marketplace: row.marketplace,
    asin: row.asin,
    brand: row.brand,
    title: row.title,
    priceBefore: row.price_before,
    priceAfter: row.price_after,
    priceChangeRate: row.price_change_rate,
    reviewCountBefore: row.review_count_before,
    reviewCountAfter: row.review_count_after,
    reviewCountChange: row.review_count_change,
    couponBefore: row.coupon_before,
    couponAfter: row.coupon_after,
    dealType: row.deal_type,
    rankBefore: row.rank_before,
    rankAfter: row.rank_after,
    rankChange: row.rank_change,
    keywordRankBefore: row.keyword_rank_before,
    keywordRankAfter: row.keyword_rank_after,
    eventSummary: row.event_summary,
    possibleStrategy: row.possible_strategy,
    suggestedAction: row.suggested_action,
    createdAt: row.created_at
  };
}
