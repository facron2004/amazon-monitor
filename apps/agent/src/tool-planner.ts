import type { AgentFreshness, AgentTaskType, AgentToolEnvelope, AgentToolName } from "@amazon-monitor/shared";

export interface PlannedAgentToolCall {
  toolName: AgentToolName;
  input: Record<string, unknown>;
}

export interface PlannedAgentEvidence {
  toolName: AgentToolName;
  envelope: AgentToolEnvelope;
}

/**
 * Build a small, deterministic read-only evidence plan from the user's intent.
 * The plan supplies the minimum evidence set and bounds the tools exposed to
 * the model for common Amazon operations questions.
 */
export function planAgentToolCalls(
  input: string,
  taskType: AgentTaskType,
  freshnessInput: Record<string, unknown>,
): PlannedAgentToolCall[] {
  const taskText = input.split(/评估范围[:：]|类目\s*ID|关键词\s*ID|候选\s*ASIN|站点/iu, 1)[0] ?? input;
  const explicitAsins = [...new Set(
    [...taskText.matchAll(/\b[A-Z0-9]{10}\b/g)].map(([value]) => value),
  )];
  const allAsins = [...new Set(
    [...input.matchAll(/\b[A-Z0-9]{10}\b/g)].map(([value]) => value),
  )];
  const fallbackAsin = typeof freshnessInput.asin === "string"
    && /^[A-Z0-9]{10}$/.test(freshnessInput.asin)
    ? freshnessInput.asin
    : explicitAsins[0] ?? allAsins[0];
  const categoryId = positiveNumber(freshnessInput.categoryId);
  const keywordId = positiveNumber(freshnessInput.keywordId);
  const marketplace = optionalString(freshnessInput.marketplace);
  const planned: PlannedAgentToolCall[] = [];
  const seen = new Set<AgentToolName>();

  const add = (toolName: AgentToolName, toolInput: Record<string, unknown>): void => {
    if (seen.has(toolName)) return;
    seen.add(toolName);
    planned.push({ toolName, input: toolInput });
  };
  const categoryScope = categoryId === undefined
    ? null
    : withMarketplace({ categoryId }, marketplace);
  const keywordScope = keywordId === undefined
    ? null
    : withMarketplace({ keywordId }, marketplace);
  const asinScope = fallbackAsin === undefined
    ? null
    : withMarketplace({ asin: fallbackAsin, categoryId }, marketplace);

  const isPatrol = taskType === "patrol" || /巡检|patrol|daily check|每日检查/iu.test(taskText);
  const isNewProduct = /新品|突围|breakout|首次进入|top\s*50|top\s*100/iu.test(taskText);
  const isKeyword = /关键词|排名|top\s*10|serp|rank/iu.test(taskText);
  const isPrice = /价格|低价|降价|波动|price/iu.test(taskText);
  const isPromotion = /coupon|优惠券?|促销|deal|promotion/iu.test(taskText);
  const isReview = /评论|review/iu.test(taskText);
  const isListing = /listing|改动|标题|图片|内容/iu.test(taskText);
  const isBrand = /品牌|份额|集中度|brand/iu.test(taskText);
  const isComparison = /比较|对比|compare|三个|两款|matrix|集中度|哪些竞品.*连续|竞品.*排名/iu.test(taskText)
    || explicitAsins.length >= 2;
  const isRankAnomaly = /排名异常|bsr.*异常|rank.*anomal|高优异常/iu.test(taskText);
  const isReviewAnomaly = /评论.*异常|review.*anomal/iu.test(taskText);
  const isPriceLow = /低价|阶段低价|price\s*low|价格低点/iu.test(taskText);
  const isAsinInvestigation = /调查|竞争态势|可验证结论|证据|bsr|竞争/iu.test(taskText);
  const isTrend = /趋势|增速|是否相关|是否改善|上升|下滑/iu.test(taskText);

  if (isPatrol) {
    if (categoryScope) add("get_category_snapshot", categoryScope);
    if (keywordScope) add("get_keyword_ranking", withMarketplace({ keywordId }, marketplace));
    if (categoryScope) add("find_rank_anomalies", categoryScope);
    if (categoryScope) add("find_new_product_breakouts", categoryScope);
  }
  if (isNewProduct && categoryScope) {
    add("find_new_product_breakouts", categoryScope);
    if (/本周|上周|top\s*50/iu.test(taskText)) add("get_category_snapshot", categoryScope);
    if (/首次|上升|top\s*100/iu.test(taskText) && asinScope) add("get_asin_history", asinScope);
  }
  if (isAsinInvestigation && asinScope) {
    add("get_asin_history", asinScope);
    if (/竞争态势/iu.test(taskText)) {
      if (keywordScope) add("get_keyword_ranking", withMarketplace({ keywordId, asin: fallbackAsin }, marketplace));
      if (asinScope) add("get_price_history", asinScope);
      if (asinScope) add("get_promotion_timeline", asinScope);
      if (asinScope) add("get_review_growth", asinScope);
    }
    if (/可验证|证据/iu.test(taskText) && asinScope) add("get_listing_change", asinScope);
  }
  if (isComparison && allAsins.length >= 2) {
    const comparisonAsins = explicitAsins.length >= 2 ? explicitAsins : allAsins;
    if (comparisonAsins.length >= 2) {
      add("compare_asins", withMarketplace({ asins: comparisonAsins }, marketplace));
    }
    if (asinScope) add("get_asin_history", asinScope);
  }
  if (isKeyword && keywordScope) add(
    "get_keyword_ranking",
    withMarketplace({ keywordId, asin: fallbackAsin }, marketplace),
  );
  if (isKeyword && isTrend && asinScope) add("get_asin_history", asinScope);
  if (isPrice && asinScope) add("get_price_history", asinScope);
  if (isPromotion && asinScope) add("get_promotion_timeline", asinScope);
  if (isReview && asinScope) add("get_review_growth", asinScope);
  if (isListing && asinScope) {
    add("get_listing_change", asinScope);
    if (isTrend || taskType === "investigation") add("get_asin_history", asinScope);
  }
  if (isBrand && categoryScope) {
    add("compare_brand_matrix", categoryScope);
    if (/份额|增长|变化/iu.test(taskText)) add("find_brand_share_changes", categoryScope);
    if (/集中度|矩阵|本月|类目/iu.test(taskText)) add("get_category_snapshot", categoryScope);
  }
  if (isRankAnomaly && categoryScope) {
    add("find_rank_anomalies", categoryScope);
    if (/类目|今天/iu.test(taskText)) add("get_category_snapshot", categoryScope);
    if (asinScope && taskType === "investigation") add("get_asin_history", asinScope);
  }
  if (isReviewAnomaly && categoryScope) add("find_review_anomalies", categoryScope);
  if (isPriceLow && asinScope) add("find_price_low", asinScope);

  // A generic investigation with one ASIN still needs a bounded history read.
  if (planned.length === 0 && taskType === "investigation" && asinScope) {
    add("get_asin_history", asinScope);
  }
  return planned;
}

