import type { ProductDataFreshness, ProductSyncStatus } from "./types-products.js";

export const reviewSentiments = ["positive", "neutral", "negative"] as const;
export type ReviewSentiment = (typeof reviewSentiments)[number];

export const reviewVocIssueTypes = ["negative_cluster", "low_rating", "topic_cluster", "data_gap"] as const;
export type ReviewVocIssueType = (typeof reviewVocIssueTypes)[number];

export const reviewVocPriorities = ["P0", "P1", "P2"] as const;
export type ReviewVocPriority = (typeof reviewVocPriorities)[number];

export const reviewVocLevels = ["healthy", "watch", "risk"] as const;
export type ReviewVocLevel = (typeof reviewVocLevels)[number];

export interface ProductReview extends ProductDataFreshness {
  id: number;
  productId: number;
  reviewDate: string;
  externalReviewId: string | null;
  rating: number;
  title: string;
  body: string;
  reviewerName: string | null;
  variant: string | null;
  verifiedPurchase: boolean;
  helpfulVotes: number | null;
  sentiment: ReviewSentiment;
  topics: string[];
  createdAt: string;
}

export interface UpsertProductReviewInput {
  productId: number;
  reviewDate: string;
  externalReviewId?: string | null;
  rating: number;
  title: string;
  body: string;
  reviewerName?: string | null;
  variant?: string | null;
  verifiedPurchase?: boolean;
  helpfulVotes?: number | null;
  sentiment?: ReviewSentiment | null;
  topics?: string[];
  dataSource?: string;
  lastSyncedAt?: string | null;
  syncStatus?: ProductSyncStatus;
  syncError?: string | null;
}

export interface ReviewVocTopic {
  topic: string;
  mentionCount: number;
  negativeCount: number;
  sampleReviewIds: number[];
}

export interface ReviewVocIssue {
  type: ReviewVocIssueType;
  priority: ReviewVocPriority;
  label: string;
  message: string;
  suggestion: string;
  evidence: string[];
}

export interface ReviewVocSummary {
  productId: number;
  orgId: number;
  sku: string;
  asin: string;
  marketplace: string;
  brand: string | null;
  productTitle: string;
  date: string | null;
  windowDays: number;
  reviewCount: number;
  negativeCount: number;
  neutralCount: number;
  positiveCount: number;
  averageRating: number | null;
  negativeRate: number;
  level: ReviewVocLevel;
  topTopics: ReviewVocTopic[];
  issues: ReviewVocIssue[];
  recentReviews: ProductReview[];
  freshness: ProductDataFreshness;
}

export interface ReviewVocListFilter {
  orgId?: number;
  productId?: number;
  date?: string;
  startDate?: string;
  endDate?: string;
  q?: string;
  limit?: number;
  offset?: number;
}
