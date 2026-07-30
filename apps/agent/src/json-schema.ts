import { z } from "zod";
import { agentToolNames } from "@amazon-monitor/shared";
import { agentRunOutputSchema } from "./output-schema.js";
import { agentToolDescriptions } from "./orchestrator.js";
import { agentToolInputSchemas } from "./tool-schemas.js";

export interface AgentDynamicToolSpec {
  type: "function";
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export function getAgentDynamicToolSpecs(): AgentDynamicToolSpec[] {
  return agentToolNames.map((name) => ({
    type: "function",
    name,
    description: agentToolDescriptions[name],
    inputSchema: z.toJSONSchema(agentToolInputSchemas[name], {
      target: "draft-7",
      unrepresentable: "any",
    }) as Record<string, unknown>,
  }));
}

export function getAgentRunOutputJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(agentRunOutputSchema, {
    target: "draft-7",
    unrepresentable: "any",
  }) as Record<string, unknown>;
}