export function formatPlannedAgentEvidence(evidence: PlannedAgentEvidence[]): string {
  if (evidence.length === 0) return "无预取证据；按请求选择最小的专用工具集合。";
  return evidence.map(({ toolName, envelope }) => JSON.stringify({
    tool: toolName,
    data: summarizeValue(envelope.data),
    evidenceRefs: envelope.evidenceRefs.slice(0, 12),
    freshness: envelope.freshness,
    dataGaps: envelope.dataGaps,
    warnings: envelope.warnings,
  })).join("\n");
}

/** Keep the persisted envelope complete while bounding the model-facing payload. */
export function compactAgentToolEnvelope(envelope: AgentToolEnvelope): AgentToolEnvelope {
  return {
    ...envelope,
    data: summarizeValue(envelope.data),
  };
}

function withMarketplace(
  value: Record<string, unknown>,
  marketplace: string | undefined,
): Record<string, unknown> {
  return marketplace ? { ...value, marketplace } : value;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function summarizeValue(value: unknown, depth = 0): unknown {
  if (depth >= 3 || value === null || typeof value !== "object") {
    return typeof value === "string" ? value.slice(0, 500) : value;
  }
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => summarizeValue(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).slice(0, 30).map(([key, nested]) => [
      key,
      summarizeValue(nested, depth + 1),
    ]),
  );
}

export function summarizeFreshness(freshness: AgentFreshness): string {
  return JSON.stringify({
    status: freshness.status,
    oldestEvidenceAt: freshness.oldestEvidenceAt,
    staleSources: freshness.staleSources,
    dataGaps: freshness.dataGaps,
    warnings: freshness.warnings,
  });
}
