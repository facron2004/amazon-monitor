import { describe, expect, it } from "vitest";
import { loadAgentRuntimeConfig } from "./config.js";

describe("loadAgentRuntimeConfig", () => {
  it("uses the approved models, medium reasoning, and a ten-turn ceiling", () => {
    expect(loadAgentRuntimeConfig({})).toEqual({
      enabled: false,
      primaryModel: "gpt-5.6-sol",
      fallbackModel: "gpt-5.6-terra",
      reasoningEffort: "medium",
      maxTurns: 10,
      tracingDisabled: true,
    });
    expect(loadAgentRuntimeConfig({
      AGENT_SDK_ENABLED: "true",
      AGENT_MAX_TURNS: "99",
    })).toMatchObject({ enabled: true, maxTurns: 10 });
  });
});
