import type {
  AgentRun,
  AgentRunStatus,
  AgentToolName,
  CategoryMonitor,
  CompetitorPoolItem,
  KeywordMonitor,
} from "@amazon-monitor/shared";
import { z } from "zod";
import {
  AgentEvaluationClient,
  type FetchLike,
} from "./eval-gold-http-client.js";
import {
  agentGoldTargets,
  agentGoldTasks,
  runAgentGoldEvaluation,
  type AgentGoldEvaluation,
  type AgentGoldTask,
} from "./eval-gold-set.js";

const datasetsByTool: Partial<Record<AgentToolName, AgentGoldDataset[]>> = {
  get_category_snapshot: ["category"],
  get_keyword_ranking: ["keyword"],
  get_asin_history: ["category", "keyword"],
  compare_asins: ["category", "keyword"],
  compare_brand_matrix: ["category"],
  get_price_history: ["price"],
  get_promotion_timeline: ["promotion"],
  get_review_growth: ["review"],
  get_listing_change: ["listing"],
  find_rank_anomalies: ["category", "keyword"],
  find_new_product_breakouts: ["category"],
  find_price_low: ["price"],
  find_review_anomalies: ["review"],
  find_brand_share_changes: ["category"],
};

type AgentGoldDataset =
  | "category"
  | "keyword"
  | "price"
  | "promotion"
  | "review"
  | "listing";

export const agentGoldLiveScopeSchema = z.object({
  categoryId: z.number().int().positive(),
  keywordId: z.number().int().positive(),
  marketplace: z.string().trim().min(3).max(100),
  asins: z.array(z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/))
    .min(10),
  brands: z.tuple([
    z.string().trim().min(1).max(200),
    z.string().trim().min(1).max(200),
  ]),
  maxAgeHours: z.number().int().min(1).max(168).default(24),
  annotations: z.record(z.string(), z.object({
    alertValid: z.boolean().nullable().optional(),
    recoverySucceeded: z.boolean().nullable().optional(),
  }).strict()).default({}),
}).strict();

export type AgentGoldLiveScope = z.infer<typeof agentGoldLiveScopeSchema>;

export interface AgentGoldLiveOptions {
  baseUrl: string;
  username: string;
  password: string;
  scope?: AgentGoldLiveScope;
  pollIntervalMs?: number;
  runTimeoutMs?: number;
  requestTimeoutMs?: number;
  tasks?: AgentGoldTask[];
}

export interface AgentGoldLiveRun {
  taskId: string;
  runId: number;
  sessionId: number;
  status: AgentRunStatus;
  errorMessage: string | null;
  audit: unknown;
}

export interface AgentGoldLiveReport {
  generatedAt: string;
  baseUrl: string;
  scope: AgentGoldLiveScope;
  evaluation: AgentGoldEvaluation;
  targets: typeof agentGoldTargets;
  targetStatus: Record<keyof typeof agentGoldTargets, boolean>;
  pendingAnnotations: {
    alertValidity: string[];
    recovery: string[];
  };
  runs: AgentGoldLiveRun[];
}

export const agentGoldAlertReviewTaskIds = ["anomaly-03", "patrol-01"] as const;
export const agentGoldRecoveryReviewTaskIds = [
  "price-04",
  "keyword-04",
  "review-03",
  "patrol-02",
] as const;

interface AgentSessionResponse {
  id: number;
}

export async function runLiveAgentGoldEvaluation(
  options: AgentGoldLiveOptions,
  fetcher: FetchLike = fetch,
): Promise<AgentGoldLiveReport> {
  const client = await AgentEvaluationClient.login({
    ...options,
    requestTimeoutMs: options.requestTimeoutMs ?? 30_000,
  }, fetcher);
  const scope = options.scope ?? await discoverScope(client);
  const tasks = options.tasks ?? agentGoldTasks;
  const evaluatedTaskIds = new Set(tasks.map((task) => task.id));
  const liveRuns: AgentGoldLiveRun[] = [];
  const evaluation = await runAgentGoldEvaluation(async (task) => {
    let sessionId = 0;
    let runId = 0;
    const annotation = scope.annotations[task.id];
    try {
      const session = await client.post<AgentSessionResponse>("/api/agent/sessions", {
        title: `Gold ${task.id}`,
      });
      sessionId = session.id;
      const created = await client.post<AgentRun>("/api/agent/sessions/"
        + `${session.id}/runs`, buildRunRequest(task, scope));
      runId = created.id;
      const detail = await client.waitForRun(
        created.id,
        options.pollIntervalMs ?? 1_000,
        options.runTimeoutMs ?? 600_000,
      );
      const audit = await client.get<unknown>(`/api/agent/audit?runId=${created.id}`);
      liveRuns.push({
        taskId: task.id,
        runId: detail.id,
        sessionId: detail.sessionId,
        status: detail.status,
        errorMessage: detail.errorMessage,
        audit,
      });
      return {
        output: detail.output,
        toolCalls: detail.toolCalls.map(({ toolName, status }) => ({
          toolName,
          status,
        })),
        errorMessage: detail.errorMessage,
        alertValid: annotation?.alertValid ?? null,
        recoverySucceeded: annotation?.recoverySucceeded ?? null,
      };
    } catch (error) {
      if (runId > 0) {
        try {
          await client.cancel(runId);
        } catch {
          // The run may already be terminal or the API may be restarting.
        }
      }
      const errorMessage = formatError(error);
      liveRuns.push({
        taskId: task.id,
        runId,
        sessionId,
        status: "failed",
        errorMessage,
        audit: null,
      });
      return {
        output: null,
        toolCalls: [],
        errorMessage,
        alertValid: annotation?.alertValid ?? null,
        recoverySucceeded: annotation?.recoverySucceeded ?? null,
      };
    }
  }, tasks);

  return {
    generatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    scope,
    evaluation,
    targets: agentGoldTargets,
    targetStatus: {
      dataSupportRate:
        evaluation.metrics.dataSupportRate >= agentGoldTargets.dataSupportRate,
      unsupportedConclusionRate:
        evaluation.metrics.unsupportedConclusionRate
        <= agentGoldTargets.unsupportedConclusionRate,
      highPriorityAlertValidityRate:
        evaluation.metrics.highPriorityAlertValidityRate
        >= agentGoldTargets.highPriorityAlertValidityRate,
      toolSuccessRate:
        evaluation.metrics.toolSuccessRate >= agentGoldTargets.toolSuccessRate,
      taskRecoveryRate:
        evaluation.metrics.taskRecoveryRate >= agentGoldTargets.taskRecoveryRate,
    },
    pendingAnnotations: {
      alertValidity: missingAnnotations(
        scope,
        agentGoldAlertReviewTaskIds,
        "alertValid",
        evaluatedTaskIds,
      ),
      recovery: missingAnnotations(
        scope,
        agentGoldRecoveryReviewTaskIds,
        "recoverySucceeded",
        evaluatedTaskIds,
      ),
    },
    runs: liveRuns,
  };
}

