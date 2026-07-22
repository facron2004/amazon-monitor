export const alertRuleCategories = [
  "competitor",
  "bsr",
  "keyword",
  "inventory",
  "ads",
  "listing",
  "review"
] as const;

export type AlertRuleCategory = (typeof alertRuleCategories)[number];

export const alertRuleSeverities = ["low", "medium", "high", "critical"] as const;
export type AlertRuleSeverity = (typeof alertRuleSeverities)[number];

export const alertRuleOperators = ["<", "<=", ">", ">=", "==", "!="] as const;
export type AlertRuleOperator = (typeof alertRuleOperators)[number];

export type AlertRuleConditionValue = number | string | boolean;

export interface AlertRuleCondition {
  metric: string;
  operator: AlertRuleOperator;
  value: AlertRuleConditionValue;
  unit?: string | null;
}

export interface AlertRuleDefinition {
  ruleId: string;
  name: string;
  description: string;
  category: AlertRuleCategory;
  eventType: string;
  defaultSeverity: AlertRuleSeverity;
  defaultEnabled: boolean;
  conditions: AlertRuleCondition[];
  suggestion: string;
  requiresHumanApproval: boolean;
  capability: AlertRuleCapability;
  dataRequirements: string[];
  freshnessExpectation: string;
}

export type AlertRuleCapability = "live" | "data_required";

export type AlertRuleConfigSource = "default" | "customized";

export interface AlertRuleConfig {
  id: number | null;
  orgId: number;
  ruleId: string;
  enabled: boolean;
  severity: AlertRuleSeverity;
  conditions: AlertRuleCondition[];
  cooldownHours: number;
  notes: string | null;
  updatedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  source: AlertRuleConfigSource;
}

export interface AlertRule extends AlertRuleDefinition {
  config: AlertRuleConfig;
}

export interface AlertRuleListFilter {
  orgId: number;
  category?: AlertRuleCategory;
  enabled?: boolean;
  q?: string;
}

export interface UpsertAlertRuleConfigInput {
  orgId: number;
  ruleId: string;
  enabled?: boolean;
  severity?: AlertRuleSeverity;
  conditions?: AlertRuleCondition[];
  cooldownHours?: number;
  notes?: string | null;
  updatedBy?: number | null;
}

export interface AlertRuleRunSkipped {
  ruleId: string;
  entityKey: string;
  reason: "cooldown" | "missing_evidence";
}

export interface AlertRuleRunResult {
  orgId: number;
  date: string;
  evaluatedRuleCount: number;
  triggeredCount: number;
  events: import("./insight-events.js").InsightEvent[];
  skipped: AlertRuleRunSkipped[];
}

export const alertRuleCategoryLabels: Record<AlertRuleCategory, string> = {
  competitor: "竞品",
  bsr: "BSR",
  keyword: "关键词",
  inventory: "库存",
  ads: "广告",
  listing: "Listing",
  review: "Review"
};

export const alertRuleSeverityLabels: Record<AlertRuleSeverity, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "紧急"
};

export const alertRuleCapabilityLabels: Record<AlertRuleCapability, string> = {
  live: "运行中",
  data_required: "待接入数据"
};

