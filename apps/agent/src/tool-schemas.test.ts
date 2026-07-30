import { describe, expect, it } from "vitest";
import { agentToolNames } from "@amazon-monitor/shared";
import { agentToolInputSchemas, parseAgentToolInput } from "./tool-schemas.js";

describe("agent tool schemas", () => {
  it("registers exactly the approved fifteen read-only tools", () => {
    expect(Object.keys(agentToolInputSchemas).sort()).toEqual([...agentToolNames].sort());
  });

  it("does not allow model-supplied organization context or unbounded ranges", () => {
    expect(() => parseAgentToolInput("get_asin_history", {
      asin: "B000TEST01",
      orgId: 99,
    })).toThrow();
    expect(() => parseAgentToolInput("get_category_snapshot", {
      categoryId: 1,
      from: "2026-01-01",
      to: "2026-07-29",
    })).toThrow(/90 days/);
  });
});
