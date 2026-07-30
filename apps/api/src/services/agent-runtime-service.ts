import {
  executeAmazonAgentRun,
  loadAgentRuntimeConfig,
  type AgentRuntimeConfig,
  type AgentRuntimePersistence,
} from "@amazon-monitor/agent";
import type { AgentRun, AgentRunOutput } from "@amazon-monitor/shared";
import type { Store } from "../store.js";
import { StoreAgentToolBackend } from "./agent-tool-backend.js";
import { SqliteAgentSession } from "./sqlite-agent-session.js";
import {
  cancelDesktopAgentRun,
  hasDesktopAgentTransport,
  startDesktopAgentRun,
} from "./desktop-agent-transport.js";

export class AgentRuntimeService {
  private readonly controllers = new Map<number, AbortController>();
  private readonly runSteps = new Map<number, {
    analysis?: number;
    freshness?: number;
    planning?: number;
  }>();
  private readonly toolCalls = new Map<string, number>();

  constructor(
    private readonly store: Store,
    readonly config: AgentRuntimeConfig = loadAgentRuntimeConfig(),
  ) {}

  start(run: AgentRun, freshnessInput: Record<string, unknown>): void {
    if (!this.config.enabled) {
      throw Object.assign(new Error("Agent SDK is disabled"), { statusCode: 503 });
    }
    this.store.updateAgentRun(run.id, run.orgId, { status: "planning" });
    const persistence = this.persistenceFor(run);
    if (hasDesktopAgentTransport()) {
      startDesktopAgentRun(
        run,
        freshnessInput,
        this.config,
        persistence,
      );
      return;
    }

    const controller = new AbortController();
    this.controllers.set(run.id, controller);
    void executeAmazonAgentRun(
      this.config,
      new StoreAgentToolBackend(this.store),
      persistence,
      {
        input: run.input,
        taskType: run.taskType,
        freshnessInput,
        context: {
          orgId: run.orgId,
          userId: run.userId,
          runId: run.id,
          signal: controller.signal,
        },
        session: new SqliteAgentSession(this.store, run.sessionId),
      },
    )
      .catch(() => undefined)
      .finally(() => {
        this.controllers.delete(run.id);
      });
  }

  cancel(runId: number, orgId: number): AgentRun | null {
    const run = this.store.getAgentRun(runId, orgId);
    if (!run) return null;
    if (["completed", "failed", "cancelled"].includes(run.status)) return run;
    this.store.appendAgentRunEvent({ runId, type: "run.cancelled" });
    const cancelled = this.store.updateAgentRun(runId, orgId, {
      status: "cancelled",
      completedAt: new Date().toISOString(),
    });
    this.controllers.get(runId)?.abort();
    cancelDesktopAgentRun(runId);
    this.finishRunAudit(runId, "failed", "Run cancelled");
    return cancelled;
  }

  private persistenceFor(run: AgentRun): AgentRuntimePersistence {
    return {
      appendEvent: (runId, type, payload) => {
        const status = statusForEvent(type);
        if (status) this.store.updateAgentRun(runId, run.orgId, { status });
        this.persistAuditEvent(runId, type, payload ?? {});
        return this.store.appendAgentRunEvent({ runId, type, payload });
      },
      complete: (runId, output) => this.complete(run, output),
      fail: (runId, errorMessage) => {
        const current = this.store.getAgentRun(runId, run.orgId);
        if (current?.status === "cancelled") return;
        this.store.updateAgentRun(runId, run.orgId, {
          status: "failed",
          errorMessage,
          completedAt: new Date().toISOString(),
        });
        this.finishRunAudit(runId, "failed", errorMessage);
        this.store.appendAgentRunEvent({
          runId,
          type: "run.failed",
          payload: { errorMessage },
        });
      },
    };
  }

  private complete(run: AgentRun, output: AgentRunOutput): void {
    output.recommendedActions.forEach((action, index) => {
      this.store.createActionProposal({
        runId: run.id,
        orgId: run.orgId,
        actionType: action.type,
        title: action.title,
        payload: action.payload,
        riskLevel: resolveAgentActionRiskLevel(action.type),
        idempotencyKey: `agent-run:${run.id}:action:${index}:${action.type}`,
      });
    });
    this.store.updateAgentRun(run.id, run.orgId, {
      status: output.recommendedActions.length > 0
        ? "waiting_approval"
        : "completed",
      output,
      completedAt: new Date().toISOString(),
    });
    this.store.appendAgentMessage({
      sessionId: run.sessionId,
      runId: run.id,
      role: "assistant",
      content: output.summary,
    });
    this.finishRunAudit(run.id, "completed");
    this.store.appendAgentRunEvent({
      runId: run.id,
      type: "run.completed",
      payload: {
        status: output.recommendedActions.length > 0
          ? "waiting_approval"
          : "completed",
      },
    });
  }

