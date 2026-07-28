import type { InsightEvent } from "./insight-events.js";
import type { AiAgentType, AiRunStatus } from "./types-ai.js";
import type { AdsWorkflowResponse } from "./types-ads.js";
import type { CompetitorTier } from "./types-competitors.js";
import type { InventoryReplenishmentPlan } from "./types-inventory.js";
import type { ProductListingHealthItem } from "./types-listing-health.js";
import type { ProductProfitPlan } from "./types-profit.js";
import type { OwnedProductDetail } from "./types-products.js";
import type { ReviewVocSummary } from "./types-review-voc.js";
import type { Task } from "./types-workflow.js";

export type ProductOperationsAccessLevel = "full" | "summary" | "denied";

export interface ProductOperationsAccess {
  ads: ProductOperationsAccessLevel;
  profit: ProductOperationsAccessLevel;
}

export interface ProductOperationsAgentRun {
  id: number;
  agentType: AiAgentType;
  model: string;
  status: AiRunStatus;
  summary: string | null;
  confidence: number | null;
  actionCount: number;
  createdAt: string;
}

export interface ProductOperationsCompetitor {
  id: number;
  asin: string;
  title: string;
  brand: string | null;
  imageUrl: string;
  latestPrice: number | null;
  latestRank: number | null;
  latestReviewCount: number | null;
  couponText: string | null;
  dealBadge: string | null;
  competitorTier: CompetitorTier;
  isKeyCompetitor: boolean;
  comparisonBasis: "same_category";
  updatedAt: string;
}

export interface OwnedProductOperationsDetail {
  asOfDate: string;
  generatedAt: string;
  product: OwnedProductDetail;
  access: ProductOperationsAccess;
  ads: AdsWorkflowResponse | null;
  profit: ProductProfitPlan | null;
  inventory: InventoryReplenishmentPlan | null;
  listingHealth: ProductListingHealthItem | null;
  reviewVoc: ReviewVocSummary | null;
  competitors: ProductOperationsCompetitor[];
  agentRuns: ProductOperationsAgentRun[];
  events: InsightEvent[];
  tasks: Task[];
}
