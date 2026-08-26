import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { AgentOsWorkflowRunner } from "./workflow-runner.js";
import { createStore, initSchema } from "../store.js";

describe("AgentOsWorkflowRunner", () => {
  const databases: DatabaseSync[] = [];

  afterEach(() => {
    for (const db of databases.splice(0)) db.close();
  });

  it("persists a template snapshot, resumes approval, and materializes artifacts", async () => {
    const db = new DatabaseSync(":memory:");
    databases.push(db);
    initSchema(db);
    const store = createStore(db);
    seedFreshCollectionEvidence(store);
    const runner = new AgentOsWorkflowRunner(store);

    const paused = await runner.start({
      organizationId: 1,
      workflowId: "rank-drop-investigation",
      triggerType: "RANK_DROP_EVENT",
      input: { dataQualityStatus: "TRUSTED", rankResponse: "investigate", asin: "B0TEST" },
      idempotencyKey: "runner-rank-1",
    });
    expect(paused.run.status).toBe("PAUSED");
    expect(paused.snapshot.pending?.kind).toBe("approval");
    expect(paused.run.snapshot).not.toBeNull();

    const completed = await runner.resume({
      organizationId: 1,
      runId: paused.run.id,
      input: { approval: "approved" },
    });
    expect(completed.run.status).toBe("COMPLETED");
    expect(completed.actionProposals).toHaveLength(1);
    expect(completed.actionProposals[0]?.status).toBe("PROPOSED");
    expect(completed.memories).toHaveLength(1);
    expect(completed.memories[0]?.sourceWorkflowRunId).toBe(paused.run.id);

    const repeated = await runner.start({
      organizationId: 1,
      workflowId: "rank-drop-investigation",
      triggerType: "RANK_DROP_EVENT",
      input: { dataQualityStatus: "TRUSTED" },
      idempotencyKey: "runner-rank-1",
    });
    expect(repeated.run.id).toBe(paused.run.id);
    expect(store.agentOs.listActionProposals({ organizationId: 1, workflowRunId: paused.run.id })).toHaveLength(1);
    expect(store.agentOs.listMemoryEntries({ organizationId: 1, sourceWorkflowRunId: paused.run.id })).toHaveLength(1);
  });

  it("blocks missing data before creating a paused approval run", async () => {
    const db = new DatabaseSync(":memory:");
    databases.push(db);
    initSchema(db);
    const store = createStore(db);
    store.createDataSource({
      orgId: 1,
      name: "Stale workflow evidence",
      sourceType: "manual",
      status: "connected",
      syncStatus: "success",
      lastSyncedAt: "2020-01-01T00:00:00.000Z",
      lastSuccessAt: "2020-01-01T00:00:00.000Z",
    });
    const runner = new AgentOsWorkflowRunner(store);

    const result = await runner.start({
      organizationId: 1,
      workflowId: "inventory-risk-adjustment",
      triggerType: "STOCKOUT_RISK",
      input: { dataQualityStatus: "STALE" },
    });
    expect(result.run.status).toBe("FAILED");
    expect(result.snapshot.error).toContain("Data quality gate blocked");
    expect(result.actionProposals).toHaveLength(0);
  });

  it("rechecks data quality before resuming a paused run", async () => {
    const db = new DatabaseSync(":memory:");
    databases.push(db);
    initSchema(db);
    const store = createStore(db);
    seedFreshCollectionEvidence(store);
    const runner = new AgentOsWorkflowRunner(store);

    const paused = await runner.start({
      organizationId: 1,
      workflowId: "rank-drop-investigation",
      triggerType: "RANK_DROP_EVENT",
      input: { rankResponse: "investigate" },
      idempotencyKey: "runner-rank-stale-resume-1",
    });
    expect(paused.run.status).toBe("PAUSED");

    store.createDataSource({
      orgId: 1,
      name: "Evidence failed during approval",
      sourceType: "manual",
      status: "connected",
      syncStatus: "failed",
      lastSyncedAt: "2020-01-01T00:00:00.000Z",
      lastSuccessAt: "2020-01-01T00:00:00.000Z",
      syncError: "collector unavailable",
    });

    await expect(runner.resume({
      organizationId: 1,
      runId: paused.run.id,
      input: { approval: "approved" },
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(store.agentOs.getWorkflowRun(paused.run.id, 1)).toMatchObject({ status: "PAUSED" });
    expect(store.agentOs.listActionProposals({ organizationId: 1, workflowRunId: paused.run.id })).toEqual([]);
  });
});

function seedFreshCollectionEvidence(store: ReturnType<typeof createStore>): void {
  for (const taskType of ["keyword", "category"] as const) {
    const job = store.pushJob(taskType, 1, "2026-08-14", 1);
    const claimed = store.claimNextJob(`workflow-test-${taskType}`, 60_000);
    if (!claimed) throw new Error(`Could not claim ${taskType} test job ${job.id}`);
    if (!store.completeJob(claimed.id, claimed.leaseOwner, claimed.leaseToken)) {
      throw new Error(`Could not complete ${taskType} test job ${job.id}`);
    }
  }
}
