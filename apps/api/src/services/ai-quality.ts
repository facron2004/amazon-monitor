import {
  aiAgentTypes,
  type AiActionFeedback,
  type AiAgentQualityEntry,
  type AiAgentType,
  type AiQualityMetrics,
  type AiQualityResponse,
  type AiRun,
  type Task,
} from "@amazon-monitor/shared";

interface MutableQualityMetrics extends Omit<
  AiQualityMetrics,
  "positiveFeedbackRate" | "runConversionRate" | "taskConfirmationRate"
> {}

function emptyMetrics(): MutableQualityMetrics {
  return {
    runCount: 0,
    successfulRunCount: 0,
    actionableRunCount: 0,
    actionCount: 0,
    feedbackCount: 0,
    positiveFeedbackCount: 0,
    negativeFeedbackCount: 0,
    convertedRunCount: 0,
    reviewedTaskCount: 0,
    confirmedTaskCount: 0,
  };
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

function finalize(metrics: MutableQualityMetrics): AiQualityMetrics {
  return {
    ...metrics,
    positiveFeedbackRate: percentage(
      metrics.positiveFeedbackCount,
      metrics.feedbackCount,
    ),
    runConversionRate: percentage(
      metrics.convertedRunCount,
      metrics.actionableRunCount,
    ),
    taskConfirmationRate: percentage(
      metrics.confirmedTaskCount,
      metrics.reviewedTaskCount,
    ),
  };
}

function addMetrics(
  target: MutableQualityMetrics,
  source: MutableQualityMetrics,
): void {
  target.runCount += source.runCount;
  target.successfulRunCount += source.successfulRunCount;
  target.actionableRunCount += source.actionableRunCount;
  target.actionCount += source.actionCount;
  target.feedbackCount += source.feedbackCount;
  target.positiveFeedbackCount += source.positiveFeedbackCount;
  target.negativeFeedbackCount += source.negativeFeedbackCount;
  target.convertedRunCount += source.convertedRunCount;
  target.reviewedTaskCount += source.reviewedTaskCount;
  target.confirmedTaskCount += source.confirmedTaskCount;
}

export function buildAiQuality(
  runs: AiRun[],
  feedback: AiActionFeedback[],
  tasks: Task[],
  options: {
    windowDays: 7 | 30 | 90;
    rangeStart: string;
    rangeEnd: string;
    generatedAt: string;
  },
): AiQualityResponse {
  const cohortRuns = runs.filter(
    (run) =>
      run.createdAt >= options.rangeStart &&
      run.createdAt <= options.rangeEnd,
  );
  const runsById = new Map(cohortRuns.map((run) => [run.id, run]));
  const metricsByAgent = new Map<AiAgentType, MutableQualityMetrics>();

  for (const run of cohortRuns) {
    const metrics = metricsByAgent.get(run.agentType) ?? emptyMetrics();
    metricsByAgent.set(run.agentType, metrics);
    const actionCount = run.output?.recommended_actions.length ?? 0;
    metrics.runCount += 1;
    if (run.status === "success") metrics.successfulRunCount += 1;
    if (actionCount > 0) metrics.actionableRunCount += 1;
    metrics.actionCount += actionCount;
  }

  for (const item of feedback) {
    const run = runsById.get(item.runId);
    if (!run) continue;
    const metrics = metricsByAgent.get(run.agentType);
    if (!metrics) continue;
    metrics.feedbackCount += 1;
    if (item.value === "up") {
      metrics.positiveFeedbackCount += 1;
    } else {
      metrics.negativeFeedbackCount += 1;
    }
  }

  const convertedRuns = new Set<number>();
  for (const task of tasks) {
    const runId = Number(task.sourceId);
    const run = Number.isInteger(runId) ? runsById.get(runId) : undefined;
    if (!run) continue;
    const metrics = metricsByAgent.get(run.agentType);
    if (!metrics) continue;
    convertedRuns.add(runId);
    if (task.reviewedAt) {
      metrics.reviewedTaskCount += 1;
      if (task.reviewResult === "CONFIRMED") metrics.confirmedTaskCount += 1;
    }
  }

  for (const runId of convertedRuns) {
    const run = runsById.get(runId);
    if (run) metricsByAgent.get(run.agentType)!.convertedRunCount += 1;
  }

  const totals = emptyMetrics();
  const agents: AiAgentQualityEntry[] = aiAgentTypes
    .filter((agentType) => metricsByAgent.has(agentType))
    .map((agentType) => {
      const metrics = metricsByAgent.get(agentType)!;
      addMetrics(totals, metrics);
      return { agentType, ...finalize(metrics) };
    })
    .sort(
      (left, right) =>
        right.runCount - left.runCount ||
        left.agentType.localeCompare(right.agentType),
    );

  return {
    windowDays: options.windowDays,
    rangeStart: options.rangeStart,
    rangeEnd: options.rangeEnd,
    generatedAt: options.generatedAt,
    totals: finalize(totals),
    agents,
  };
}
