import type {
  AiAgentOutput,
  AiProductResearchContext,
  AiProductResearchResponse,
  AiRecommendedAction,
  BestsellerRankSnapshot,
  BrandMatrixSnapshot,
  CategorySignalLog
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { normalizeAiActionPriority, validateAiAgentOutput } from "./ai-agent-policy.js";

const PRODUCT_RESEARCH_MODEL = "deterministic-product-research-v1";

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
  const confidence = calculateConfidence(context, signals.length);
  const output = buildOutput(context, confidence);
  const validationErrors = validateAiAgentOutput(output);
  const inputContextJson = JSON.stringify({
    date: input.date,
    orgId: input.orgId,
    categoryId: input.categoryId,
    snapshotCount: context.snapshotCount,
    brandCount: context.brandCount,
    signalCount: signals.length,
    recommendedCompetitorAsins: context.recommendedCompetitors.map((item) => item.asin),
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

function buildOutput(context: AiProductResearchContext, confidence: number): AiAgentOutput {
  return {
    summary: context.snapshotCount === 0
      ? `${context.categoryName} 在 ${context.date} 暂无榜单快照，当前不能形成选品结论。`
      : `${context.categoryName} 已分析 ${context.snapshotCount} 个榜单商品、${context.brandCount} 个品牌，中位价格为 ${formatPrice(context.medianPrice)}。`,
    evidence: buildEvidence(context),
    impact: buildImpact(context),
    recommended_actions: buildActions(context, confidence),
    confidence
  };
}

function buildEvidence(context: AiProductResearchContext): string[] {
  if (context.snapshotCount === 0) {
    return [`${context.date} 没有 ${context.categoryName} 的 BSR 快照，价格带、品牌集中度和新品信号均不可验证。`];
  }
  const evidence = [
    `榜单覆盖 ${context.snapshotCount} 个 ASIN，其中 ${context.pricedProductCount} 个有可用价格。`,
    `可观测价格带 ${formatPrice(context.minimumPrice)} - ${formatPrice(context.maximumPrice)}，中位数 ${formatPrice(context.medianPrice)}。`,
    `Top50 中有 ${context.lowReviewTop50Count} 个 Review 不超过 200 的商品。`,
    `当日识别 ${context.newProductCount} 个新品黑马信号。`
  ];
  if (context.topBrands.length > 0) {
    evidence.push(`头部品牌：${context.topBrands.map((item) => `${item.brand}(${item.top100Count})`).join("、")}。`);
  }
  evidence.push("当前类目证据未关联 Review VOC，用户痛点与差异化卖点仍需评论样本验证。");
  return evidence;
}

function buildImpact(context: AiProductResearchContext): string {
  if (context.snapshotCount === 0) {
    return "缺少榜单证据时直接立项会放大价格带、竞争强度和需求判断偏差。";
  }
  if (context.newProductCount > 0 || context.lowReviewTop50Count > 0) {
    return "新品进入榜单或低 Review 商品占据 Top50，说明类目可能存在可验证的切入窗口，但还不能替代需求、成本与 VOC 调研。";
  }
  return "当前榜单没有强烈的新品或低 Review 切入信号，应先验证细分需求再决定是否进入。";
}

function buildActions(context: AiProductResearchContext, confidence: number): AiRecommendedAction[] {
  if (context.snapshotCount === 0) {
    return [{
      action: `先采集 ${context.categoryName} Top100 快照，再运行选品分析`,
      priority: normalizeAiActionPriority("P2", confidence),
      reason: "当前没有价格、品牌和排名证据。",
      risk: "在空数据下立项可能误判类目容量和竞争强度。",
      needs_human_approval: true
    }];
  }
  const brandNames = context.topBrands.slice(0, 3).map((item) => item.brand).join("、") || "头部品牌";
  return [
    {
      action: `验证 ${formatPrice(context.medianPrice)} 附近价格带的需求与利润空间`,
      priority: normalizeAiActionPriority("P1", confidence),
      reason: `当前可观测价格范围为 ${formatPrice(context.minimumPrice)} - ${formatPrice(context.maximumPrice)}。`,
      risk: "榜单价格不包含完整成本、促销后利润和站外需求。",
      needs_human_approval: true
    },
    {
      action: `拆解 ${brandNames} 的产品矩阵与 Top20 占位`,
      priority: normalizeAiActionPriority("P1", confidence),
      reason: "头部品牌矩阵是当前类目竞争结构的直接证据。",
      risk: "模仿头部商品可能忽略细分人群和供应链差异。",
      needs_human_approval: true
    },
    {
      action: "导入目标 ASIN 的 Review VOC，验证用户痛点和未满足需求",
      priority: normalizeAiActionPriority("P1", confidence),
      reason: "榜单数据不能独立证明用户痛点，当前缺少评论文本证据。",
      risk: "没有 VOC 支撑的差异化卖点容易变成主观判断。",
      needs_human_approval: true
    },
    {
      action: `基于 Top50 低 Review 商品和新品信号编写 ${context.categoryName} 新品立项草案`,
      priority: normalizeAiActionPriority(context.newProductCount > 0 || context.lowReviewTop50Count > 0 ? "P1" : "P2", confidence),
      reason: `当前有 ${context.newProductCount} 个新品信号、${context.lowReviewTop50Count} 个低 Review Top50 商品可供验证。`,
      risk: "立项前仍需人工确认需求规模、专利、合规、成本和供应链可行性。",
      needs_human_approval: true
    }
  ];
}

function calculateConfidence(context: AiProductResearchContext, signalCount: number): number {
  if (context.snapshotCount === 0) return 0.35;
  let confidence = 0.5;
  if (context.snapshotCount >= 50) confidence += 0.08;
  if (context.pricedProductCount >= 10) confidence += 0.08;
  if (context.brandCount >= 3) confidence += 0.07;
  if (signalCount > 0) confidence += 0.05;
  return Math.min(0.78, Number(confidence.toFixed(2)));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2 : values[middle] ?? null;
}

function formatPrice(value: number | null): string {
  return value === null ? "暂无" : value.toFixed(2);
}
