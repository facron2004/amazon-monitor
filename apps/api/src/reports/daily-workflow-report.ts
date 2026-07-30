import {
  insightEventTypeLabels,
  taskStatusLabels,
  type AdsWorkflowSummary,
  type BsrRankChange,
  type DashboardOperationsSummary,
  type DailyChange,
  type DailyReportArchive,
  type DailyReportCoverage,
  type DailyReportCoverageStatus,
  type InsightEvent,
  type InventoryReplenishmentPlan,
  type OwnedProductListItem,
  type Task
} from "@amazon-monitor/shared";
import { generateDailyBrief } from "../services/ai-agent-service.js";
import type { Store } from "../store.js";

const OPEN_TASK_STATUSES: Task["status"][] = ["pending", "in_progress", "awaiting_review"];
const competitorChangeTypes = new Set<DailyChange["changeType"]>([
  "price_drop",
  "price_rise",
  "new_coupon",
  "coupon_disappeared",
  "coupon_strengthened",
  "coupon_weakened",
  "new_sponsored",
  "sponsored_disappeared",
  "new_competitor",
  "dropped_competitor",
  "historical_low"
]);
const competitorDetailEventTypes: ReadonlySet<InsightEvent["eventType"]> = new Set([
  "RATING_DROP",
  "LISTING_CHANGED"
]);
const keywordRuleEventTypes: ReadonlySet<InsightEvent["eventType"]> = new Set([
  "KEYWORD_PAGE_DROP"
]);

interface GenerateDailyWorkflowReportInput {
  date: string;
  orgId: number;
  generatedBy: number;
}

interface DailyWorkflowEvidence {
  products: OwnedProductListItem[];
  operations: DashboardOperationsSummary;
  changes: DailyChange[];
  bsrChanges: BsrRankChange[];
  events: InsightEvent[];
  ads: AdsWorkflowSummary;
  inventoryPlans: InventoryReplenishmentPlan[];
  openTasks: Task[];
  keywordReport: string;
  categoryReport: string;
  coverage: DailyReportCoverage;
}

export function generateDailyWorkflowReport(
  store: Store,
  input: GenerateDailyWorkflowReportInput
): DailyReportArchive {
  const evidence = collectEvidence(store, input);
  const brief = generateDailyBrief(store, { date: input.date, orgId: input.orgId });
  const signalCount = countSignals(evidence);
  const riskCount = countRisks(evidence);
  const coverageStatus = resolveDailyReportCoverageStatus(evidence.coverage);
  const markdown = buildDailyWorkflowMarkdown(input.date, evidence, brief.output, coverageStatus);

  return store.saveDailyReportArchive({
    orgId: input.orgId,
    reportDate: input.date,
    markdown,
    coverageStatus,
    coverage: evidence.coverage,
    signalCount,
    riskCount,
    taskCount: evidence.openTasks.length,
    generatedBy: input.generatedBy
  });
}

export function collectDailyWorkflowReportCoverage(
  store: Store,
  input: Pick<GenerateDailyWorkflowReportInput, "date" | "orgId">
): DailyReportCoverage {
  return collectEvidence(store, input).coverage;
}

