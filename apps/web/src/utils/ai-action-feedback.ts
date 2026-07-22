import type { AiActionFeedback } from "@amazon-monitor/shared";

export function replaceAiActionFeedback(
  current: AiActionFeedback[],
  feedback: AiActionFeedback
): AiActionFeedback[] {
  return [
    ...current.filter((item) => item.actionIndex !== feedback.actionIndex),
    feedback
  ];
}
