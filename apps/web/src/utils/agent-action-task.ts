import type { AiAgentOutput, AiAgentType, AiRecommendedAction, TaskType } from "@amazon-monitor/shared";
import type { CreateTaskInput } from "../api-tasks";

const agentTaskTypes: Record<AiAgentType, TaskType> = {
  daily_operator: "other",
  competitor_analyst: "competitor",
  listing_optimizer: "listing",
  ads_analyst: "ad",
  product_research: "competitor",
  review_voc: "review",
  report_writer: "campaign_recap"
};

export interface AgentActionTaskContext {
  runId: number;
  agentType: AiAgentType;
  output: AiAgentOutput;
  action: AiRecommendedAction;
  relatedAsin?: string | null;
  relatedKeyword?: string | null;
  relatedBrand?: string | null;
}

export function buildAgentActionTask(context: AgentActionTaskContext): CreateTaskInput {
  return {
    sourceType: "ai_run",
    sourceId: String(context.runId),
    title: context.action.action,
    description: [
      `Reason: ${context.action.reason}`,
      `Risk: ${context.action.risk}`,
      `Agent confidence: ${Math.round(context.output.confidence * 100)}%`,
      ...context.output.evidence.map((item) => `Evidence: ${item}`)
    ].join("\n"),
    taskType: agentTaskTypes[context.agentType],
    priority: context.action.priority,
    relatedAsin: context.relatedAsin ?? null,
    relatedKeyword: context.relatedKeyword ?? null,
    relatedBrand: context.relatedBrand ?? null,
    aiRecommendation: context.action.action
  };
}
