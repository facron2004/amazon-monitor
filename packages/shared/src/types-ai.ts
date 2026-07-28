import type { InsightEvent } from "./insight-events.js";
import type { AdsWorkflowSummary } from "./types-ads.js";
import type { ProductListingHealthItem } from "./types-listing-health.js";
import type { ProductSyncStatus } from "./types-products.js";
import type { ReviewVocSummary } from "./types-review-voc.js";
import type { Task } from "./types-workflow.js";

export const aiAgentTypes = [
  "daily_operator",
  "competitor_analyst",
  "listing_optimizer",
  "ads_analyst",
  "product_research",
  "review_voc",
  "report_writer"
] as const;

export type AiAgentType = (typeof aiAgentTypes)[number];

export const aiRunStatuses = ["success", "failed"] as const;
export type AiRunStatus = (typeof aiRunStatuses)[number];

export const aiActionFeedbackValues = ["up", "down"] as const;
export type AiActionFeedbackValue = (typeof aiActionFeedbackValues)[number];

export const aiReportTypes = ["daily", "weekly", "monthly"] as const;
export type AiReportType = (typeof aiReportTypes)[number];

export const aiActionPriorities = ["P0", "P1", "P2"] as const;
export type AiActionPriority = (typeof aiActionPriorities)[number];

export interface AiRecommendedAction {
  action: string;
  priority: AiActionPriority;
  reason: string;
  risk: string;
  needs_human_approval: true;
}

export interface AiListingRewriteBullet {
  label: string;
  copy: string;
  evidence: string[];
}

export interface AiListingImageBrief {
  slot: string;
  objective: string;
  evidence: string;
}

export interface AiListingAPlusModule {
  module: string;
  objective: string;
  evidence: string;
}

export interface AiListingRewriteDraft {
  proposedTitle: string;
  titleEvidence: string[];
  bullets: AiListingRewriteBullet[];
  imageBriefs: AiListingImageBrief[];
  aPlusModules: AiListingAPlusModule[];
  riskNotes: string[];
}

export interface AiReviewVocSupplierAction {
  topic: string;
  priority: AiActionPriority;
  action: string;
  evidence: string;
}

export interface AiReviewVocSupportDraft {
  scenario: string;
  responseTemplate: string;
  evidence: string;
}

export interface AiReviewVocProductOpportunity {
  opportunity: string;
  evidence: string;
  validationNeeded: string;
}

export interface AiReviewVocComparisonRow {
  topic: string;
  ownProductEvidence: string;
  competitorEvidence: string | null;
  conclusion: string;
}

export interface AiReviewVocCustomerLanguage {
  phrase: string;
  sentiment: "positive" | "neutral" | "negative";
  safeUse: string;
  evidenceReviewId: number;
}

export interface AiReviewVocArtifact {
  negativeSummary: string[];
  supplierActions: AiReviewVocSupplierAction[];
  listingRecommendations: string[];
  supportDrafts: AiReviewVocSupportDraft[];
  productOpportunities: AiReviewVocProductOpportunity[];
  competitorPainComparison: AiReviewVocComparisonRow[];
  customerLanguage: AiReviewVocCustomerLanguage[];
  riskNotes: string[];
}

export interface AiAdsWasteCandidate {
  campaign: string;
  target: string;
  spend: number | null;
  sales: number | null;
  clicks: number | null;
  reason: string;
  evidence: string[];
}

export interface AiAdsNegativeKeywordSuggestion {
  term: string;
  matchType: "exact" | "phrase" | "review_only";
  campaign: string;
  reason: string;
  evidence: string[];
}

export interface AiAdsBidAdjustment {
  target: string;
  campaign: string;
  direction: "increase" | "decrease" | "hold";
  suggestedChangePercent: number | null;
  reason: string;
  evidence: string[];
}