  private persistAuditEvent(
    runId: number,
    type: string,
    payload: Record<string, unknown>,
  ): void {
    const steps = this.runSteps.get(runId) ?? {};
    if (type === "planning.started") {
      steps.planning = this.store.createAgentStep({
        runId,
        title: "Classify task and create a readable plan",
      }).id;
    } else if (type === "plan.created" && steps.planning) {
      this.store.completeAgentStep(steps.planning, "completed");
    } else if (type === "freshness.started") {
      steps.freshness = this.store.createAgentStep({
        runId,
        title: "Check data freshness",
      }).id;
    } else if (type === "freshness.completed" && steps.freshness) {
      this.store.completeAgentStep(steps.freshness, "completed");
    } else if (type === "model.started") {
      steps.analysis = this.store.createAgentStep({
        runId,
        title: "Analyze evidence and call tools",
      }).id;
    } else if (type === "tool.started") {
      const callKey = stringPayload(payload, "callKey");
      const toolName = stringPayload(payload, "toolName");
      const argumentsValue = payload.arguments;
      if (callKey && isAgentToolName(toolName)) {
        const call = this.store.createAgentToolCall({
          runId,
          stepId: steps.analysis ?? steps.freshness ?? steps.planning ?? null,
          toolName,
          arguments: isRecord(argumentsValue) ? argumentsValue : {},
        });
        this.toolCalls.set(callKey, call.id);
      }
    } else if (type === "tool.completed" || type === "tool.failed") {
      const callKey = stringPayload(payload, "callKey");
      const callId = callKey ? this.toolCalls.get(callKey) : undefined;
      if (callId) {
        this.store.completeAgentToolCall(callId, {
          status: type === "tool.completed" ? "completed" : "failed",
          result: isToolEnvelope(payload.result) ? payload.result : undefined,
          errorMessage: type === "tool.failed"
            ? stringPayload(payload, "errorMessage")
            : null,
        });
        this.toolCalls.delete(callKey!);
      }
    }
    this.runSteps.set(runId, steps);
  }

  private finishRunAudit(
    runId: number,
    status: "completed" | "failed",
    errorMessage: string | null = null,
  ): void {
    const steps = this.runSteps.get(runId);
    for (const stepId of [steps?.planning, steps?.freshness, steps?.analysis]) {
      if (stepId) this.store.completeAgentStep(stepId, status, errorMessage);
    }
    this.runSteps.delete(runId);
    for (const [callKey, callId] of this.toolCalls) {
      if (this.store.listAgentToolCalls(runId).some((call) => call.id === callId)) {
        this.store.completeAgentToolCall(callId, {
          status: "failed",
          errorMessage: errorMessage ?? "Run ended before the tool completed",
        });
        this.toolCalls.delete(callKey);
      }
    }
  }
}

export function resolveAgentActionRiskLevel(
  actionType: import("@amazon-monitor/shared").AgentActionType,
): "L2" | "L3" {
  return actionType === "send_feishu_report" || actionType === "export_report"
    ? "L3"
    : "L2";
}

function statusForEvent(type: string): AgentRun["status"] | null {
  if (type === "planning.started" || type === "plan.created") return "planning";
  if (type === "model.started") return "running_tools";
  if (type === "model.progress") return "analyzing";
  if (type === "freshness.started") return "checking_data";
  return null;
}

function stringPayload(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  return typeof payload[key] === "string" ? payload[key] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgentToolName(value: string | null): value is import("@amazon-monitor/shared").AgentToolName {
  return value !== null && [
    "get_category_snapshot", "get_keyword_ranking", "get_asin_history",
    "compare_asins", "compare_brand_matrix", "get_price_history",
    "get_promotion_timeline", "get_review_growth", "get_listing_change",
    "check_data_freshness", "find_rank_anomalies", "find_new_product_breakouts",
    "find_price_low", "find_review_anomalies", "find_brand_share_changes",
  ].includes(value);
}

function isToolEnvelope(
  value: unknown,
): value is import("@amazon-monitor/shared").AgentToolEnvelope {
  return isRecord(value)
    && "data" in value
    && Array.isArray(value.evidenceRefs)
    && isRecord(value.freshness)
    && Array.isArray(value.dataGaps)
    && Array.isArray(value.warnings);
}
