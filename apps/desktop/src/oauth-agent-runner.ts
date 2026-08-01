import {
  agentRunOutputSchema,
  agentToolInputSchemas,
  applyFreshnessPolicy,
  executeToolWithRetry,
  collectPlannedAgentEvidence,
  compactAgentToolEnvelope,
  formatPlannedAgentEvidence,
  getAgentDynamicToolSpecs,
  getAgentRunOutputJsonSchema,
  mergeAgentFreshness,
  planAgentToolCalls,
  type AgentRuntimeConfig,
  type AgentRuntimePersistence,
  type AgentToolBackend,
  type PlannedAgentEvidence,
} from "@amazon-monitor/agent";
import {
  agentToolNames,
  type AgentFreshness,
  type AgentModelRuntimeConnection,
  type AgentRunOutput,
  type AgentToolName,
  type DesktopAgentRunStart,
} from "@amazon-monitor/shared";
import { CodexAppServerClient } from "./codex-app-server-client.js";

export async function executeOAuthAgentRun(
  client: CodexAppServerClient,
  connection: AgentModelRuntimeConnection,
  config: AgentRuntimeConfig,
  backend: AgentToolBackend,
  persistence: AgentRuntimePersistence,
  message: DesktopAgentRunStart,
  sandboxPath: string,
  signal?: AbortSignal,
): Promise<AgentRunOutput> {
  persistence.appendEvent(message.run.id, "planning.started", {
    taskType: message.run.taskType,
  });
  persistence.appendEvent(message.run.id, "plan.created", {
    taskType: message.run.taskType,
    steps: [
      "Check required data freshness",
      "Inspect bounded business evidence with read-only tools",
      "Validate citations and produce approval-gated recommendations",
    ],
  });
  persistence.appendEvent(message.run.id, "freshness.started");
  const context = {
    orgId: message.run.orgId,
    userId: message.run.userId,
    runId: message.run.id,
    signal,
  };
  const freshnessEnvelope = await executeToolWithRetry(
    "check_data_freshness",
    message.run.freshnessInput,
    backend,
    context,
    persistence,
  );
  persistence.appendEvent(message.run.id, "freshness.completed", {
    status: freshnessEnvelope.freshness.status,
    dataGaps: freshnessEnvelope.dataGaps,
  });
  const plannedEvidence = await collectPlannedAgentEvidence(
    message.run.input,
    message.run.taskType,
    message.run.freshnessInput,
    backend,
    context,
    persistence,
  );
  const effectiveFreshness = mergeAgentFreshness(
    freshnessEnvelope.freshness,
    plannedEvidence,
  );
  persistence.appendEvent(message.run.id, "freshness.effective", {
    status: effectiveFreshness.status,
    dataGaps: effectiveFreshness.dataGaps,
    staleSources: effectiveFreshness.staleSources,
  });
  const plannedToolNames = planAgentToolCalls(
    message.run.input,
    message.run.taskType,
    message.run.freshnessInput,
  ).map(({ toolName }) => toolName);
  const allowedTools = plannedToolNames.length > 0
    ? new Set(plannedToolNames)
    : undefined;

  const models = [
    connection.primaryModel,
    connection.primaryModel,
    connection.fallbackModel,
  ];
  let lastError: unknown;
  for (const [attempt, model] of models.entries()) {
    try {
      const output = await runCodexModel(
        client,
        model,
        config,
        backend,
        persistence,
        message,
        effectiveFreshness,
        plannedEvidence,
        allowedTools,
        sandboxPath,
        signal,
      );
      const guarded = applyFreshnessPolicy(output, effectiveFreshness);
      persistence.complete(message.run.id, guarded);
      return guarded;
    } catch (error) {
      lastError = error;
      persistence.appendEvent(message.run.id, "model.failed", {
        model,
        attempt: attempt + 1,
        willRetry: attempt < models.length - 1,
      });
    }
  }
  const errorMessage = lastError instanceof Error
    ? lastError.message
    : "OAuth Agent run failed";
  persistence.fail(message.run.id, errorMessage);
  throw lastError;
}

async function runCodexModel(
  client: CodexAppServerClient,
  model: string,
  config: AgentRuntimeConfig,
  backend: AgentToolBackend,
  persistence: AgentRuntimePersistence,
  message: DesktopAgentRunStart,
  freshness: AgentFreshness,
  plannedEvidence: PlannedAgentEvidence[],
  allowedTools: ReadonlySet<AgentToolName> | undefined,
  sandboxPath: string,
  signal?: AbortSignal,
): Promise<AgentRunOutput> {
  persistence.appendEvent(message.run.id, "model.started", {
    model,
    provider: "chatgpt-oauth",
  });
  const text = await client.run({
    model,
    effort: config.reasoningEffort,
    input: [
      message.run.input,
      "",
      `Code-enforced freshness gate:\n${JSON.stringify(freshness)}`,
      "",
      `Deterministic preflight evidence (read-only):\n${formatPlannedAgentEvidence(plannedEvidence)}`,
      "",
      "Use every relevant specialized tool for each requested dimension before finalizing. If freshness is stale or missing, stop analysis and propose recollection only.",
      "",
      "Return evidence-backed Amazon operations analysis only.",
    ].join("\n"),
    outputSchema: getAgentRunOutputJsonSchema(),
    sandboxPath,
    signal,
    tools: getAgentDynamicToolSpecs().filter((spec) =>
      !allowedTools || allowedTools.has(spec.name as AgentToolName)),
    toolHandler: async (toolName, input) => {
      if (!isAgentToolName(toolName)) throw new Error("Unknown Amazon business tool");
      const parsed = agentToolInputSchemas[toolName].parse(input);
      const envelope = await executeToolWithRetry(
        toolName,
        parsed as Record<string, unknown>,
        backend,
        contextFor(message),
        persistence,
      );
      return JSON.stringify(compactAgentToolEnvelope(envelope));
    },
  });
  persistence.appendEvent(message.run.id, "model.progress", {
    item: "final_output",
  });
  return agentRunOutputSchema.parse(parseJsonOutput(text));
}

function contextFor(message: DesktopAgentRunStart) {
  return {
    orgId: message.run.orgId,
    userId: message.run.userId,
    runId: message.run.id,
  };
}

function parseJsonOutput(value: string): unknown {
  const trimmed = value.trim();
  const unwrapped = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  return JSON.parse(unwrapped);
}

function isAgentToolName(value: string): value is AgentToolName {
  return agentToolNames.includes(value as AgentToolName);
}
