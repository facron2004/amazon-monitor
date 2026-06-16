import { inferIceType, selectSpecificBestsellerRank } from "@amazon-monitor/shared";
import type { IceTypeTag, ProductRanking, SerpSnapshot } from "@amazon-monitor/shared";
import { parseJsonArray } from "./json-utils.js";

export interface SnapshotRow {
  id: number;
  keyword_id: number;
  keyword: string;
  marketplace: string;
  snapshot_date: string;
  page_no: number;
  position_in_page: number;
  absolute_rank: number;
  organic_rank: number | null;
  sponsored_rank: number | null;
  asin: string;
  title: string;
  brand: string | null;
  image_url: string;
  product_url: string;
  current_price: number | null;
  original_price: number | null;
  coupon_text: string | null;
  coupon_value: number | null;
  coupon_rate: number | null;
  final_estimated_price: number | null;
  currency: string;
  rating: number | null;
  review_count: number | null;
  ice_type: IceTypeTag | null;
  is_sponsored: number;
  is_prime: number;
  deal_badge: string | null;
  delivery_text: string | null;
  bsr_rank: number | null;
  bsr_category: string | null;
  bsr_text: string | null;
  bestseller_ranks_json: string | null;
  detail_collected_at: string | null;
  created_at: string;
}

export function mapSnapshot(row: SnapshotRow): SerpSnapshot {
  const bestsellerRanks = parseJsonArray<ProductRanking>(row.bestseller_ranks_json);
  const specificBsr = selectSpecificBestsellerRank(bestsellerRanks);
  return {
    id: row.id,
    keywordId: row.keyword_id,
    keyword: row.keyword,
    marketplace: row.marketplace,
    snapshotDate: row.snapshot_date,
    pageNo: row.page_no,
    positionInPage: row.position_in_page,
    absoluteRank: row.absolute_rank,
    organicRank: row.organic_rank,
    sponsoredRank: row.sponsored_rank,
    asin: row.asin,
    title: row.title,
    brand: row.brand,
    imageUrl: row.image_url,
    productUrl: row.product_url,
    currentPrice: row.current_price,
    originalPrice: row.original_price,
    couponText: row.coupon_text,
    couponValue: row.coupon_value,
    couponRate: row.coupon_rate,
    finalEstimatedPrice: row.final_estimated_price,
    currency: row.currency,
    rating: row.rating,
    reviewCount: row.review_count,
    iceType: row.ice_type ?? inferIceType(row.title),
    isSponsored: Boolean(row.is_sponsored),
    isPrime: Boolean(row.is_prime),
    dealBadge: row.deal_badge,
    deliveryText: row.delivery_text,
    bsrRank: specificBsr?.rank ?? row.bsr_rank,
    bsrCategory: specificBsr?.category ?? row.bsr_category,
    bsrText: row.bsr_text,
    bestsellerRanks,
    detailCollectedAt: row.detail_collected_at,
    createdAt: row.created_at
  };
}
