import type { AlertRule, AlertRuleRunResult, InsightEvent } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import {
  emitRuleEvent,
  matchesRule,
  type RuleRunInput
} from "./rule-runtime-utils.js";

const AMAZON_FIRST_PAGE_MAX_RANK = 48;

export function evaluateKeywordRule(
  store: Store,
  rule: AlertRule,
  input: RuleRunInput,
  events: InsightEvent[],
  skipped: AlertRuleRunResult["skipped"]
): void {
  const matrix = store.getKeywordRankMatrix(input.orgId, input.date);
  const products = store.listProducts({ orgId: input.orgId, status: "active", limit: 1000 });
  for (const row of matrix.rows.filter((item) => item.priority === "S")) {
    for (const product of products.filter((item) => item.marketplace === row.marketplace)) {
      const entityKey = `keyword:${row.keywordId}:product:${product.id}`;
      const cell = row.cells.find((item) => item.productKey === `${product.marketplace}:${product.asin}`);
      if (cell?.currentOrganicRank === null || cell?.currentOrganicRank === undefined
        || cell.previousOrganicRank === null) {
        skipped.push({ ruleId: rule.ruleId, entityKey, reason: "missing_evidence" });
        continue;
      }
      const rankDrop = cell.currentOrganicRank - cell.previousOrganicRank;
      const pageDrop = cell.previousOrganicRank <= AMAZON_FIRST_PAGE_MAX_RANK
        && cell.currentOrganicRank > AMAZON_FIRST_PAGE_MAX_RANK;
      if (!matchesRule(rule, {
        keyword_priority: row.priority,
        organic_rank_drop: rankDrop,
        page_drop: pageDrop
      })) continue;
      emitRuleEvent(store, rule, input, entityKey, {
        eventType: "KEYWORD_PAGE_DROP",
        asin: product.asin,
        brand: product.brand,
        keywordId: row.keywordId,
        title: `${row.keyword} 核心词掉出首页`,
        summary: `${product.sku} 的自然排名由 ${cell.previousOrganicRank} 降至 ${cell.currentOrganicRank}，已离开首页。`,
        evidence: {
          marketplace: product.marketplace,
          productId: product.id,
          sku: product.sku,
          keyword: row.keyword,
          keywordPriority: row.priority,
          currentMetricDate: matrix.date,
          previousMetricDate: matrix.previousDate,
          currentRank: cell.currentOrganicRank,
          previousRank: cell.previousOrganicRank,
          rankChange: -rankDrop,
          evidenceItems: [
            `关键词优先级 ${row.priority}`,
            `自然排名 ${cell.previousOrganicRank} -> ${cell.currentOrganicRank}`,
            `首页边界 ${AMAZON_FIRST_PAGE_MAX_RANK}`
          ]
        }
      }, events, skipped);
    }
  }
}

export function evaluateRatingRule(
  store: Store,
  rule: AlertRule,
  input: RuleRunInput,
  events: InsightEvent[],
  skipped: AlertRuleRunResult["skipped"]
): void {
  const products = new Map(
    store.listProducts({ orgId: input.orgId, status: "active", limit: 1000 })
      .map((product) => [product.id, product])
  );
  const grouped = new Map<number, ReturnType<Store["listOrganizationProductDailyMetrics"]>>();
  for (const metric of store.listOrganizationProductDailyMetrics(input.orgId, {
    endDate: input.date,
    limit: 1000
  })) {
    if (metric.rating === null) continue;
    const current = grouped.get(metric.productId) ?? [];
    if (current.length < 2) current.push(metric);
    grouped.set(metric.productId, current);
  }

  for (const product of products.values()) {
    const entityKey = `product:${product.id}`;
    const [current, previous] = grouped.get(product.id) ?? [];
    if (!current || !previous || current.rating === null || previous.rating === null) {
      skipped.push({ ruleId: rule.ruleId, entityKey, reason: "missing_evidence" });
      continue;
    }
    const ratingDrop = previous.rating - current.rating;
    if (!matchesRule(rule, { rating_drop: ratingDrop })) continue;
    emitRuleEvent(store, rule, input, entityKey, {
      eventType: "OWNED_RATING_DROP",
      asin: product.asin,
      brand: product.brand,
      title: `${product.sku} 评分下降`,
      summary: `评分由 ${previous.rating.toFixed(1)} 降至 ${current.rating.toFixed(1)}，下降 ${ratingDrop.toFixed(1)}。`,
      evidence: {
        marketplace: product.marketplace,
        productId: product.id,
        sku: product.sku,
        currentMetricDate: current.date,
        previousMetricDate: previous.date,
        ratingBefore: previous.rating,
        ratingAfter: current.rating,
        ratingChange: current.rating - previous.rating,
        evidenceItems: [
          `评分 ${previous.rating.toFixed(1)} -> ${current.rating.toFixed(1)}`,
          `证据日期 ${previous.date} -> ${current.date}`
        ]
      }
    }, events, skipped);
  }
}
