import {
  Agent,
  Runner,
  run,
  setTracingDisabled,
  tool,
  type Session,
} from "@openai/agents";
import { OpenAIProvider } from "@openai/agents-openai";
import { randomUUID } from "node:crypto";
import type {
  AgentFreshness,
  AgentRunOutput,
  AgentTaskType,
  AgentToolName,
} from "@amazon-monitor/shared";
import type {
  AgentExecutionContext,
  AgentRuntimePersistence,
  AgentToolBackend,
} from "./runtime-types.js";
import type { AgentRuntimeConfig } from "./config.js";
import { agentRunOutputSchema } from "./output-schema.js";
import { agentToolInputSchemas } from "./tool-schemas.js";

export const agentToolDescriptions: Record<AgentToolName, string> = {
  get_category_snapshot: "Read bounded BSR category snapshots for a dated scope.",
  get_keyword_ranking: "Read bounded keyword SERP rankings for a dated scope.",
  get_asin_history: "Read combined category and keyword history for one ASIN.",
  compare_asins: "Compare evidence for two to ten ASINs.",
  compare_brand_matrix: "Compare bounded brand share snapshots in one category.",
  get_price_history: "Read bounded price history for one ASIN.",
  get_promotion_timeline: "Read coupon, deal, promotion, and price events for one ASIN.",
  get_review_growth: "Read dated review-count growth for one ASIN.",
  get_listing_change: "Read observed listing content change events for one ASIN.",
  check_data_freshness: "Check whether required datasets are fresh enough for conclusions.",
  find_rank_anomalies: "Find deterministic rank and BSR anomaly events.",
  find_new_product_breakouts: "Find deterministic new-entry and breakout events.",
  find_price_low: "Find the observed price low in bounded history.",
  find_review_anomalies: "Find deterministic review anomaly events.",
  find_brand_share_changes: "Find dated brand-share changes in one category.",
};

export interface AmazonAgentRunRequest {
  input: string;
  freshnessInput: Record<string, unknown>;
  context: AgentExecutionContext;
  taskType?: AgentTaskType;
  session?: Session;
}

export function classifyAgentTask(input: string): AgentTaskType {
  const normalized = input.toLowerCase();
  if (/巡检|patrol|daily check|每日检查/.test(normalized)) return "patrol";
  if (/报告|report|汇总|summary/.test(normalized)) return "report";
  if (/创建|发送|导出|监控|create|send|export|monitor/.test(normalized)) return "action";
  if (/调查|分析|异常|原因|哪些|investigat|analy[sz]e|why|anomal/.test(normalized)) {
    return "investigation";
  }
  return "query";
}

function createReadTool(
  name: AgentToolName,
  backend: AgentToolBackend,
  context: AgentExecutionContext,
  persistence: AgentRuntimePersistence,
) {
  return tool({
    name,
    description: agentToolDescriptions[name],
    parameters: agentToolInputSchemas[name],
    strict: true,
    timeoutMs: 30_000,
    execute: async (input) => {
      const envelope = await executeToolWithRetry(
        name,
        input as Record<string, unknown>,
        backend,
        context,
        persistence,
      );
      return JSON.stringify(envelope);
    },
  });
}

function createTools(
  backend: AgentToolBackend,
  context: AgentExecutionContext,
  persistence: AgentRuntimePersistence,
) {
  return [
    createReadTool("get_category_snapshot", backend, context, persistence),
    createReadTool("get_keyword_ranking", backend, context, persistence),
    createReadTool("get_asin_history", backend, context, persistence),
    createReadTool("compare_asins", backend, context, persistence),
    createReadTool("compare_brand_matrix", backend, context, persistence),
    createReadTool("get_price_history", backend, context, persistence),
    createReadTool("get_promotion_timeline", backend, context, persistence),
    createReadTool("get_review_growth", backend, context, persistence),
    createReadTool("get_listing_change", backend, context, persistence),
    createReadTool("check_data_freshness", backend, context, persistence),
    createReadTool("find_rank_anomalies", backend, context, persistence),
    createReadTool("find_new_product_breakouts", backend, context, persistence),
    createReadTool("find_price_low", backend, context, persistence),
    createReadTool("find_review_anomalies", backend, context, persistence),
    createReadTool("find_brand_share_changes", backend, context, persistence),
  ];
}

export function applyFreshnessPolicy(
  output: AgentRunOutput,
  freshness: AgentFreshness,
): AgentRunOutput {
  if (freshness.status === "fresh") return { ...output, freshness };
  return {
    ...output,
    conclusions: output.conclusions.map((conclusion) => ({
      ...conclusion,
      confidence: Math.min(0.49, conclusion.confidence),
    })),
    freshness,
    riskNotes: [...new Set([
      ...output.riskNotes,
      "Evidence is not fresh enough for a deterministic conclusion or direct execution.",
    ])],
    recommendedActions: output.recommendedActions.filter(
      (action) => action.type === "recollect",
    ),
  };
}

