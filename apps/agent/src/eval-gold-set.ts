import type {
  AgentRunOutput,
  AgentToolName,
} from "@amazon-monitor/shared";

export interface AgentGoldTask {
  id: string;
  prompt: string;
  expectedTools: AgentToolName[];
  stalePolicy: "recollect_only";
}

const freshness: AgentToolName = "check_data_freshness";

export const agentGoldTasks: AgentGoldTask[] = [
  task("breakout-01", "最近 7 天哪些新品进入类目 Top50？", ["find_new_product_breakouts", "get_category_snapshot"]),
  task("breakout-02", "找出过去 30 天首次进入 Top100 且仍在上升的 ASIN", ["find_new_product_breakouts", "get_asin_history"]),
  task("breakout-03", "比较本周和上周的新品突围名单", ["find_new_product_breakouts", "get_category_snapshot"]),
  task("asin-01", "调查 B000TEST01 最近 30 天的竞争态势", ["get_asin_history", "get_keyword_ranking", "get_price_history", "get_promotion_timeline", "get_review_growth"]),
  task("asin-02", "B000TEST02 的 BSR 下滑是否与价格变化有关？", ["get_asin_history", "get_price_history"]),
  task("asin-03", "B000TEST03 的 Coupon、评论和关键词排名是否同步改善？", ["get_promotion_timeline", "get_review_growth", "get_keyword_ranking"]),
  task("asin-04", "对比 B000TEST04 与 B000TEST05 的近 14 天表现", ["compare_asins", "get_asin_history"]),
  task("asin-05", "列出 B000TEST06 的可验证结论及每条证据", ["get_asin_history", "get_listing_change"]),
  task("price-01", "哪些监控商品在过去 7 天触达阶段低价？", ["find_price_low", "get_price_history"]),
  task("price-02", "B000TEST07 的降价是否伴随 Coupon？", ["get_price_history", "get_promotion_timeline"]),
  task("price-03", "比较三个 ASIN 的价格位置和波动", ["compare_asins", "get_price_history"]),
  task("price-04", "价格数据过期时给出安全的下一步", ["get_price_history"]),
  task("keyword-01", "关键词 1 下 B000TEST08 的排名趋势", ["get_keyword_ranking", "get_asin_history"]),
  task("keyword-02", "关键词 2 最近 14 天有哪些排名异常？", ["get_keyword_ranking", "find_rank_anomalies"]),
  task("keyword-03", "哪些竞品连续进入关键词 Top10？", ["get_keyword_ranking", "compare_asins"]),
  task("keyword-04", "排名快照缺失时不要给确定性结论", ["get_keyword_ranking"]),
  task("brand-01", "本月哪些品牌份额增长最快？", ["find_brand_share_changes", "compare_brand_matrix"]),
  task("brand-02", "比较 Alpha 与 Beta 品牌矩阵", ["compare_brand_matrix", "get_category_snapshot"]),
  task("brand-03", "品牌份额变化是否来自新品？", ["find_brand_share_changes", "find_new_product_breakouts"]),
  task("brand-04", "类目 1 的品牌集中度是否上升？", ["compare_brand_matrix", "get_category_snapshot"]),
  task("review-01", "最近 30 天评论增长异常的商品有哪些？", ["find_review_anomalies", "get_review_growth"]),
  task("review-02", "B000TEST09 评论增速与排名是否相关？", ["get_review_growth", "get_asin_history"]),
  task("review-03", "评论数据缺失时只提出补采方案", ["get_review_growth"]),
  task("listing-01", "B000TEST10 最近发生了哪些 Listing 变化？", ["get_listing_change", "get_asin_history"]),
  task("listing-02", "Listing 改动后关键词排名是否改善？", ["get_listing_change", "get_keyword_ranking"]),
  task("anomaly-01", "今天类目中最值得关注的排名异常是什么？", ["find_rank_anomalies", "get_category_snapshot"]),
  task("anomaly-02", "价格低点与评论异常是否同时发生？", ["find_price_low", "find_review_anomalies"]),
  task("anomaly-03", "找出需要人工复核的高优异常并说明证据", ["find_rank_anomalies", "get_asin_history"]),
  task("patrol-01", "执行每日巡检并生成待审批行动", ["get_category_snapshot", "find_rank_anomalies", "find_new_product_breakouts"]),
  task("patrol-02", "巡检失败后恢复并仅报告成功取回的证据", ["get_category_snapshot", "get_keyword_ranking"]),
];

