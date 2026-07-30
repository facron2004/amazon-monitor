export interface AgentRuntimeConfig {
  enabled: boolean;
  primaryModel: string;
  fallbackModel: string;
  reasoningEffort: "low" | "medium" | "high";
  maxTurns: number;
  tracingDisabled: true;
}

function boundedTurns(value: string | undefined): number {
  const parsed = Number(value ?? 10);
  return Number.isFinite(parsed) ? Math.min(10, Math.max(1, Math.floor(parsed))) : 10;
}

export function loadAgentRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): AgentRuntimeConfig {
  const effort = env.AGENT_REASONING_EFFORT;
  return {
    enabled: env.AGENT_SDK_ENABLED === "true",
    primaryModel: env.AGENT_PRIMARY_MODEL?.trim() || "gpt-5.6-sol",
    fallbackModel: env.AGENT_FALLBACK_MODEL?.trim() || "gpt-5.6-terra",
    reasoningEffort: effort === "low" || effort === "high" ? effort : "medium",
    maxTurns: boundedTurns(env.AGENT_MAX_TURNS),
    tracingDisabled: true,
  };
}
