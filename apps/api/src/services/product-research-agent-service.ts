import type {
  AiProductResearchContext,
  AiProductResearchResponse,
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  CategorySignalLog
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { validateAiAgentOutput } from "./ai-agent-policy.js";
import { assessBsrDataFreshness } from "./ai-data-freshness.js";
import { buildProductResearchOutput } from "./product-research-agent-output.js";

const PRODUCT_RESEARCH_MODEL = "deterministic-product-research-v3";

interface ProductResearchInput {
  categoryId: number;
  date: string;
  orgId: number;
}

export function researchProductOpportunity(store: Store, input: ProductResearchInput): AiProductResearchResponse {
  const category = store.getCategoryMonitor(input.categoryId, input.orgId);
  if (!category) {
    throw Object.assign(new Error("Category not found"), { statusCode: 404 });
  }

  const snapshots = store.listCategorySnapshots({
    orgId: input.orgId,
    categoryId: input.categoryId,
    date: input.date,
    limit: 1000,
    offset: 0
  });
  const brandMatrix = store.listBrandMatrix({
    orgId: input.orgId,
    categoryId: input.categoryId,
    date: input.date,
    limit: 200
  });
  const signals = store.listCategorySignals({
    orgId: input.orgId,
    categoryId: input.categoryId,
    date: input.date,
    limit: 500,
    offset: 0
  });
  const activeCompetitorKeys = new Set(
    store.listCompetitors({ orgId: input.orgId }).map((item) => `${item.marketplace}:${item.asin}`)
  );
  const context = buildContext(
    category.id,
    category.name,
    category.marketplace,
    input.date,
    snapshots,
    brandMatrix,
    signals,
    activeCompetitorKeys
  );
  const dataFreshness = assessBsrDataFreshness(input.date, snapshots);
  const output = buildProductResearchOutput(context, snapshots, signals.length, dataFreshness);
  const validationErrors = validateAiAgentOutput(output);
  const inputContextJson = JSON.stringify({
    date: input.date,
    orgId: input.orgId,
    categoryId: input.categoryId,
    snapshotCount: context.snapshotCount,
    brandCount: context.brandCount,
    signalCount: signals.length,
    recommendedCompetitorAsins: context.recommendedCompetitors.map((item) => item.asin),
    dataFreshness,
    generatedAt: new Date().toISOString()
  });

  if (validationErrors.length > 0) {
    store.createAiRun({
      orgId: input.orgId,
      agentType: "product_research",
      inputContextJson,
      output: null,
      model: PRODUCT_RESEARCH_MODEL,
      status: "failed",
      errorMessage: validationErrors.join("; ")
    });
    throw Object.assign(new Error(`Invalid AI Agent output: ${validationErrors.join("; ")}`), { statusCode: 500 });
  }

  const run = store.createAiRun({
    orgId: input.orgId,
    agentType: "product_research",
    inputContextJson,
    output,
    model: PRODUCT_RESEARCH_MODEL,
    status: "success",
    tokenUsage: null,
    errorMessage: null
  });
  return { date: input.date, categoryId: input.categoryId, output, run, context };
}

function buildContext(
  categoryId: number,
  categoryName: string,
  marketplace: string,
  date: string,
  snapshots: BestsellerRankSnapshot[],
  brandMatrix: BrandMatrixSnapshot[],
  signals: CategorySignalLog[],
  activeCompetitorKeys: Set<string>
): AiProductResearchContext {
  const prices = snapshots
    .map((item) => item.finalEstimatedPrice ?? item.currentPrice)
    .filter((price): price is number => price !== null && Number.isFinite(price) && price > 0)
    .sort((left, right) => left - right);
  const topBrands = brandMatrix.length > 0
    ? [...brandMatrix]
      .sort((left, right) => right.productCountTop100 - left.productCountTop100 || (left.bestRank ?? 999) - (right.bestRank ?? 999))
      .slice(0, 5)
      .map((item) => ({
        brand: item.brand,
        top100Count: item.productCountTop100,
        top20Count: item.productCountTop20,
        bestRank: item.bestRank
      }))
    : deriveSnapshotBrands(snapshots);

  return {
    categoryId,
    categoryName,
    marketplace,
    date,
    snapshotCount: snapshots.length,
    brandCount: brandMatrix.length > 0 ? brandMatrix.length : topBrands.length,
    pricedProductCount: prices.length,
    minimumPrice: prices[0] ?? null,
    medianPrice: median(prices),
    maximumPrice: prices.at(-1) ?? null,
    newProductCount: signals.filter((item) => item.signalType === "new_product_breakout").length,
    lowReviewTop50Count: snapshots.filter((item) => item.rank <= 50 && item.reviewCount !== null && item.reviewCount <= 200).length,
    topBrands,
    recommendedCompetitors: buildRecommendedCompetitors(snapshots, signals, activeCompetitorKeys)
  };
}

function buildRecommendedCompetitors(
  snapshots: BestsellerRankSnapshot[],
  signals: CategorySignalLog[],
  activeCompetitorKeys: Set<string>
): AiProductResearchContext["recommendedCompetitors"] {
  const breakoutAsins = new Set(
    signals
      .filter((item) => item.signalType === "new_product_breakout" && item.asin)
      .map((item) => item.asin as string)
  );

  return snapshots
    .filter((item) => breakoutAsins.has(item.asin) || isLowReviewTop50(item))
    .sort((left, right) => {
      const leftBreakout = breakoutAsins.has(left.asin) ? 0 : 1;
      const rightBreakout = breakoutAsins.has(right.asin) ? 0 : 1;
      return leftBreakout - rightBreakout
        || left.rank - right.rank
        || (left.reviewCount ?? Number.MAX_SAFE_INTEGER) - (right.reviewCount ?? Number.MAX_SAFE_INTEGER)
        || left.asin.localeCompare(right.asin);
    })
    .slice(0, 5)
    .map((item) => {
      const isBreakout = breakoutAsins.has(item.asin);
      const isLowReview = isLowReviewTop50(item);
      return {
        asin: item.asin,
        title: item.title,
        brand: item.brand,
        rank: item.rank,
        price: item.finalEstimatedPrice ?? item.currentPrice,
        reviewCount: item.reviewCount,
        candidateType: isBreakout && isLowReview
          ? "breakout_low_review" as const
          : isBreakout
            ? "new_product_breakout" as const
            : "low_review_top50" as const,
        reason: candidateReason(item, isBreakout, isLowReview),
        isInCompetitorPool: activeCompetitorKeys.has(`${item.marketplace}:${item.asin}`)
      };
    });
}

function isLowReviewTop50(item: BestsellerRankSnapshot): boolean {
  return item.rank <= 50 && item.reviewCount !== null && item.reviewCount <= 200;
}

function candidateReason(item: BestsellerRankSnapshot, isBreakout: boolean, isLowReview: boolean): string {
  if (isBreakout && isLowReview) {
    return `新品黑马进入 #${item.rank}，且 Review 仅 ${item.reviewCount ?? 0}，值得持续验证起量路径。`;
  }
  if (isBreakout) {
    return `新品黑马信号进入 #${item.rank}，建议加入竞品池跟踪价格、活动与排名延续性。`;
  }
  return `Top50 排名 #${item.rank}，Review 仅 ${item.reviewCount ?? 0}，具备低评价基数切入证据。`;
}

function deriveSnapshotBrands(snapshots: BestsellerRankSnapshot[]): AiProductResearchContext["topBrands"] {
  const brands = new Map<string, { top100Count: number; top20Count: number; bestRank: number }>();
  for (const snapshot of snapshots) {
    const brand = snapshot.brand?.trim();
    if (!brand) continue;
    const current = brands.get(brand) ?? { top100Count: 0, top20Count: 0, bestRank: snapshot.rank };
    current.top100Count += snapshot.rank <= 100 ? 1 : 0;
    current.top20Count += snapshot.rank <= 20 ? 1 : 0;
    current.bestRank = Math.min(current.bestRank, snapshot.rank);
    brands.set(brand, current);
  }
  return [...brands.entries()]
    .map(([brand, counts]) => ({ brand, ...counts }))
    .sort((left, right) => right.top100Count - left.top100Count || left.bestRank - right.bestRank)
    .slice(0, 5);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2 : values[middle] ?? null;
}
