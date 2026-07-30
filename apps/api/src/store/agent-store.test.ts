import { beforeEach, describe, expect, it } from "vitest";
import { openAppStore } from "../store.js";

describe("AgentStore", () => {
  let store: ReturnType<typeof openAppStore>;

  beforeEach(() => {
    store = openAppStore(":memory:");
    store.reset();
  });

  function createIdentity(name = "Agent organization") {
    const org = store.createOrganization({ name });
    const user = store.createUser({
      orgId: org.id,
      username: `${name.replace(/\W+/g, "-").toLowerCase()}-user`,
      password: "password-1234",
      role: "operator",
    });
    return { org, user };
  }

  it("persists organization-scoped sessions, messages, runs, and monotonic events", () => {
    const first = createIdentity();
    const second = createIdentity("Second organization");
    const session = store.createAgentSession({
      orgId: first.org.id,
      userId: first.user.id,
      title: "ASIN investigation",
    });
    const run = store.createAgentRun({
      sessionId: session.id,
      orgId: first.org.id,
      userId: first.user.id,
      taskType: "investigation",
      input: "Investigate B000TEST01",
      model: "gpt-5.6-sol",
      fallbackModel: "gpt-5.6-terra",
    });

    store.appendAgentMessage({
      sessionId: session.id,
      runId: run.id,
      role: "user",
      content: run.input,
    });
    const firstEvent = store.appendAgentRunEvent({
      runId: run.id,
      type: "run.created",
    });
    const secondEvent = store.appendAgentRunEvent({
      runId: run.id,
      type: "freshness.started",
    });
    const step = store.createAgentStep({
      runId: run.id,
      title: "Check freshness",
    });
    const toolCall = store.createAgentToolCall({
      runId: run.id,
      stepId: step.id,
      toolName: "check_data_freshness",
      arguments: { datasets: ["category"] },
    });
    store.completeAgentToolCall(toolCall.id, {
      status: "failed",
      errorMessage: "temporary timeout",
    });
    store.completeAgentStep(step.id, "completed");

    expect(store.getAgentSession(session.id, first.org.id)?.id).toBe(session.id);
    expect(store.getAgentSession(session.id, second.org.id)).toBeNull();
    expect(store.getAgentRun(run.id, second.org.id)).toBeNull();
    expect(store.listAgentMessages(session.id)).toHaveLength(1);
    expect([firstEvent.sequence, secondEvent.sequence]).toEqual([1, 2]);
    expect(store.listAgentRunEvents(run.id, 1)).toEqual([
      expect.objectContaining({ sequence: 2, type: "freshness.started" }),
    ]);
    expect(store.listAgentSteps(run.id)).toEqual([
      expect.objectContaining({ sequence: 1, status: "completed" }),
    ]);
    expect(store.listAgentToolCalls(run.id)).toEqual([
      expect.objectContaining({
        toolName: "check_data_freshness",
        status: "failed",
        errorMessage: "temporary timeout",
      }),
    ]);
  });

  it("stores structured output and enforces proposal and execution idempotency", () => {
    const { org, user } = createIdentity();
    const session = store.createAgentSession({
      orgId: org.id,
      userId: user.id,
      title: "Daily patrol",
    });
    const run = store.createAgentRun({
      sessionId: session.id,
      orgId: org.id,
      userId: user.id,
      taskType: "patrol",
      input: "Run daily patrol",
      model: "gpt-5.6-sol",
      fallbackModel: "gpt-5.6-terra",
    });
    const completed = store.updateAgentRun(run.id, org.id, {
      status: "completed",
      output: {
        summary: "No fresh evidence",
        conclusions: [],
        freshness: {
          status: "missing",
          checkedAt: "2026-07-29T10:00:00.000Z",
          maxAgeHours: 24,
          oldestEvidenceAt: null,
          staleSources: [],
          dataGaps: ["category_snapshot"],
          warnings: ["Recollection required"],
        },
        riskNotes: ["Do not form a deterministic conclusion"],
        recommendedActions: [],
      },
      completedAt: "2026-07-29T10:00:01.000Z",
    });
    expect(completed?.output?.freshness.status).toBe("missing");

    const input = {
      runId: run.id,
      orgId: org.id,
      actionType: "recollect" as const,
      title: "Refresh category evidence",
      payload: { categoryId: 42 },
      riskLevel: "L2" as const,
      idempotencyKey: `agent-run:${run.id}:recollect:42`,
    };
    const first = store.createActionProposal(input);
    const duplicate = store.createActionProposal(input);
    expect(duplicate.id).toBe(first.id);

    const approved = store.decideActionProposal(first.id, org.id, 1, {
      userId: user.id,
      decision: "approved",
    });
    expect(approved?.proposal.expectedVersion).toBe(2);
    expect(approved?.approval.decision).toBe("approved");
    expect(store.decideActionProposal(first.id, org.id, 1, {
      userId: user.id,
      decision: "rejected",
    })).toBeNull();
    expect(store.listActionApprovals(first.id)).toHaveLength(1);

    const started = store.beginActionExecution({
      proposalId: first.id,
      orgId: org.id,
      expectedVersion: 2,
      idempotencyKey: first.idempotencyKey,
    });
    expect(started).toMatchObject({
      proposal: { status: "executing", expectedVersion: 3 },
      execution: { status: "executing" },
    });
    expect(store.finishActionExecution({
      executionId: started!.execution.id,
      proposalId: first.id,
      orgId: org.id,
      expectedVersion: 999,
      executionStatus: "completed",
      proposalStatus: "completed",
      result: { taskId: 1 },
    })).toBeNull();
    expect(store.getActionExecutionByKey(first.idempotencyKey)?.status).toBe("executing");
    expect(store.getActionProposal(first.id, org.id)?.status).toBe("executing");

    const finished = store.finishActionExecution({
      executionId: started!.execution.id,
      proposalId: first.id,
      orgId: org.id,
      expectedVersion: 3,
      executionStatus: "completed",
      proposalStatus: "completed",
      result: { taskId: 1 },
    });
    expect(finished).toMatchObject({
      proposal: { status: "completed", expectedVersion: 4 },
      execution: { status: "completed", result: { taskId: 1 } },
    });

    const execution = store.createActionExecution({
      proposalId: first.id,
      idempotencyKey: first.idempotencyKey,
    });
    const repeated = store.createActionExecution({
      proposalId: first.id,
      idempotencyKey: first.idempotencyKey,
    });
    expect(repeated.id).toBe(execution.id);
  });
});