export interface AiAdsBudgetAdjustment {
  campaign: string;
  direction: "increase" | "decrease" | "hold";
  currentBudget: number | null;
  suggestedChangePercent: number | null;
  reason: string;
  guardrails: string[];
}

export interface AiAdsScaleCandidate {
  campaign: string;
  target: string;
  acos: number | null;
  cvr: number | null;
  budgetUsageRate: number | null;
  recommendation: string;
  evidence: string[];
}

export interface AiAdsOptimizationArtifact {
  evidenceDate: string;
  wasteCandidates: AiAdsWasteCandidate[];
  negativeKeywordSuggestions: AiAdsNegativeKeywordSuggestion[];
  bidAdjustments: AiAdsBidAdjustment[];
  budgetAdjustments: AiAdsBudgetAdjustment[];
  scaleCandidates: AiAdsScaleCandidate[];
  dataGaps: string[];
  riskNotes: string[];
}

export interface AiProductLaunchPriceBand {
  minimum: number | null;
  target: number | null;
  maximum: number | null;
  currency: string | null;
  evidence: string;
}

export interface AiProductLaunchCustomerPainEvidence {
  status: "evidence_available" | "data_gap";
  conclusion: string;
  evidence: string[];
  validationNeeded: string[];
}

export interface AiProductLaunchCompetitorRow {
  asin: string;
  brand: string | null;
  title: string;
  rank: number;
  price: number | null;
  reviewCount: number | null;
  signal: string;
  evidence: string[];
}

export interface AiProductLaunchHypothesis {
  hypothesis: string;
  evidence: string[];
  validationNeeded: string;
}

export interface AiProductLaunchValidationItem {
  item: string;
  gate: "required" | "recommended";
  evidenceRequired: string;
}

export interface AiProductLaunchBrief {
  title: string;
  evidenceDate: string;
  categoryName: string;
  marketplace: string;
  decision: "validate" | "hold";
  opportunityThesis: string;
  priceBand: AiProductLaunchPriceBand;
  customerPainEvidence: AiProductLaunchCustomerPainEvidence;
  competitorMatrix: AiProductLaunchCompetitorRow[];
  differentiationHypotheses: AiProductLaunchHypothesis[];
  validationChecklist: AiProductLaunchValidationItem[];
  riskNotes: string[];
}

export interface AiAgentArtifacts {
  listingRewrite?: AiListingRewriteDraft;
  reviewVoc?: AiReviewVocArtifact;
  adsOptimization?: AiAdsOptimizationArtifact;
  productLaunchBrief?: AiProductLaunchBrief;
}

export type AiDataFreshnessStatus = "fresh" | "stale" | "unknown";

export interface AiDataFreshness {
  evidenceDate: string;
  evaluatedAt: string;
  dataSource: string;
  lastSyncedAt: string | null;
  syncStatus: ProductSyncStatus | null;
  freshnessStatus: AiDataFreshnessStatus;
  ageHours: number | null;
  maxAgeHours: number;
  failureReason: string | null;
  warning: string | null;
}

export interface AiAgentOutput {
  summary: string;
  evidence: string[];
  impact: string;
  recommended_actions: AiRecommendedAction[];
  confidence: number;
  dataFreshness?: AiDataFreshness;
  artifacts?: AiAgentArtifacts;
}

export interface AiRun {
  id: number;
  orgId: number;
  agentType: AiAgentType;
  inputContextJson: string;
  outputJson: string | null;
  output: AiAgentOutput | null;
  model: string;
  status: AiRunStatus;
  tokenUsage: number | null;
  errorMessage: string | null;
  createdAt: string;
  actionFeedback: AiActionFeedback[];
}

export interface AiActionFeedback {
  runId: number;
  orgId: number;
  userId: number;
  actionIndex: number;
  value: AiActionFeedbackValue;
  updatedAt: string;
}

export interface UpsertAiActionFeedbackInput {
  runId: number;
  orgId: number;
  userId: number;
  actionIndex: number;
  value: AiActionFeedbackValue;
}

