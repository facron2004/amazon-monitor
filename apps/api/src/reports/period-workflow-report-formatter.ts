import type {
  DailyReportCoverageStatus,
  ProductListingHealthItem,
  ReviewVocSummary,
  WorkflowReportPeriod
} from "@amazon-monitor/shared";
import type {
  MarketplaceAdsPerformance,
  MarketplacePerformance,
  PeriodWorkflowEvidence
} from "./period-workflow-report.js";

export function buildPeriodWorkflowMarkdown(
  period: WorkflowReportPeriod,
  startDate: string,
  endDate: string,
  evidence: PeriodWorkflowEvidence,
  coverageStatus: DailyReportCoverageStatus
): string {
  const reportLabel = period === "weekly" ? "周报" : "月报";
  const nextLabel = period === "weekly" ? "下周" : "下月";
  const listingRisks = evidence.listingItems.filter((item) => item.health.level !== "healthy");
  const reviewRisks = evidence.reviewSummaries.filter((item) => item.level !== "healthy" && item.reviewCount > 0);
  return [
    `# 跨境电商运营${reportLabel}`,
    "",
    `报告区间：${startDate} 至 ${endDate}`,
    `生成时间：${new Date().toISOString()}`,
    `数据覆盖：${coverageLabel(coverageStatus)}`,
    "",
    "> 本报告基于系统内已记录证据生成。不同站点币种分别统计，未做汇率换算；价格、广告、Listing 和补货动作仍需人工审批。",
    "",
    "## 1. 本期销售与利润变化",
    ...linesOrFallback(evidence.performance.map(formatMarketplacePerformance), "- 暂无自营 SKU 销售或利润指标。"),
    "",
    "## 2. 品牌 / SKU 表现排行",
    ...linesOrFallback(evidence.performance.flatMap(formatSkuRanking), "- 暂无可排序的 SKU 销售数据。"),
    "",
    "## 3. 竞品动作时间线",
    ...linesOrFallback(evidence.insightReport.topEvents.slice(0, 10).map((event) =>
      `- ${event.eventDate} [${event.eventLevel}] ${[event.brand, event.asin].filter(Boolean).join(" ") || "竞品"}：${event.eventTitle}。${event.suggestedAction}`
    ), "- 本期没有结构化竞品动作事件。"),
    "",
    "## 4. 类目格局变化",
    ...linesOrFallback(evidence.insightReport.topBrands.slice(0, 8).map((brand) =>
      `- ${brand.brand}：${brand.eventCount} 个事件，最高分 ${brand.topScore}，核心风险 ${brand.coreRiskCount}。代表事件：${brand.representativeEventTitle || "-"}`
    ), "- 本期没有足够的品牌或类目事件证据。"),
    "",
    "## 5. 广告效率变化",
    ...linesOrFallback(evidence.ads.map(formatAdsPerformance), "- 暂无可按站点归属的广告指标。"),
    ...(evidence.unassignedAdsCount > 0 ? [`- 另有 ${evidence.unassignedAdsCount} 条广告指标未关联 SKU/站点，未参与币种汇总。`] : []),
    "",
    "## 6. Listing / Review 问题",
    ...linesOrFallback([
      ...listingRisks.slice(0, 6).map((item) =>
        `- [Listing ${item.health.level}] ${item.sku}：健康分 ${item.health.score}；${item.health.issues[0]?.message ?? "需要复核 Listing 证据"}`
      ),
      ...reviewRisks.slice(0, 6).map((item) =>
        `- [Review ${item.level}] ${item.sku}：${item.reviewCount} 条，负面率 ${formatPercent(item.negativeRate)}；${item.issues[0]?.message ?? "需要复核评论主题"}`
      )
    ], "- 本期没有可确认的 Listing 或 Review 风险。"),
    "",
    "## 7. 本期任务完成情况",
    `- 已完成或已复盘任务：${evidence.completedTasks.length}`,
    ...linesOrFallback(evidence.completedTasks.slice(0, 10).map((task) =>
      `- [${task.priority}] ${task.title}：${task.status}${task.reviewResult ? `，复盘 ${task.reviewResult}` : ""}`
    ), "- 本期没有完成或复盘记录。"),
    "",
    `## 8. ${nextLabel}重点动作建议`,
    ...buildNextActions(evidence, listingRisks, reviewRisks),
    "",
    "## 数据覆盖",
    `- 自营指标 ${evidence.coverage.productMetrics} 条 / ${evidence.coverage.marketplaces} 个站点`,
    `- 洞察事件 ${evidence.coverage.insightEvents} / 广告指标 ${evidence.coverage.adsMetrics}`,
    `- Listing 快照 ${evidence.coverage.listingHealthItems} / Review ${evidence.coverage.reviews}`,
    `- 完成任务 ${evidence.coverage.completedTasks}`
  ].join("\n");
}

