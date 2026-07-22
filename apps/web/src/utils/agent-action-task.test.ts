import { describe, expect, it } from "vitest";
import { buildAgentActionTask } from "./agent-action-task";

describe("buildAgentActionTask", () => {
  it("preserves the Agent run, evidence, risk, and domain mapping", () => {
    expect(buildAgentActionTask({
      runId: 23,
      agentType: "ads_analyst",
      output: {
        summary: "One campaign needs review.",
        evidence: ["ACOS 42%", "Spend increased 35%"],
        impact: "Margin pressure",
        recommended_actions: [],
        confidence: 0.82
      },
      action: {
        action: "Reduce the bid after approval",
        priority: "P1",
        reason: "ACOS is above target",
        risk: "Traffic may decline",
        needs_human_approval: true
      },
      relatedAsin: "B0TEST1234"
    })).toMatchObject({
      sourceType: "ai_run",
      sourceId: "23",
      taskType: "ad",
      priority: "P1",
      relatedAsin: "B0TEST1234",
      aiRecommendation: "Reduce the bid after approval"
    });
  });

  it("routes Product Research recommendations into competitor work", () => {
    const task = buildAgentActionTask({
      runId: 41,
      agentType: "product_research",
      output: {
        summary: "Category opportunity requires validation.",
        evidence: ["Three low-review products are in Top50."],
        impact: "Possible entry window.",
        recommended_actions: [],
        confidence: 0.68
      },
      action: {
        action: "Validate the median price band",
        priority: "P1",
        reason: "The category has an observable price cluster.",
        risk: "Costs and demand still require confirmation.",
        needs_human_approval: true
      }
    });

    expect(task).toMatchObject({
      sourceType: "ai_run",
      sourceId: "41",
      taskType: "competitor",
      priority: "P1"
    });
  });
});
