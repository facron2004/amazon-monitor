import type {
  AlertRule,
  AlertRuleRunResult,
  InsightEvent
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import {
  addDays,
  emitRuleEvent,
  formatNumber,
  formatPercent,
  matchesRule,
  type RuleRunInput
} from "./rule-runtime-utils.js";
import {
  evaluateKeywordRule,
  evaluateRatingRule
} from "./rule-runtime-owned-evaluators.js";

const TARGET_ACOS = 0.3;
const supportedRuleIds = [
  "core_keyword_page_drop_001",
  "inventory_low_stock_001",
  "ads_acos_over_target_001",
  "rating_drop_001",
  "negative_review_cluster_001",
  "listing_health_low_001"
] as const;

export function runOperationalAlertRules(
  store: Store,
  input: { orgId: number; date: string; ruleIds?: string[] }
): AlertRuleRunResult {
  const requested = input.ruleIds ? new Set(input.ruleIds) : null;
  const rules = supportedRuleIds
    .filter((ruleId) => !requested || requested.has(ruleId))
    .map((ruleId) => store.getAlertRule(input.orgId, ruleId))
    .filter((rule): rule is AlertRule => Boolean(rule?.config.enabled));
  const events: InsightEvent[] = [];
  const skipped: AlertRuleRunResult["skipped"] = [];

  for (const rule of rules) {
    if (rule.ruleId === "core_keyword_page_drop_001") {
      evaluateKeywordRule(store, rule, input, events, skipped);
    } else if (rule.ruleId === "inventory_low_stock_001") {
      evaluateInventoryRule(store, rule, input, events, skipped);
    } else if (rule.ruleId === "ads_acos_over_target_001") {
      evaluateAdsRule(store, rule, input, events, skipped);
    } else if (rule.ruleId === "rating_drop_001") {
      evaluateRatingRule(store, rule, input, events, skipped);
    } else if (rule.ruleId === "negative_review_cluster_001") {
      evaluateReviewRule(store, rule, input, events, skipped);
    } else if (rule.ruleId === "listing_health_low_001") {
      evaluateListingRule(store, rule, input, events, skipped);
    }
  }

  return {
    orgId: input.orgId,
    date: input.date,
    evaluatedRuleCount: rules.length,
    triggeredCount: events.length,
    events,
    skipped
  };
}

function evaluateInventoryRule(
  store: Store,
  rule: AlertRule,
  input: { orgId: number; date: string },
  events: InsightEvent[],
  skipped: AlertRuleRunResult["skipped"]
): void {
  for (const plan of store.listInventoryPlans({ orgId: input.orgId, date: input.date, limit: 1000 })) {
    const entityKey = `product:${plan.productId}`;
    if (plan.inventoryDays === null) {
      skipped.push({ ruleId: rule.ruleId, entityKey, reason: "missing_evidence" });
      continue;
    }
    if (!matchesRule(rule, { inventory_days: plan.inventoryDays })) continue;
    emitRuleEvent(store, rule, input, entityKey, {
      eventType: "INVENTORY_STOCKOUT_RISK",
      asin: plan.asin,
      brand: plan.brand,
      title: `${plan.sku} 库存进入风险窗口`,
      summary: `可售库存 ${formatNumber(plan.inventoryAvailable)}，预计可售 ${formatNumber(plan.inventoryDays)} 天。`,
      evidence: {
        marketplace: plan.marketplace,
        productId: plan.productId,
        sku: plan.sku,
        inventoryAvailable: plan.inventoryAvailable,
        inventoryDays: plan.inventoryDays,
        dailySalesVelocity: plan.dailySalesVelocity,
        evidenceItems: plan.issues.flatMap((issue) => issue.evidence)
      }
    }, events, skipped);
  }
}

function evaluateAdsRule(
  store: Store,
  rule: AlertRule,
  input: { orgId: number; date: string },
  events: InsightEvent[],
  skipped: AlertRuleRunResult["skipped"]
): void {
  const summary = store.getAdsWorkflowSummary({ orgId: input.orgId, date: input.date, limit: 1000 });
  for (const item of summary.items) {
    const entityKey = `campaign:${encodeURIComponent(item.metric.campaignId)}`;
    if (item.metric.acos === null) {
      skipped.push({ ruleId: rule.ruleId, entityKey, reason: "missing_evidence" });
      continue;
    }
    const overTargetPct = ((item.metric.acos - TARGET_ACOS) / TARGET_ACOS) * 100;
    if (!matchesRule(rule, { acos_over_target_pct: overTargetPct })) continue;
    emitRuleEvent(store, rule, input, entityKey, {
      eventType: "ADS_ACOS_SPIKE",
      asin: item.productAsin,
      brand: null,
      title: `${item.metric.campaignName} ACOS 超过目标`,
      summary: `当前 ACOS ${formatPercent(item.metric.acos)}，较 ${formatPercent(TARGET_ACOS)} 目标高 ${overTargetPct.toFixed(1)}%。`,
      evidence: {
        marketplace: item.metric.productId ? store.getProduct(item.metric.productId)?.marketplace ?? "unknown" : "unassigned",
        productId: item.metric.productId,
        sku: item.productSku,
        campaignId: item.metric.campaignId,
        campaignName: item.metric.campaignName,
        acos: item.metric.acos,
        targetAcos: TARGET_ACOS,
        acosOverTargetPct: overTargetPct,
        evidenceItems: item.insights.flatMap((insight) => insight.evidence)
      }
    }, events, skipped);
  }
}

function evaluateReviewRule(
  store: Store,
  rule: AlertRule,
  input: { orgId: number; date: string },
  events: InsightEvent[],
  skipped: AlertRuleRunResult["skipped"]
): void {
  const startDate = addDays(input.date, -6);
  for (const summary of store.listReviewVocSummaries({
    orgId: input.orgId,
    startDate,
    endDate: input.date,
    limit: 1000
  })) {
    const entityKey = `product:${summary.productId}`;
    const topTopic = summary.topTopics.find((topic) => topic.negativeCount > 0) ?? null;
    const topicShare = topTopic && summary.negativeCount > 0
      ? (topTopic.negativeCount / summary.negativeCount) * 100
      : null;
    if (topicShare === null) {
      skipped.push({ ruleId: rule.ruleId, entityKey, reason: "missing_evidence" });
      continue;
    }
    if (!matchesRule(rule, {
      negative_review_count_7d: summary.negativeCount,
      top_negative_topic_share: topicShare
    })) continue;
    emitRuleEvent(store, rule, input, entityKey, {
      eventType: "REVIEW_NEGATIVE_CLUSTER",
      asin: summary.asin,
      brand: summary.brand,
      title: `${summary.sku} 出现集中差评主题`,
      summary: `近 7 天 ${summary.negativeCount} 条负面 Review，主题“${topTopic?.topic ?? "unknown"}”占 ${topicShare.toFixed(1)}%。`,
      evidence: {
        marketplace: summary.marketplace,
        productId: summary.productId,
        sku: summary.sku,
        negativeReviewCount: summary.negativeCount,
        topNegativeTopic: topTopic?.topic ?? null,
        topNegativeTopicShare: topicShare,
        evidenceItems: summary.issues.flatMap((issue) => issue.evidence)
      }
    }, events, skipped);
  }
}

function evaluateListingRule(
  store: Store,
  rule: AlertRule,
  input: { orgId: number; date: string },
  events: InsightEvent[],
  skipped: AlertRuleRunResult["skipped"]
): void {
  for (const item of store.listProductListingHealth({
    orgId: input.orgId,
    date: input.date,
    limit: 1000
  })) {
    const entityKey = `product:${item.productId}`;
    if (item.snapshotId === null) {
      skipped.push({ ruleId: rule.ruleId, entityKey, reason: "missing_evidence" });
      continue;
    }
    if (!matchesRule(rule, { listing_health_score: item.health.score })) continue;
    emitRuleEvent(store, rule, input, entityKey, {
      eventType: "LISTING_HEALTH_LOW",
      asin: item.asin,
      brand: item.brand,
      title: `${item.sku} Listing 健康分过低`,
      summary: `Listing 健康分 ${item.health.score}，存在 ${item.health.issues.filter((issue) => issue.level !== "pass").length} 项待改进证据。`,
      evidence: {
        marketplace: item.marketplace,
        productId: item.productId,
        sku: item.sku,
        listingHealthScore: item.health.score,
        evidenceItems: item.health.issues
          .filter((issue) => issue.level !== "pass")
          .map((issue) => `${issue.label}: ${issue.message}`)
      }
    }, events, skipped);
  }
}