function missingAnnotations(
  scope: AgentGoldLiveScope,
  taskIds: readonly string[],
  field: "alertValid" | "recoverySucceeded",
  evaluatedTaskIds: Set<string>,
): string[] {
  return taskIds.filter((taskId) => evaluatedTaskIds.has(taskId) && (
    scope.annotations[taskId]?.[field] === undefined
    || scope.annotations[taskId]?.[field] === null
  ));
}

function buildRunRequest(task: AgentGoldTask, scope: AgentGoldLiveScope) {
  const datasets = new Set<AgentGoldDataset>();
  task.expectedTools.forEach((toolName) =>
    datasetsByTool[toolName]?.forEach((dataset) => datasets.add(dataset)));
  const prompt = resolvePrompt(task.prompt, scope);
  return {
    input: [
      prompt,
      `评估范围：类目 ID ${scope.categoryId}；关键词 ID ${scope.keywordId}；`,
      `站点 ${scope.marketplace}；候选 ASIN ${scope.asins.slice(0, 3).join("、")}。`,
    ].join(""),
    freshness: {
      datasets: [...datasets],
      categoryId: scope.categoryId,
      keywordId: scope.keywordId,
      asin: firstTaskAsin(task.prompt, scope),
      marketplace: scope.marketplace,
      maxAgeHours: scope.maxAgeHours,
    },
  };
}

function resolvePrompt(prompt: string, scope: AgentGoldLiveScope): string {
  return prompt
    .replace(/B000TEST(\d{2})/g, (_match, index: string) =>
      scope.asins[Number(index) - 1] ?? scope.asins[0])
    .replace(/\bAlpha\b/g, scope.brands[0])
    .replace(/\bBeta\b/g, scope.brands[1]);
}

function firstTaskAsin(prompt: string, scope: AgentGoldLiveScope): string {
  const match = /B000TEST(\d{2})/.exec(prompt);
  return match ? scope.asins[Number(match[1]) - 1] ?? scope.asins[0] : scope.asins[0];
}

function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

async function discoverScope(
  client: AgentEvaluationClient,
): Promise<AgentGoldLiveScope> {
  const [categories, keywords, competitors] = await Promise.all([
    client.get<CategoryMonitor[]>("/api/categories"),
    client.get<KeywordMonitor[]>("/api/keywords"),
    client.get<CompetitorPoolItem[]>("/api/competitors"),
  ]);
  const category = categories.find((item) => item.status === "enabled")
    ?? categories[0];
  if (!category) throw new Error("Gold evaluation requires at least one category");
  const keyword = keywords.find((item) =>
    item.status === "enabled" && item.marketplace === category.marketplace)
    ?? keywords.find((item) => item.status === "enabled")
    ?? keywords[0];
  if (!keyword) throw new Error("Gold evaluation requires at least one keyword");
  const marketplaceCompetitors = competitors.filter((item) =>
    item.status === "active"
    && item.marketplace === category.marketplace
    && /^[A-Z0-9]{10}$/.test(item.asin));
  const asins = [...new Set(marketplaceCompetitors.map((item) => item.asin))];
  if (asins.length < 10) {
    throw new Error("Gold evaluation requires ten active ASINs in one marketplace");
  }
  const brands = [...new Set(
    marketplaceCompetitors
      .map((item) => item.brand?.trim())
      .filter((brand): brand is string => Boolean(brand)),
  )];
  if (brands.length < 2) {
    throw new Error("Gold evaluation requires two observed competitor brands");
  }
  return agentGoldLiveScopeSchema.parse({
    categoryId: category.id,
    keywordId: keyword.id,
    marketplace: category.marketplace,
    asins: asins.slice(0, 10),
    brands: [brands[0], brands[1]],
  });
}