export async function executeAmazonAgentRun(
  config: AgentRuntimeConfig,
  backend: AgentToolBackend,
  persistence: AgentRuntimePersistence,
  request: AmazonAgentRunRequest,
): Promise<AgentRunOutput> {
  if (!config.enabled) throw new Error("Agent SDK is disabled");
  setTracingDisabled(config.tracingDisabled);
  const taskType = request.taskType ?? classifyAgentTask(request.input);
  persistence.appendEvent(request.context.runId, "planning.started", { taskType });
  persistence.appendEvent(request.context.runId, "plan.created", {
    taskType,
    steps: [
      "Check required data freshness",
      "Inspect bounded business evidence with read-only tools",
      "Validate citations and produce approval-gated recommendations",
    ],
  });
  persistence.appendEvent(request.context.runId, "freshness.started");
  const freshnessEnvelope = await executeToolWithRetry(
    "check_data_freshness",
    request.freshnessInput,
    backend,
    request.context,
    persistence,
  );
  persistence.appendEvent(request.context.runId, "freshness.completed", {
    status: freshnessEnvelope.freshness.status,
    dataGaps: freshnessEnvelope.dataGaps,
  });

  const models = [config.primaryModel, config.primaryModel, config.fallbackModel];
  let lastError: unknown;
  for (const [attempt, model] of models.entries()) {
    try {
      const output = await runModel(
        model,
        config,
        backend,
        persistence,
        request,
        freshnessEnvelope.freshness,
      );
      const guarded = applyFreshnessPolicy(output, freshnessEnvelope.freshness);
      persistence.complete(request.context.runId, guarded);
      return guarded;
    } catch (error) {
      lastError = error;
      persistence.appendEvent(request.context.runId, "model.failed", {
        model,
        attempt: attempt + 1,
        willRetry: attempt < models.length - 1,
      });
    }
  }
  const message = lastError instanceof Error ? lastError.message : "Agent run failed";
  persistence.fail(request.context.runId, message);
  throw lastError;
}

export async function executeToolWithRetry(
  toolName: AgentToolName,
  input: Record<string, unknown>,
  backend: AgentToolBackend,
  context: AgentExecutionContext,
  persistence: AgentRuntimePersistence,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const callKey = `${context.runId}:${toolName}:${randomUUID()}`;
    persistence.appendEvent(context.runId, "tool.started", {
      callKey,
      toolName,
      arguments: input,
      attempt,
    });
    try {
      const envelope = await backend.execute(toolName, input, context);
      persistence.appendEvent(context.runId, "tool.completed", {
        callKey,
        toolName,
        attempt,
        freshnessStatus: envelope.freshness.status,
        evidenceCount: envelope.evidenceRefs.length,
        result: envelope,
      });
      return envelope;
    } catch (error) {
      lastError = error;
      const transient = isTransientToolError(error);
      persistence.appendEvent(context.runId, "tool.failed", {
        callKey,
        toolName,
        attempt,
        errorMessage: safeErrorMessage(error),
        willRetry: transient && attempt === 1,
      });
      if (!transient || attempt === 2 || context.signal?.aborted) throw error;
    }
  }
  throw lastError;
}

function isTransientToolError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const statusCode = Number(error.statusCode);
    if ([408, 425, 429].includes(statusCode) || statusCode >= 500) return true;
  }
  return /timeout|timed out|temporary|temporarily|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i
    .test(safeErrorMessage(error));
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Tool call failed";
  return message.slice(0, 500);
}

async function runModel(
  model: string,
  config: AgentRuntimeConfig,
  backend: AgentToolBackend,
  persistence: AgentRuntimePersistence,
  request: AmazonAgentRunRequest,
  freshness: AgentFreshness,
): Promise<AgentRunOutput> {
  const reasoningEnabled = config.modelProvider?.reasoningEnabled ?? true;
  const agent = new Agent({
    name: "Amazon Operations Agent",
    model,
    modelSettings: reasoningEnabled
      ? {
          reasoning: { effort: config.reasoningEffort },
          text: { verbosity: "medium" },
          store: false,
        }
      : {},
    instructions: [
      "You are a single Amazon operations analysis agent.",
      "Use only the registered read-only tools. Never invent evidence.",
      "Every conclusion must cite evidenceRefs and snapshotRefs with an explicit scope.",
      "Writing is proposal-only and always requires human approval.",
      "Do not expose private chain-of-thought; provide only concise plan and status summaries.",
      "If freshness is not fresh, make only a recollection proposal and use confidence at most 0.49.",
    ].join(" "),
    tools: createTools(backend, request.context, persistence),
    outputType: agentRunOutputSchema,
  });
  persistence.appendEvent(request.context.runId, "model.started", { model });
  const input = `${request.input}\n\nCode-enforced freshness gate:\n${JSON.stringify(freshness)}`;
  const options = {
    stream: true as const,
    maxTurns: config.maxTurns,
    signal: request.context.signal,
    session: request.session,
  };
  const stream = config.modelProvider
    ? await new Runner({
        modelProvider: new OpenAIProvider({
          apiKey: config.modelProvider.apiKey,
          baseURL: config.modelProvider.baseURL,
          useResponses: config.modelProvider.useResponses,
          strictFeatureValidation: false,
        }),
        tracingDisabled: true,
      }).run(agent, input, options)
    : await run(agent, input, options);
  for await (const event of stream) {
    if (event.type === "run_item_stream_event") {
      persistence.appendEvent(request.context.runId, "model.progress", {
        item: event.name,
      });
    } else if (event.type === "agent_updated_stream_event") {
      persistence.appendEvent(request.context.runId, "model.agent", {
        name: event.agent.name,
      });
    }
  }
  await stream.completed;
  if (stream.error) throw stream.error;
  if (!stream.finalOutput) throw new Error("Agent returned no structured output");
  return stream.finalOutput;
}