function collectEvidence(
  store: Store,
  input: Pick<GenerateDailyWorkflowReportInput, "date" | "orgId">
): DailyWorkflowEvidence {
  const dashboard = store.getDashboardSummary(input.date, input.orgId);
  const operations = store.getDashboardOperationsSummary(input.orgId, input.date);
  const products = store.listProducts({ orgId: input.orgId, status: "active", date: input.date, limit: 1000 });
  const changes = store.listDailyChanges({ orgId: input.orgId, date: input.date });
  const bsrChanges = store.listBsrRankChanges({ orgId: input.orgId, date: input.date, includeUnchanged: false, limit: 1000 });
  const events = store.listInsightEvents({ orgId: input.orgId, date: input.date, limit: 1000 });
  const competitorDetailEvents = events.filter((event) => competitorDetailEventTypes.has(event.eventType));
  const ads = store.getAdsWorkflowSummary({ orgId: input.orgId, date: input.date, limit: 1000 });
  const inventoryPlans = store.listInventoryPlans({ orgId: input.orgId, date: input.date, limit: 1000 });
  const openTasks = store
    .listTasks({ statusIn: OPEN_TASK_STATUSES, limit: 1000 })
    .filter((task) => task.orgId === input.orgId)
    .sort(compareTasks);

  return {
    products,
    operations,
    changes,
    bsrChanges,
    events,
    ads,
    inventoryPlans,
    openTasks,
    keywordReport: store.getDailyReport(input.date, undefined, input.orgId),
    categoryReport: store.getCategoryReport(input.date, undefined, input.orgId),
    coverage: {
      ownSkuMetrics: products.filter(hasOperationalEvidence).length,
      keywordSnapshots: dashboard.todaySnapshotCount,
      categorySnapshots: dashboard.categorySnapshotCount,
      competitorChanges: changes.filter((change) => competitorChangeTypes.has(change.changeType)).length
        + competitorDetailEvents.length,
      bsrChanges: bsrChanges.length,
      insightEvents: events.length,
      adsMetrics: ads.items.length,
      inventoryPlans: inventoryPlans.filter((plan) => (
        plan.latestMetric !== null
        || (plan.spApiInventoryEvidence !== null && plan.spApiInventoryEvidence !== undefined)
      )).length,
      openTasks: openTasks.length
    }
  };
}

function buildDailyWorkflowMarkdown(
  date: string,
  evidence: DailyWorkflowEvidence,
  brief: ReturnType<typeof generateDailyBrief>["output"],
  coverageStatus: DailyReportCoverageStatus
): string {
  const competitorChanges = evidence.changes.filter((change) => competitorChangeTypes.has(change.changeType));
  const competitorDetailEvents = evidence.events.filter((event) => competitorDetailEventTypes.has(event.eventType));
  const keywordChanges = evidence.changes.filter((change) => !competitorChangeTypes.has(change.changeType));
  const keywordRuleEvents = evidence.events.filter((event) => keywordRuleEventTypes.has(event.eventType));
  const adIssues = evidence.ads.items.flatMap((item) => item.insights.map((insight) => ({ item, insight })));
  const inventoryIssues = evidence.inventoryPlans.flatMap((plan) => plan.issues.map((issue) => ({ plan, issue })));
  const operatingProductCount = evidence.products.filter(hasOperationalEvidence).length;
  const highRiskSkus = evidence.products.filter((product) => product.riskScore.level === "high").length;

  return [
    "# 跨境电商运营日报",
    "",
    `日期：${date}`,
    `生成时间：${new Date().toISOString()}`,
    `数据覆盖：${coverageStatus === "complete" ? "完整" : coverageStatus === "partial" ? "部分" : "等待数据"}`,
    "",
    "> 本报告只基于系统内已记录证据生成；价格、广告、Listing 等高风险动作仍需人工审批。",
    "",
    "## 1. 今日经营概览",
    `- 活跃自营 SKU：${evidence.products.length}，有当期经营证据 ${operatingProductCount}，高风险 SKU ${highRiskSkus}`,
    `- 站点经营（原币金额，未做汇率换算）：${formatMarketplaceOperations(evidence.operations)}`,
    `- 关键词快照：${evidence.coverage.keywordSnapshots}，类目快照：${evidence.coverage.categorySnapshots}`,
    `- 洞察事件：${evidence.events.length}，开放任务：${evidence.openTasks.length}`,
    "",
    "## 2. 今日最重要 5 件事",
    ...linesOrFallback(
      brief.recommended_actions.slice(0, 5).map((action, index) =>
        `${index + 1}. [${action.priority}] ${action.action}。依据：${action.reason}。人工审批：需要。`
      ),
      "- 暂无可排序行动；请先刷新采集并补录自营 SKU 指标。"
    ),
    "",
    "## 3. 竞品重大异动",
    ...linesOrFallback(
      [
        ...competitorDetailEvents.map(formatCompetitorDetailEvent),
        ...competitorChanges.map(formatCompetitorChange)
      ].slice(0, 8),
      "- 暂无竞品价格、促销、评分或 Listing 异动。"
    ),
    "",
    "## 4. BSR 榜单变化",
    ...linesOrFallback(evidence.bsrChanges.slice(0, 8).map(formatBsrChange), "- 暂无可比较的 BSR 变化；请检查类目采集新鲜度。"),
    "",
    "## 5. 关键词排名变化",
    ...linesOrFallback([
      ...keywordRuleEvents.map(formatKeywordRuleEvent),
      ...keywordChanges.map(formatKeywordChange)
    ].slice(0, 8), "- 暂无关键词排名异动。"),
    "",
    "## 6. 广告异常",
    `- 花费：${formatNumber(evidence.ads.totalSpend, 2)}，广告销售额：${formatNumber(evidence.ads.totalSales, 2)}，平均 ACOS：${formatPercent(evidence.ads.averageAcos)}`,
    ...linesOrFallback(
      adIssues.slice(0, 8).map(({ item, insight }) =>
        `- [${insight.priority}] ${item.productSku ?? item.metric.campaignName}：${insight.message}。建议：${insight.suggestion}`
      ),
      "- 暂无广告异常；如未接入广告数据，请在数据源中心完成导入。"
    ),
    "",
    "## 7. 库存风险",
    ...linesOrFallback(
      inventoryIssues.slice(0, 8).map(({ plan, issue }) =>
        `- [${issue.priority}] ${plan.sku}：${issue.message}。建议：${issue.suggestion}`
      ),
      "- 暂无库存风险；如无库存指标，请先补录或同步库存数据。"
    ),
    "",
    "## 8. 待处理任务",
    ...linesOrFallback(evidence.openTasks.slice(0, 10).map(formatTask), "- 当前没有开放任务。"),
    "",
    "## 9. AI 总结与建议",
    `- 总结：${brief.summary}`,
    `- 影响：${brief.impact}`,
    `- 置信度：${Math.round(brief.confidence * 100)}%`,
    ...brief.evidence.slice(0, 6).map((item) => `- 证据：${item}`),
    "",
    "## 数据覆盖",
    ...formatCoverage(evidence.coverage),
    ...appendSourceReport("关键词采集报告", evidence.keywordReport),
    ...appendSourceReport("类目采集报告", evidence.categoryReport)
  ].join("\n");
}