export interface CreateAiRunInput {
  orgId: number;
  agentType: AiAgentType;
  inputContextJson: string;
  output: AiAgentOutput | null;
  model: string;
  status: AiRunStatus;
  tokenUsage?: number | null;
  errorMessage?: string | null;
}

export interface AiRunListFilter {
  orgId?: number;
  agentType?: AiAgentType;
  status?: AiRunStatus;
  limit?: number;
  offset?: number;
}

export interface AiRunListResponse {
  runs: AiRun[];
  total: number;
  limit: number;
  offset: number;
}

export interface AiQualityMetrics {
  runCount: number;
  successfulRunCount: number;
  actionableRunCount: number;
  actionCount: number;
  feedbackCount: number;
  positiveFeedbackCount: number;
  negativeFeedbackCount: number;
  positiveFeedbackRate: number | null;
  convertedRunCount: number;
  runConversionRate: number | null;
  reviewedTaskCount: number;
  confirmedTaskCount: number;
  taskConfirmationRate: number | null;
}

export interface AiAgentQualityEntry extends AiQualityMetrics {
  agentType: AiAgentType;
}

export interface AiQualityResponse {
  windowDays: 7 | 30 | 90;
  rangeStart: string;
  rangeEnd: string;
  generatedAt: string;
  totals: AiQualityMetrics;
  agents: AiAgentQualityEntry[];
}

export interface AiDailyBriefResponse {
  date: string;
  output: AiAgentOutput;
  run: AiRun;
  topEvents: InsightEvent[];
}

export interface AiCompetitorAnalysisResponse {
  date: string;
  eventId: string;
  output: AiAgentOutput;
  run: AiRun;
  event: InsightEvent;
  relatedEvents: InsightEvent[];
}

export interface AiListingAnalysisResponse {
  date: string;
  productId: number;
  output: AiAgentOutput;
  run: AiRun;
  listingHealth: ProductListingHealthItem;
}

export interface AiAdsAnalysisResponse {
  date: string;
  output: AiAgentOutput;
  run: AiRun;
  summary: AdsWorkflowSummary;
}

export interface AiReviewVocAnalysisResponse {
  date: string;
  productId: number;
  output: AiAgentOutput;
  run: AiRun;
  summary: ReviewVocSummary;
}

export interface AiProductResearchBrandEvidence {
  brand: string;
  top100Count: number;
  top20Count: number;
  bestRank: number | null;
}

export type AiProductResearchCandidateType =
  | "new_product_breakout"
  | "low_review_top50"
  | "breakout_low_review";

export interface AiProductResearchCandidate {
  asin: string;
  title: string;
  brand: string | null;
  rank: number;
  price: number | null;
  reviewCount: number | null;
  candidateType: AiProductResearchCandidateType;
  reason: string;
  isInCompetitorPool: boolean;
}

export interface AiProductResearchContext {
  categoryId: number;
  categoryName: string;
  marketplace: string;
  date: string;
  snapshotCount: number;
  brandCount: number;
  pricedProductCount: number;
  minimumPrice: number | null;
  medianPrice: number | null;
  maximumPrice: number | null;
  newProductCount: number;
  lowReviewTop50Count: number;
  topBrands: AiProductResearchBrandEvidence[];
  recommendedCompetitors: AiProductResearchCandidate[];
}

export interface AiProductResearchResponse {
  date: string;
  categoryId: number;
  output: AiAgentOutput;
  run: AiRun;
  context: AiProductResearchContext;
}

export interface AiProductLaunchValidationTasksResponse {
  runId: number;
  requiredGateCount: number;
  createdCount: number;
  existingCount: number;
  tasks: Task[];
}

export interface AiReportWriterResponse {
  date: string;
  reportType: AiReportType;
  markdown: string;
  output: AiAgentOutput;
  run: AiRun;
  sourceEventIds: string[];
}
