import type { ProductDataFreshness, ProductSyncStatus } from "./types-products.js";

export const listingHealthLevels = ["healthy", "watch", "risk"] as const;
export type ListingHealthLevel = (typeof listingHealthLevels)[number];

export const listingHealthIssueLevels = ["pass", "warning", "fail"] as const;
export type ListingHealthIssueLevel = (typeof listingHealthIssueLevels)[number];

export interface ListingHealthIssue {
  key: string;
  label: string;
  level: ListingHealthIssueLevel;
  scoreImpact: number;
  message: string;
  suggestion: string;
}

export interface ListingHealthScore {
  score: number;
  level: ListingHealthLevel;
  issues: ListingHealthIssue[];
  strengths: string[];
  suggestions: string[];
}

export interface ProductListingSnapshot extends ProductDataFreshness {
  id: number;
  productId: number;
  date: string;
  title: string;
  bulletPoints: string[];
  description: string | null;
  imageUrls: string[];
  coreKeywords: string[];
  reviewHighlights: string[];
  qaGaps: string[];
  rawJson: string | null;
  createdAt: string;
}

export interface UpsertProductListingSnapshotInput {
  productId: number;
  date: string;
  title: string;
  bulletPoints?: string[];
  description?: string | null;
  imageUrls?: string[];
  coreKeywords?: string[];
  reviewHighlights?: string[];
  qaGaps?: string[];
  rawJson?: string | null;
  dataSource?: string;
  lastSyncedAt?: string | null;
  syncStatus?: ProductSyncStatus;
  syncError?: string | null;
}

export interface ProductListingHealthItem {
  productId: number;
  orgId: number;
  sku: string;
  asin: string;
  marketplace: string;
  brand: string | null;
  productTitle: string;
  snapshotId: number | null;
  snapshotDate: string | null;
  listingTitle: string;
  bulletPoints: string[];
  description: string | null;
  imageUrls: string[];
  coreKeywords: string[];
  reviewHighlights: string[];
  qaGaps: string[];
  freshness: ProductDataFreshness;
  health: ListingHealthScore;
}

export interface ListingHealthListFilter {
  orgId?: number;
  productId?: number;
  date?: string;
  q?: string;
  limit?: number;
  offset?: number;
}
