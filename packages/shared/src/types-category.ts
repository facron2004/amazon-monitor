import type { IceTypeTag, NullableNumber } from "./types-common.js";
import type { CategoryMonitor } from "./types-monitors.js";
import type { BestsellerRankSnapshot } from "./types-products.js";
import type { AlertLevel } from "./types-operational.js";

export interface BrandMatrixSnapshot {
  id?: number;
  categoryId: number;
  categoryName: string;
  marketplace: string;
  snapshotDate: string;
  brand: string;
  productCountTop100: number;
  productCountTop50: number;
  productCountTop20: number;
  productCountTop10?: number;
  bestRank: NullableNumber;
  averageRank: NullableNumber;
  newEntryCount: number;
  droppedCount: number;
  rankUpCount: number;
  rankDownCount: number;
  priceDownCount: number;
  couponCount: number;
  dealCount: number;
  topAsins: string[];
  createdAt?: string;
}

export type CategorySignalType =
  | "new_top_100"
  | "new_top_50"
  | "new_top_20"
  | "dropped_top_100"
  | "dropped_top_50"
  | "dropped_top_20"
  | "major_rank_up"
  | "major_rank_down"
  | "price_drop"
  | "new_coupon"
  | "new_deal"
  | "new_product_breakout";

export interface CategorySignalLog {
  id?: number;
  signalDate: string;
  categoryId: number;
  categoryName: string;
  marketplace: string;
  signalType: CategorySignalType;
  alertLevel: AlertLevel;
  asin: string | null;
  brand: string | null;
  title: string | null;
  rank: NullableNumber;
  previousRank: NullableNumber;
  price: NullableNumber;
  previousPrice: NullableNumber;
  content: string;
  createdAt?: string;
}

export interface ProductPriceHistory {
  id?: number;
  snapshotDate: string;
  categoryId: number;
  categoryName: string;
  marketplace: string;
  asin: string;
  brand: string | null;
  title: string;
  imageUrl?: string | null;
  productUrl?: string | null;
  currentPrice: NullableNumber;
  reviewCount?: NullableNumber;
  previousReviewCount?: NullableNumber;
  reviewCountChange?: NullableNumber;
  iceType?: IceTypeTag | null;
  couponText?: string | null;
  couponValue: NullableNumber;
  couponRate: NullableNumber;
  dealBadge?: string | null;
  finalEstimatedPrice: NullableNumber;
  t30LowPrice: NullableNumber;
  t60LowPrice: NullableNumber;
  t90LowPrice: NullableNumber;
  monitoringLowPrice: NullableNumber;
  createdAt?: string;
}

export type ActivityEventType =
  | "price_drop"
  | "coupon_start"
  | "coupon_end"
  | "coupon_increase"
  | "deal_start"
  | "deal_end"
  | "rank_surge"
  | "new_entry_top100"
  | "new_entry_top50"
  | "review_growth"
  | "brand_matrix_push"
  | "activity_end_rank_drop";

export interface CompetitorActivityEvent {
  id?: number;
  eventKey: string;
  eventDate: string;
  eventType: ActivityEventType;
  eventLevel: AlertLevel;
  categoryId: number;
  categoryName: string;
  marketplace: string;
  asin: string | null;
  brand: string | null;
  title: string | null;
  priceBefore: NullableNumber;
  priceAfter: NullableNumber;
  priceChangeRate: NullableNumber;
  reviewCountBefore?: NullableNumber;
  reviewCountAfter?: NullableNumber;
  reviewCountChange?: NullableNumber;
  couponBefore: string | null;
  couponAfter: string | null;
  dealType: string | null;
  rankBefore: NullableNumber;
  rankAfter: NullableNumber;
  rankChange: NullableNumber;
  keywordRankBefore: NullableNumber;
  keywordRankAfter: NullableNumber;
  eventSummary: string;
  possibleStrategy: string;
  suggestedAction: string;
  createdAt?: string;
}

export interface BrandMatrixInput {
  category: CategoryMonitor;
  date: string;
  today: BestsellerRankSnapshot[];
  yesterday: BestsellerRankSnapshot[];
}

export interface CategorySignalInput extends BrandMatrixInput {}

export interface CategoryActivityEventInput extends BrandMatrixInput {
  brandMatrix: BrandMatrixSnapshot[];
}

export interface CategoryReportInput {
  date: string;
  category: CategoryMonitor;
  snapshots: BestsellerRankSnapshot[];
  brandMatrix: BrandMatrixSnapshot[];
  signals: CategorySignalLog[];
  activityEvents?: CompetitorActivityEvent[];
}