function buildNextActions(
  evidence: PeriodWorkflowEvidence,
  listingRisks: ProductListingHealthItem[],
  reviewRisks: ReviewVocSummary[]
): string[] {
  const actions: string[] = [];
  for (const event of evidence.insightReport.topEvents.slice(0, 3)) {
    actions.push(`- [${event.eventLevel}] ${event.suggestedAction}（证据：${event.eventTitle}）`);
  }
  const inefficientAds = evidence.ads.find((item) => item.acos !== null && item.acos >= 0.3);
  if (inefficientAds) {
    actions.push(`- [P1] 复核 ${inefficientAds.marketplace} 广告搜索词、出价和预算，当前 ACOS ${formatPercent(inefficientAds.acos)}。`);
  }
  if (listingRisks[0]) {
    actions.push(`- [P1] 评审 ${listingRisks[0].sku} Listing 修订草案，先处理 ${listingRisks[0].health.issues[0]?.label ?? "健康分缺口"}。`);
  }
  if (reviewRisks[0]) {
    actions.push(`- [P1] 汇总 ${reviewRisks[0].sku} 负面主题并创建供应商或客服跟进任务。`);
  }
  return actions.slice(0, 5).length > 0
    ? actions.slice(0, 5)
    : ["- [P2] 当前证据不足以生成高置信度动作；先补齐销售、广告、Listing 和 Review 数据。"];
}

function formatMarketplacePerformance(item: MarketplacePerformance): string {
  return `- ${item.marketplace}：销售 ${formatMoney(item.sales, item.marketplace)}（环比 ${formatChange(item.sales, item.previousSales)}），`
    + `订单 ${item.orders}，毛利 ${formatNullableMoney(item.grossProfit, item.marketplace)}`
    + `（环比 ${formatNullableChange(item.grossProfit, item.previousGrossProfit)}）。`;
}

function formatSkuRanking(item: MarketplacePerformance): string[] {
  return item.topSkus.map((sku, index) =>
    `- ${item.marketplace} #${index + 1} ${sku.sku}：销售 ${formatMoney(sku.sales, item.marketplace)}，毛利 ${formatNullableMoney(sku.grossProfit, item.marketplace)}`
  );
}

function formatAdsPerformance(item: MarketplaceAdsPerformance): string {
  return `- ${item.marketplace}：花费 ${formatMoney(item.spend, item.marketplace)}，广告销售 ${formatMoney(item.sales, item.marketplace)}，`
    + `ACOS ${formatPercent(item.acos)}（上期 ${formatPercent(item.previousAcos)}）。`;
}

function formatChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "0%" : "无上期基线";
  return `${((current - previous) / previous * 100).toFixed(1)}%`;
}

function formatNullableChange(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return "证据不足";
  return formatChange(current, previous);
}

function formatMoney(value: number, marketplace: string): string {
  return `${marketplaceSymbol(marketplace)}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}`;
}

function formatNullableMoney(value: number | null, marketplace: string): string {
  return value === null ? "-" : formatMoney(value, marketplace);
}

function marketplaceSymbol(marketplace: string): string {
  if (marketplace === "UK" || marketplace === "GB") return "£";
  if (marketplace === "DE") return "€";
  if (marketplace === "JP") return "¥";
  return "$";
}

function formatPercent(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function coverageLabel(status: DailyReportCoverageStatus): string {
  if (status === "complete") return "完整";
  if (status === "partial") return "部分";
  return "等待数据";
}

function linesOrFallback(lines: string[], fallback: string): string[] {
  return lines.length > 0 ? lines : [fallback];
}