function countSignals(evidence: DailyWorkflowEvidence): number {
  return evidence.events.length
    + evidence.changes.length
    + evidence.bsrChanges.length
    + evidence.ads.items.reduce((sum, item) => sum + item.insights.length, 0)
    + evidence.inventoryPlans.reduce((sum, plan) => sum + plan.issues.length, 0);
}

function countRisks(evidence: DailyWorkflowEvidence): number {
  return evidence.events.filter((event) => event.eventLevel === "P0").length
    + evidence.products.filter((product) => product.riskScore.level === "high").length
    + evidence.ads.riskCount
    + evidence.inventoryPlans.filter((plan) => plan.level === "critical").length;
}

export function resolveDailyReportCoverageStatus(coverage: DailyReportCoverage): DailyReportCoverageStatus {
  const coreFeeds = [
    coverage.ownSkuMetrics,
    coverage.keywordSnapshots,
    coverage.categorySnapshots,
    coverage.adsMetrics,
    coverage.inventoryPlans
  ];
  if (coreFeeds.every((value) => value === 0) && coverage.insightEvents === 0 && coverage.openTasks === 0) return "empty";
  return coreFeeds.every((value) => value > 0) ? "complete" : "partial";
}

function formatCompetitorChange(change: DailyChange): string {
  return `- ${change.brand ?? change.asin} ${change.asin} / ${change.keyword}：${change.changeType}，价格 ${formatNullable(change.yesterdayPrice)} -> ${formatNullable(change.todayPrice)}。`;
}

function formatCompetitorDetailEvent(event: InsightEvent): string {
  const target = [event.brand, event.asin].filter(Boolean).join(" ") || "未知竞品";
  const evidence = event.eventType === "RATING_DROP"
    ? `评分 ${formatNullable(event.evidence.ratingBefore ?? null)} -> ${formatNullable(event.evidence.ratingAfter ?? null)}`
    : formatListingChangeEvidence(event);
  return `- [${event.eventLevel}] ${target}：${insightEventTypeLabels[event.eventType]}，${evidence}。建议：${event.suggestedAction}`;
}

