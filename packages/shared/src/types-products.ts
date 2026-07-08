import type { IceTypeTag, NullableNumber } from "./types-common.js";

export interface SerpProductInput {
  asin: string;
  title: string;
  brand: string | null;
  imageUrl: string;
  productUrl: string;
  currentPrice: NullableNumber;
  originalPrice?: NullableNumber;
  couponText: string | null;
  currency: string;
  rating: NullableNumber;
  reviewCount: NullableNumber;
  iceType?: IceTypeTag | null;
  isSponsored: boolean;
  isPrime: boolean;
  dealBadge: string | null;
  deliveryText: string | null;
  bsrRank?: NullableNumber;
  bsrCategory?: string | null;
  bsrText?: string | null;
  bestsellerRanks?: ProductRanking[];
  detailCollectedAt?: string | null;
}

export interface SerpSnapshot extends SerpProductInput {
  id?: number;
  keywordId: number;
  keyword: string;
  marketplace: string;
  snapshotDate: string;
  pageNo: number;
  positionInPage: number;
  absoluteRank: number;
  organicRank: NullableNumber;
  sponsoredRank: NullableNumber;
  couponValue: NullableNumber;
  couponRate: NullableNumber;
  finalEstimatedPrice: NullableNumber;
  bsrRank: NullableNumber;
  bsrCategory: string | null;
  bsrText: string | null;
  bestsellerRanks: ProductRanking[];
  detailCollectedAt: string | null;
  createdAt?: string;
}

export interface BestSellerProductInput {
  rank: number;
  asin: string;
  title: string;
  brand: string | null;
  imageUrl: string;
  productUrl: string;
  currentPrice: NullableNumber;
  originalPrice?: NullableNumber;
  couponText: string | null;
  currency: string;
  rating: NullableNumber;
  reviewCount: NullableNumber;
  iceType?: IceTypeTag | null;
  isPrime: boolean;
  dealBadge: string | null;
  bsrRank?: NullableNumber;
  bsrCategory?: string | null;
}

export interface BestsellerRankSnapshot extends BestSellerProductInput {
  id?: number;
  categoryId: number;
  categoryName: string;
  marketplace: string;
  snapshotDate: string;
  couponValue: NullableNumber;
  couponRate: NullableNumber;
  finalEstimatedPrice: NullableNumber;
  bsrRank: NullableNumber;
  bsrCategory: string | null;
  createdAt?: string;
}

export interface ProductRanking {
  rank: number;
  category: string;
  url: string | null;
}

export type BsrSourceType = "category_bestseller" | "keyword_detail";

export type BsrRankChangeType = "new_entry" | "dropped" | "rank_up" | "rank_down" | "unchanged";

export interface BsrRankHistory {
  id?: number;
  snapshotDate: string;
  sourceType: BsrSourceType;
  sourceId: number | null;
  sourceName: string;
  marketplace: string;
  asin: string;
  title: string;
  brand: string | null;
  category: string;
  rank: number;
  rankUrl: string | null;
  productUrl: string | null;
  currentPrice: NullableNumber;
  parentRank: NullableNumber;
  isSpecificRank: boolean;
  createdAt?: string;
}

export interface BsrRankChange {
  snapshotDate: string;
  previousDate: string | null;
  sourceType: BsrSourceType;
  sourceId: number | null;
  sourceName: string;
  marketplace: string;
  category: string;
  asin: string;
  title: string;
  brand: string | null;
  currentRank: NullableNumber;
  previousRank: NullableNumber;
  rankChange: NullableNumber;
  changeType: BsrRankChangeType;
  productUrl: string | null;
  currentPrice: NullableNumber;
}

export type BsrSnapshotQualityStatus = "ok" | "partial" | "empty";

export interface BsrSnapshotQuality {
  id?: number;
  snapshotDate: string;
  sourceType: BsrSourceType;
  sourceId: number | null;
  sourceName: string;
  marketplace: string;
  category: string;
  expectedCount: NullableNumber;
  actualCount: number;
  uniqueAsinCount: number;
  uniqueRankCount: number;
  minRank: NullableNumber;
  maxRank: NullableNumber;
  qualityStatus: BsrSnapshotQualityStatus;
  issue: string | null;
  createdAt?: string;
}

export interface DecorateSnapshotInput {
  keywordId: number;
  keyword: string;
  marketplace: string;
  snapshotDate: string;
  pageNo: number;
  productsPerPage: number;
  products: SerpProductInput[];
}

