import { describe, expect, it } from "vitest";
import type { AiActionFeedback } from "@amazon-monitor/shared";
import { replaceAiActionFeedback } from "./ai-action-feedback";

const feedback = (actionIndex: number, value: "up" | "down"): AiActionFeedback => ({
  runId: 7,
  orgId: 2,
  userId: 3,
  actionIndex,
  value,
  updatedAt: "2026-07-16T00:00:00.000Z"
});

describe("replaceAiActionFeedback", () => {
  it("adds feedback without changing other action labels", () => {
    expect(replaceAiActionFeedback([feedback(0, "up")], feedback(1, "down"))).toEqual([
      feedback(0, "up"),
      feedback(1, "down")
    ]);
  });

  it("replaces the current user's label for the same action", () => {
    expect(replaceAiActionFeedback([feedback(0, "up"), feedback(1, "up")], feedback(0, "down"))).toEqual([
      feedback(1, "up"),
      feedback(0, "down")
    ]);
  });
});
