import type {
  AiAgentOutput,
  AiDataFreshness,
  AiProductResearchContext,
  AiRecommendedAction,
  BestsellerRankSnapshot
} from "@amazon-monitor/shared";
import { normalizeAiActionPriority } from "./ai-agent-policy.js";
import { buildProductLaunchBrief } from "./product-research-launch-brief.js";

export function buildProductResearchOutput(
  context: AiProductResearchContext,
  snapshots: BestsellerRankSnapshot[],
  signalCount: number,
  dataFreshness: AiDataFreshness
): AiAgentOutput {
  const confidence = calculateConfidence(context, signalCount, dataFreshness);
  const productLaunchBrief = buildProductLaunchBrief(context, snapshots, dataFreshness);
  return {
    summary: buildSummary(context, dataFreshness),
    evidence: buildEvidence(context, dataFreshness),
    impact: buildImpact(context, dataFreshness),
    recommended_actions: buildActions(context, confidence, dataFreshness),
    confidence,
    dataFreshness,
    artifacts: productLaunchBrief ? { productLaunchBrief } : undefined
  };
}

function buildSummary(context: AiProductResearchContext, freshness: AiDataFreshness): string {
  const freshnessRisk = freshness.warning ?? freshness.failureReason;
  if (context.snapshotCount === 0) {
    return `${context.categoryName} 在 ${context.date} 暂无榜单快照，当前不能形成选品结论。`;
  }
  if (freshnessRisk) {
    return `${context.categoryName} 的榜单证据不可用于当前立项判断：${freshnessRisk}`;
  }
  return `${context.categoryName} 已分析 ${context.snapshotCount} 个榜单商品、${context.brandCount} 个品牌，中位价格为 ${formatPrice(context.medianPrice)}。`;
}

function buildEvidence(context: AiProductResearchContext, freshness: AiDataFreshness): string[] {
  const freshnessEvidence = `数据来源 ${freshness.dataSource}，证据日期 ${freshness.evidenceDate}，更新时间 ${freshness.lastSyncedAt ?? "暂无"}，采集状态 ${freshness.syncStatus ?? "暂无"}。`;
  if (context.snapshotCount === 0) {
    return [
      `${context.date} 没有 ${context.categoryName} 的 BSR 快照，价格带、品牌集中度和新品信号均不可验证。`,
      freshnessEvidence
    ];
  }
  const evidence = [
    freshnessEvidence,
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

function buildImpact(context: AiProductResearchContext, freshness: AiDataFreshness): string {
  if (freshness.warning || freshness.failureReason) {
    return "数据已过期或采集不完整，继续生成立项动作会放大价格带、竞争强度和需求判断偏差。";
  }
  if (context.snapshotCount === 0) {
    return "缺少榜单证据时直接立项会放大价格带、竞争强度和需求判断偏差。";
  }
  if (context.newProductCount > 0 || context.lowReviewTop50Count > 0) {
    return "新品进入榜单或低 Review 商品占据 Top50，说明类目可能存在可验证的切入窗口，但还不能替代需求、成本与 VOC 调研。";
  }
  return "当前榜单没有强烈的新品或低 Review 切入信号，应先验证细分需求再决定是否进入。";
}

function buildActions(
  context: AiProductResearchContext,
  confidence: number,
  freshness: AiDataFreshness
): AiRecommendedAction[] {
  const freshnessRisk = freshness.warning ?? freshness.failureReason;
  if (context.snapshotCount === 0 || freshnessRisk) {
    return [{
      action: `重新采集 ${context.categoryName} Top100 快照，再运行选品分析`,
      priority: normalizeAiActionPriority("P2", confidence),
      reason: freshnessRisk ?? "当前没有价格、品牌和排名证据。",
      risk: "在空数据、过期数据或不完整数据下立项可能误判类目容量和竞争强度。",
      needs_human_approval: true
    }];
  }
  const brandNames = context.topBrands.slice(0, 3).map((item) => item.brand).join("、") || "头部品牌";
  return [
    action(`验证 ${formatPrice(context.medianPrice)} 附近价格带的需求与利润空间`, `当前可观测价格范围为 ${formatPrice(context.minimumPrice)} - ${formatPrice(context.maximumPrice)}。`, "榜单价格不包含完整成本、促销后利润和站外需求。", confidence),
    action(`拆解 ${brandNames} 的产品矩阵与 Top20 占位`, "头部品牌矩阵是当前类目竞争结构的直接证据。", "模仿头部商品可能忽略细分人群和供应链差异。", confidence),
    action("导入目标 ASIN 的 Review VOC，验证用户痛点和未满足需求", "榜单数据不能独立证明用户痛点，当前缺少评论文本证据。", "没有 VOC 支撑的差异化卖点容易变成主观判断。", confidence),
    action(
      `基于 Top50 低 Review 商品和新品信号编写 ${context.categoryName} 新品立项草案`,
      `当前有 ${context.newProductCount} 个新品信号、${context.lowReviewTop50Count} 个低 Review Top50 商品可供验证。`,
      "立项前仍需人工确认需求规模、专利、合规、成本和供应链可行性。",
      confidence,
      context.newProductCount > 0 || context.lowReviewTop50Count > 0 ? "P1" : "P2"
    )
  ];
}

function action(
  actionText: string,
  reason: string,
  risk: string,
  confidence: number,
  priority: AiRecommendedAction["priority"] = "P1"
): AiRecommendedAction {
  return {
    action: actionText,
    priority: normalizeAiActionPriority(priority, confidence),
    reason,
    risk,
    needs_human_approval: true
  };
}

function calculateConfidence(
  context: AiProductResearchContext,
  signalCount: number,
  freshness: AiDataFreshness
): number {
  if (context.snapshotCount === 0) return 0.35;
  let confidence = 0.5;
  if (context.snapshotCount >= 50) confidence += 0.08;
  if (context.pricedProductCount >= 10) confidence += 0.08;
  if (context.brandCount >= 3) confidence += 0.07;
  if (signalCount > 0) confidence += 0.05;
  const rounded = Math.min(0.78, Number(confidence.toFixed(2)));
  return freshness.warning || freshness.failureReason ? Math.min(0.49, rounded) : rounded;
}

function formatPrice(value: number | null): string {
  return value === null ? "暂无" : value.toFixed(2);
}