function formatListingChangeEvidence(event: InsightEvent): string {
  const fieldLabels = event.evidence.listingChangedFields?.map((field) => field === "title" ? "标题" : "主图") ?? [];
  const changedFields = fieldLabels.length > 0 ? fieldLabels.join("、") : "Listing 内容";
  const titleChange = event.evidence.listingChangedFields?.includes("title")
    ? `；标题“${event.evidence.titleBefore ?? "-"}” -> “${event.evidence.titleAfter ?? "-"}”`
    : "";
  return `变更字段：${changedFields}${titleChange}`;
}

function formatKeywordChange(change: DailyChange): string {
  return `- ${change.keyword} / ${change.asin}：${change.changeType}，排名 ${formatNullable(change.yesterdayRank)} -> ${formatNullable(change.todayRank)}。`;
}

function formatKeywordRuleEvent(event: InsightEvent): string {
  return `- [${event.eventLevel}] ${event.evidence.keyword ?? "核心词"} / ${event.asin ?? "自营 SKU"}：排名 ${formatNullable(event.evidence.previousRank ?? null)} -> ${formatNullable(event.evidence.currentRank ?? null)}。建议：${event.suggestedAction}`;
}

function formatBsrChange(change: BsrRankChange): string {
  return `- ${change.brand ?? change.asin} ${change.asin} / ${change.category}：${change.changeType}，BSR ${formatNullable(change.previousRank)} -> ${formatNullable(change.currentRank)}。`;
}

function formatTask(task: Task): string {
  const due = task.dueDate ? `，截止 ${task.dueDate}` : "";
  return `- [${task.priority}] ${task.title}（${taskStatusLabels[task.status]}${due}）`;
}

function formatCoverage(coverage: DailyReportCoverage): string[] {
  return [
    `- 自营 SKU 指标 ${coverage.ownSkuMetrics} / 关键词快照 ${coverage.keywordSnapshots} / 类目快照 ${coverage.categorySnapshots}`,
    `- 竞品异动 ${coverage.competitorChanges} / BSR 变化 ${coverage.bsrChanges} / 洞察事件 ${coverage.insightEvents}`,
    `- 广告指标 ${coverage.adsMetrics} / 库存计划 ${coverage.inventoryPlans} / 开放任务 ${coverage.openTasks}`
  ];
}

function hasOperationalEvidence(product: OwnedProductListItem): boolean {
  return product.latestMetric !== null
    || product.spApiEvidence.sales !== null
    || product.spApiEvidence.inventory !== null;
}

function formatMarketplaceOperations(operations: DashboardOperationsSummary): string {
  const values = operations.marketplaces
    .filter((marketplace) => marketplace.salesAmount !== null || marketplace.orders !== null)
    .map((marketplace) => `${marketplace.marketplace}${marketplace.currency ? `（${marketplace.currency}）` : ""}：订单 ${formatNumber(marketplace.orders ?? 0)}，销售额 ${formatNumber(marketplace.salesAmount ?? 0, 2)}`);
  return values.length > 0 ? values.join("；") : "暂无销售事实";
}

function appendSourceReport(title: string, markdown: string): string[] {
  return markdown.trim() ? ["", `## 附录：${title}`, "", markdown.trim()] : [];
}

function linesOrFallback(lines: string[], fallback: string): string[] {
  return lines.length > 0 ? lines : [fallback];
}

function formatNullable(value: number | null): string {
  return value === null ? "-" : formatNumber(value, 2);
}

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits }).format(value);
}

function formatPercent(value: number | null): string {
  return value === null ? "-" : `${formatNumber(value, 1)}%`;
}

function compareTasks(left: Task, right: Task): number {
  const priorityOrder: Record<Task["priority"], number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return priorityOrder[left.priority] - priorityOrder[right.priority]
    || (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31")
    || right.createdAt.localeCompare(left.createdAt);
}