export const alertRuleDefinitions: AlertRuleDefinition[] = [
  {
    ruleId: "competitor_price_drop_001",
    name: "竞品到手价下降",
    description: "竞品到手价跌破安全响应阈值。",
    category: "competitor",
    eventType: "competitor_price_drop",
    defaultSeverity: "critical",
    defaultEnabled: true,
    conditions: [
      { metric: "final_price_drop_pct", operator: ">=", value: 10, unit: "%" }
    ],
    suggestion: "先核对我方利润安全线，再创建 Coupon 或调价任务。",
    requiresHumanApproval: true,
    capability: "live",
    dataRequirements: ["竞品价格快照", "Coupon 折扣"],
    freshnessExpectation: "最近一次类目采集"
  },
  {
    ruleId: "competitor_deal_001",
    name: "竞品开启 Deal",
    description: "竞品新增 Deal 或 Prime 折扣，可能改变类目增长速度。",
    category: "competitor",
    eventType: "competitor_deal",
    defaultSeverity: "high",
    defaultEnabled: true,
    conditions: [
      { metric: "deal_present", operator: "==", value: true },
      { metric: "bsr_rank_improvement_pct", operator: ">=", value: 20, unit: "%" }
    ],
    suggestion: "记录促销窗口，并安排 Deal 结束后的排名复盘。",
    requiresHumanApproval: true,
    capability: "live",
    dataRequirements: ["竞品 Deal 状态", "BSR 快照"],
    freshnessExpectation: "最近一次类目采集"
  },
  {
    ruleId: "new_product_top50_001",
    name: "新品进入 Top 50",
    description: "新出现或此前未监控的 ASIN 进入类目 Top 50。",
    category: "bsr",
    eventType: "new_product_breakout",
    defaultSeverity: "high",
    defaultEnabled: true,
    conditions: [
      { metric: "first_seen_rank", operator: "<=", value: 50 },
      { metric: "review_count", operator: "<=", value: 80 }
    ],
    suggestion: "将 ASIN 加入竞品池，检查价格带、图片卖点和 Review 痛点。",
    requiresHumanApproval: true,
    capability: "live",
    dataRequirements: ["ASIN 首次发现时间", "BSR 排名"],
    freshnessExpectation: "最近一次类目采集"
  },
  {
    ruleId: "core_keyword_page_drop_001",
    name: "核心词掉出首页",
    description: "S 级核心词失去自然排名首页曝光。",
    category: "keyword",
    eventType: "keyword_rank_drop",
    defaultSeverity: "critical",
    defaultEnabled: true,
    conditions: [
      { metric: "keyword_priority", operator: "==", value: "S" },
      { metric: "organic_rank_drop", operator: ">=", value: 5 },
      { metric: "page_drop", operator: "==", value: true }
    ],
    suggestion: "先检查价格、Coupon、库存、广告预算、Review 与竞品促销，再创建排名保护任务。",
    requiresHumanApproval: true,
    capability: "live",
    dataRequirements: ["我方 ASIN 与核心词绑定", "自然排名快照"],
    freshnessExpectation: "每日关键词采集"
  },
  {
    ruleId: "inventory_low_stock_001",
    name: "我方 SKU 低于安全库存",
    description: "库存可售天数低于配置的安全库存窗口。",
    category: "inventory",
    eventType: "inventory_stockout_risk",
    defaultSeverity: "critical",
    defaultEnabled: true,
    conditions: [
      { metric: "inventory_days", operator: "<=", value: 14, unit: "days" }
    ],
    suggestion: "创建补货任务，核对供应商交期后再确认采购数量。",
    requiresHumanApproval: true,
    capability: "live",
    dataRequirements: ["库存余额", "日均销量", "补货安全线"],
    freshnessExpectation: "24 小时内"
  },
  {
    ruleId: "ads_acos_over_target_001",
    name: "ACOS 超过目标",
    description: "Campaign ACOS 超过目标值的配置比例。",
    category: "ads",
    eventType: "ads_acos_spike",
    defaultSeverity: "high",
    defaultEnabled: true,
    conditions: [
      { metric: "acos_over_target_pct", operator: ">=", value: 30, unit: "%" }
    ],
    suggestion: "复核搜索词、预算节奏和竞价变化，经人工确认后再生成优化任务。",
    requiresHumanApproval: true,
    capability: "live",
    dataRequirements: ["广告花费与销售额", "Campaign ACOS 目标"],
    freshnessExpectation: "24 小时内"
  },
  {
    ruleId: "rating_drop_001",
    name: "我方 SKU 评分下降",
    description: "我方 SKU 评分跌幅超过 Review 风险阈值。",
    category: "review",
    eventType: "owned_rating_drop",
    defaultSeverity: "high",
    defaultEnabled: true,
    conditions: [
      { metric: "rating_drop", operator: ">=", value: 0.2 }
    ],
    suggestion: "检查近期差评，证据充分时创建 VOC 跟进任务。",
    requiresHumanApproval: true,
    capability: "live",
    dataRequirements: ["我方 SKU 评分快照"],
    freshnessExpectation: "最近一次 Listing 采集"
  },
  {
    ruleId: "negative_review_cluster_001",
    name: "集中差评主题",
    description: "近期 Review 出现集中的负面主题。",
    category: "review",
    eventType: "review_negative_cluster",
    defaultSeverity: "high",
    defaultEnabled: true,
    conditions: [
      { metric: "negative_review_count_7d", operator: ">=", value: 3 },
      { metric: "top_negative_topic_share", operator: ">=", value: 40, unit: "%" }
    ],
    suggestion: "汇总 VOC 证据，将改进项分派给 Listing、客服或供应商跟进。",
    requiresHumanApproval: true,
    capability: "live",
    dataRequirements: ["Review 明细", "VOC 主题聚类"],
    freshnessExpectation: "24 小时内"
  },
  {
    ruleId: "competitor_bsr_surge_001",
    name: "竞品 BSR 快速提升",
    description: "竞品 BSR 在 7 日内快速提升，可能正在获得流量或促销推动。",
    category: "bsr",
    eventType: "competitor_bsr_surge",
    defaultSeverity: "high",
    defaultEnabled: true,
    conditions: [
      { metric: "bsr_rank_improvement_pct_7d", operator: ">=", value: 30, unit: "%" }
    ],
    suggestion: "对比 Deal、Coupon、Review 增长和价格变化，再分派竞品响应任务。",
    requiresHumanApproval: true,
    capability: "live",
    dataRequirements: ["竞品 BSR 7 日快照"],
    freshnessExpectation: "最近一次类目采集"
  },
  {
    ruleId: "listing_health_low_001",
    name: "Listing 健康分过低",
    description: "我方 SKU Listing 健康分低于巡检阈值。",
    category: "listing",
    eventType: "listing_health_low",
    defaultSeverity: "high",
    defaultEnabled: true,
    conditions: [
      { metric: "listing_health_score", operator: "<", value: 70 }
    ],
    suggestion: "检查标题、图片、五点、Q&A 和 Review VOC，再创建改版任务。",
    requiresHumanApproval: true,
    capability: "live",
    dataRequirements: ["我方 Listing 健康评分"],
    freshnessExpectation: "最近一次 Listing 巡检"
  }
];
