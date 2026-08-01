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
  const schema = z.toJSONSchema(agentRunOutputSchema, {
    target: "draft-7",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  return toCodexCompatibleSchema(schema);
}

function toCodexCompatibleSchema(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const result: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, nested]) => {
    result[key] = Array.isArray(nested)
      ? nested.map((item) => (isRecord(item) ? toCodexCompatibleSchema(item) : item))
      : isRecord(nested)
        ? toCodexCompatibleSchema(nested)
        : nested;
  });
  if (result.oneOf && !result.anyOf) {
    result.anyOf = result.oneOf;
    delete result.oneOf;
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