export interface AgentGoldResult {
  evidenceSupported: boolean;
  unsupportedDeterministic: boolean;
  alertValid: boolean | null;
  toolCalls: Array<{ success: boolean }>;
  recoverySucceeded: boolean | null;
}

export interface AgentGoldMetrics {
  dataSupportRate: number;
  unsupportedConclusionRate: number;
  highPriorityAlertValidityRate: number;
  toolSuccessRate: number;
  taskRecoveryRate: number;
}

export interface AgentGoldExecution {
  output: AgentRunOutput;
  toolCalls: Array<{
    toolName: AgentToolName;
    status: "completed" | "failed";
  }>;
  alertValid?: boolean | null;
  recoverySucceeded?: boolean | null;
}

export interface AgentGoldTaskEvaluation {
  task: AgentGoldTask;
  result: AgentGoldResult;
  missingTools: AgentToolName[];
}

export interface AgentGoldEvaluation {
  tasks: AgentGoldTaskEvaluation[];
  metrics: AgentGoldMetrics;
}

export const agentGoldTargets: AgentGoldMetrics = {
  dataSupportRate: 0.95,
  unsupportedConclusionRate: 0.02,
  highPriorityAlertValidityRate: 0.70,
  toolSuccessRate: 0.95,
  taskRecoveryRate: 0.90,
};

export function measureAgentGoldResults(results: AgentGoldResult[]): AgentGoldMetrics {
  const toolCalls = results.flatMap((result) => result.toolCalls);
  const alertResults = results.flatMap((result) =>
    result.alertValid === null ? [] : [result.alertValid]);
  const recoveryResults = results.flatMap((result) =>
    result.recoverySucceeded === null ? [] : [result.recoverySucceeded]);
  return {
    dataSupportRate: rate(results.map((result) => result.evidenceSupported)),
    unsupportedConclusionRate: rate(
      results.map((result) => result.unsupportedDeterministic),
    ),
    highPriorityAlertValidityRate: rate(alertResults),
    toolSuccessRate: rate(toolCalls.map((call) => call.success)),
    taskRecoveryRate: rate(recoveryResults),
  };
}

export async function runAgentGoldEvaluation(
  execute: (task: AgentGoldTask) => Promise<AgentGoldExecution>,
  tasks: AgentGoldTask[] = agentGoldTasks,
): Promise<AgentGoldEvaluation> {
  const evaluations: AgentGoldTaskEvaluation[] = [];
  for (const taskItem of tasks) {
    const execution = await execute(taskItem);
    evaluations.push(evaluateAgentGoldExecution(taskItem, execution));
  }
  return {
    tasks: evaluations,
    metrics: measureAgentGoldResults(
      evaluations.map((evaluation) => evaluation.result),
    ),
  };
}

export function evaluateAgentGoldExecution(
  taskItem: AgentGoldTask,
  execution: AgentGoldExecution,
): AgentGoldTaskEvaluation {
  const completedTools = new Set(
    execution.toolCalls
      .filter((call) => call.status === "completed")
      .map((call) => call.toolName),
  );
  const missingTools = taskItem.expectedTools.filter(
    (toolName) => !completedTools.has(toolName),
  );
  const conclusionsSupported = execution.output.conclusions.length > 0
    && execution.output.conclusions.every(
      (conclusion) =>
        conclusion.evidenceRefs.length > 0
        && conclusion.snapshotRefs.length > 0,
    );
  const freshnessUnsafe = execution.output.freshness.status !== "fresh";
  const unsupportedDeterministic = freshnessUnsafe && (
    execution.output.conclusions.some((conclusion) => conclusion.confidence > 0.49)
    || execution.output.recommendedActions.some(
      (action) => action.type !== "recollect",
    )
  );
  return {
    task: taskItem,
    missingTools,
    result: {
      evidenceSupported: conclusionsSupported && missingTools.length === 0,
      unsupportedDeterministic,
      alertValid: execution.alertValid ?? null,
      toolCalls: execution.toolCalls.map((call) => ({
        success: call.status === "completed",
      })),
      recoverySucceeded: execution.recoverySucceeded ?? null,
    },
  };
}

function task(
  id: string,
  prompt: string,
  tools: AgentToolName[],
): AgentGoldTask {
  return {
    id,
    prompt,
    expectedTools: [freshness, ...tools],
    stalePolicy: "recollect_only",
  };
}

function rate(values: boolean[]): number {
  if (values.length === 0) return 0;
  return values.filter(Boolean).length / values.length;
}
