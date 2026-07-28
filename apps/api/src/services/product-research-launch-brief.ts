import type {
  AiDataFreshness,
  AiProductLaunchBrief,
  AiProductResearchContext,
  BestsellerRankSnapshot
} from "@amazon-monitor/shared";

export function buildProductLaunchBrief(
  context: AiProductResearchContext,
  snapshots: BestsellerRankSnapshot[],
  dataFreshness: AiDataFreshness
): AiProductLaunchBrief | undefined {
  if (snapshots.length === 0) return undefined;

  const competitorMatrix = [...snapshots]
    .sort((left, right) => left.rank - right.rank || left.asin.localeCompare(right.asin))
    .slice(0, 5)
    .map((snapshot) => buildCompetitorRow(context, snapshot));
  const currency = snapshots.find((item) => item.currency)?.currency ?? null;
  const hasEntrySignal = context.newProductCount > 0 || context.lowReviewTop50Count > 0;
  const decisionReady = dataFreshness.freshnessStatus === "fresh"
    && (dataFreshness.syncStatus === "success" || dataFreshness.syncStatus === "manual");

  return {
    title: `${context.categoryName} 新品立项草案`,
    evidenceDate: context.date,
    categoryName: context.categoryName,
    marketplace: context.marketplace,
    decision: hasEntrySignal && decisionReady ? "validate" : "hold",
    opportunityThesis: !decisionReady
      ? `当前证据不可进入立项验证：${dataFreshness.warning ?? dataFreshness.failureReason ?? "数据状态无法确认"}`
      : hasEntrySignal
      ? `当前榜单存在 ${context.newProductCount} 个新品信号和 ${context.lowReviewTop50Count} 个低 Review Top50 商品，可进入人工验证阶段。`
      : "当前榜单缺少明确的新品或低 Review 切入信号，建议保持观察并补齐需求证据。",
    priceBand: {
      minimum: context.minimumPrice,
      target: context.medianPrice,
      maximum: context.maximumPrice,
      currency,
      evidence: `基于 ${context.pricedProductCount}/${context.snapshotCount} 个有价格的榜单样本，中位价格 ${formatPrice(context.medianPrice, currency)}。`
    },
    customerPainEvidence: {
      status: "data_gap",
      conclusion: "当前 BSR、价格和品牌证据不能证明具体用户痛点。",
      evidence: ["本次输入未包含目标 ASIN 的 Review VOC 或客服问题样本。"],
      validationNeeded: [
        "导入至少 3 个目标 ASIN 的近期 Review 文本并按主题、情绪和频次聚类。",
        "区分产品缺陷、使用门槛、物流包装和期望偏差，保留可追溯评论证据。"
      ]
    },
    competitorMatrix,
    differentiationHypotheses: buildDifferentiationHypotheses(context, currency),
    validationChecklist: buildValidationChecklist(context),
    riskNotes: [
      ...(dataFreshness.warning ? [dataFreshness.warning] : []),
      ...(dataFreshness.failureReason ? [dataFreshness.failureReason] : []),
      "该草案是人工立项评审输入，不代表自动批准开发、采购或上架。",
      "榜单排名和价格不能替代市场容量、专利合规、成本利润与供应链可行性验证。",
      "任何差异化卖点在 Review VOC 和样品测试完成前均属于待验证假设。"
    ]
  };
}

function buildCompetitorRow(
  context: AiProductResearchContext,
  snapshot: BestsellerRankSnapshot
): AiProductLaunchBrief["competitorMatrix"][number] {
  const candidate = context.recommendedCompetitors.find((item) => item.asin === snapshot.asin);
  const signal = candidate?.candidateType === "breakout_low_review"
    ? "新品黑马 · 低 Review"
    : candidate?.candidateType === "new_product_breakout"
      ? "新品黑马"
      : candidate?.candidateType === "low_review_top50"
        ? "Top50 · 低 Review"
        : `榜单 #${snapshot.rank}`;
  return {
    asin: snapshot.asin,
    brand: snapshot.brand,
    title: snapshot.title,
    rank: snapshot.rank,
    price: snapshot.finalEstimatedPrice ?? snapshot.currentPrice,
    reviewCount: snapshot.reviewCount,
    signal,
    evidence: [
      `${context.date} BSR #${snapshot.rank}`,
      `价格 ${formatPrice(snapshot.finalEstimatedPrice ?? snapshot.currentPrice, snapshot.currency)}`,
      `Review ${snapshot.reviewCount ?? "暂无"}`
    ]
  };
}

function buildDifferentiationHypotheses(
  context: AiProductResearchContext,
  currency: string | null
): AiProductLaunchBrief["differentiationHypotheses"] {
  const hypotheses: AiProductLaunchBrief["differentiationHypotheses"] = [{
    hypothesis: `验证 ${formatPrice(context.medianPrice, currency)} 附近的价值组合能否覆盖目标利润率。`,
    evidence: [
      `可观测价格范围 ${formatPrice(context.minimumPrice, currency)} - ${formatPrice(context.maximumPrice, currency)}`,
      `中位价格 ${formatPrice(context.medianPrice, currency)}`
    ],
    validationNeeded: "补齐采购成本、平台费用、广告成本和促销折扣后计算贡献毛利。"
  }];

  if (context.lowReviewTop50Count > 0) {
    hypotheses.push({
      hypothesis: "验证低评价基数商品进入 Top50 的驱动是否可持续，而不是短期促销或库存波动。",
      evidence: [`Top50 中有 ${context.lowReviewTop50Count} 个 Review 不超过 200 的商品。`],
      validationNeeded: "连续跟踪 7 天排名、价格、Coupon、Deal 和 Review 增长，并分析目标 ASIN 的 VOC。"
    });
  } else {
    hypotheses.push({
      hypothesis: "头部占位较稳定，差异化方向应先从细分需求证据中寻找，而不是复制榜单商品。",
      evidence: [`当日新品信号 ${context.newProductCount} 个，低 Review Top50 商品 ${context.lowReviewTop50Count} 个。`],
      validationNeeded: "完成关键词细分、Review VOC 与竞品功能矩阵后再定义产品特征。"
    });
  }
  return hypotheses;
}

function buildValidationChecklist(
  context: AiProductResearchContext
): AiProductLaunchBrief["validationChecklist"] {
  const items: AiProductLaunchBrief["validationChecklist"] = [
    { item: "Review VOC 与用户问题验证", gate: "required", evidenceRequired: "目标 ASIN 评论主题、原文证据、负向频次与未满足需求。" },
    { item: "利润安全线", gate: "required", evidenceRequired: "采购、头程、平台费、广告、促销和退货假设下的贡献毛利。" },
    { item: "专利与合规审查", gate: "required", evidenceRequired: "目标站点法规、认证、商标和专利检索结论。" },
    { item: "供应链可行性", gate: "required", evidenceRequired: "样品、MOQ、交期、良率、包装和备选供应商。" },
    { item: "竞品持续性观察", gate: "recommended", evidenceRequired: "候选 ASIN 至少 7 天的排名、价格、活动和 Review 变化。" }
  ];
  if (context.newProductCount > 0) {
    items.push({
      item: "新品黑马路径复核",
      gate: "recommended",
      evidenceRequired: `${context.newProductCount} 个新品信号的流量来源、促销节奏和排名延续性。`
    });
  }
  return items;
}

function formatPrice(value: number | null, currency: string | null): string {
  if (value === null) return "暂无";
  return `${currency ? `${currency} ` : ""}${value.toFixed(2)}`;
}