export interface DecorateBestsellerInput {
  categoryId: number;
  categoryName: string;
  marketplace: string;
  snapshotDate: string;
  products: BestSellerProductInput[];
}

export const ownedProductStatuses = ["active", "paused", "archived"] as const;
export type OwnedProductStatus = (typeof ownedProductStatuses)[number];

export const productSyncStatuses = ["pending", "success", "partial", "failed", "manual"] as const;
export type ProductSyncStatus = (typeof productSyncStatuses)[number];

export interface ProductDataFreshness {
  dataSource: string;
  lastSyncedAt: string | null;
  syncStatus: ProductSyncStatus;
  syncError: string | null;
}

export interface OwnedProduct extends ProductDataFreshness {
  id: number;
  orgId: number;
  marketplace: string;
  sku: string;
  asin: string;
  brand: string | null;
  title: string;
  imageUrl: string | null;
  category: string | null;
  ownerId: number | null;
  status: OwnedProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OwnedProductDailyMetric extends ProductDataFreshness {
  id: number;
  productId: number;
  date: string;
  sessions: NullableNumber;
  pageViews: NullableNumber;
  orders: NullableNumber;
  unitsSold: NullableNumber;
  salesAmount: NullableNumber;
  buyBoxPercentage: NullableNumber;
  conversionRate: NullableNumber;
  rating: NullableNumber;
  reviewCount: NullableNumber;
  bsrRank: NullableNumber;
  inventoryAvailable: NullableNumber;
  inventoryDays: NullableNumber;
  adSpend: NullableNumber;
  adSales: NullableNumber;
  acos: NullableNumber;
  tacos: NullableNumber;
  grossMargin: NullableNumber;
  keywordRank: NullableNumber;
  createdAt: string;
}

export type ProductScoreLevel = "low" | "medium" | "high";

export interface ProductScoreDimension {
  key: string;
  label: string;
  score: number;
  weight: number;
  reason: string;
}

export interface ProductScore {
  productId: number;
  sku: string;
  asin: string;
  date: string | null;
  score: number;
  level: ProductScoreLevel;
  dimensions: ProductScoreDimension[];
  reasons: string[];
  freshness: ProductDataFreshness;
}

export interface OwnedProductListItem extends OwnedProduct {
  latestMetric: OwnedProductDailyMetric | null;
  riskScore: ProductScore;
  opportunityScore: ProductScore;
}

export interface OwnedProductDetail extends OwnedProductListItem {
  metrics: OwnedProductDailyMetric[];
}

export interface CreateOwnedProductInput {
  orgId: number;
  marketplace: string;
  sku: string;
  asin: string;
  brand?: string | null;
  title: string;
  imageUrl?: string | null;
  category?: string | null;
  ownerId?: number | null;
  status?: OwnedProductStatus;
  dataSource?: string;
  lastSyncedAt?: string | null;
  syncStatus?: ProductSyncStatus;
  syncError?: string | null;
}

export interface UpdateOwnedProductInput {
  marketplace?: string;
  sku?: string;
  asin?: string;
  brand?: string | null;
  title?: string;
  imageUrl?: string | null;
  category?: string | null;
  ownerId?: number | null;
  status?: OwnedProductStatus;
  dataSource?: string;
  lastSyncedAt?: string | null;
  syncStatus?: ProductSyncStatus;
  syncError?: string | null;
}

export interface UpsertOwnedProductDailyMetricInput {
  productId: number;
  date: string;
  sessions?: NullableNumber;
  pageViews?: NullableNumber;
  orders?: NullableNumber;
  unitsSold?: NullableNumber;
  salesAmount?: NullableNumber;
  buyBoxPercentage?: NullableNumber;
  conversionRate?: NullableNumber;
  rating?: NullableNumber;
  reviewCount?: NullableNumber;
  bsrRank?: NullableNumber;
  inventoryAvailable?: NullableNumber;
  inventoryDays?: NullableNumber;
  adSpend?: NullableNumber;
  adSales?: NullableNumber;
  acos?: NullableNumber;
  tacos?: NullableNumber;
  grossMargin?: NullableNumber;
  keywordRank?: NullableNumber;
  dataSource?: string;
  lastSyncedAt?: string | null;
  syncStatus?: ProductSyncStatus;
  syncError?: string | null;
}
