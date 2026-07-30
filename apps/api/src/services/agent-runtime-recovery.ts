import type { AgentRun } from "@amazon-monitor/shared";
import type { Store } from "../store.js";

export function recoverInterruptedAgentRuns(store: Store): number {
  const interruptedStatuses: AgentRun["status"][] = [
    "created",
    "planning",
    "checking_data",
    "running_tools",
    "analyzing",
    "executing_action",
  ];
  let recovered = 0;
  for (const organization of store.listOrganizations()) {
    for (const status of interruptedStatuses) {
      const runs = store.listAgentRuns({
        orgId: organization.id,
        status,
        limit: 1000,
      });
      for (const run of runs) {
        if (isCollectionWaitingRecovery(store, run)) continue;
        failInterruptedRun(store, run);
        recovered += 1;
      }
    }
  }
  return recovered;
}

function isCollectionWaitingRecovery(store: Store, run: AgentRun): boolean {
  return run.taskType === "recovery"
    && run.status === "created"
    && store.listAgentRunEvents(run.id).some(
      (event) => event.type === "recovery.waiting_for_collection",
    );
}

function failInterruptedRun(store: Store, run: AgentRun): void {
  const errorMessage =
    "Agent run was interrupted by an API process restart and was not replayed";
  for (const step of store.listAgentSteps(run.id)) {
    if (step.status === "running") {
      store.completeAgentStep(step.id, "failed", errorMessage);
    }
  }
  for (const toolCall of store.listAgentToolCalls(run.id)) {
    if (toolCall.status === "running") {
      store.completeAgentToolCall(toolCall.id, {
        status: "failed",
        errorMessage,
      });
    }
  }
  store.updateAgentRun(run.id, run.orgId, {
    status: "failed",
    errorMessage,
    completedAt: new Date().toISOString(),
  });
  store.appendAgentRunEvent({
    runId: run.id,
    type: "run.interrupted",
    payload: { errorMessage, replayed: false },
  });
}
