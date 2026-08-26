import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createActionExecutionStore } from "./action-execution-store.js";

const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

describe("Agent OS action execution store", () => {
  it("is idempotent and organization scoped", () => {
    const db = new DatabaseSync(":memory:");
    databases.push(db);
    const store = createActionExecutionStore(db);
    const first = store.createActionExecution({ organizationId: 1, actionProposalId: 10, idempotencyKey: "a-1", executor: "task" });
    expect(store.createActionExecution({ organizationId: 1, actionProposalId: 999, idempotencyKey: "a-1", executor: "ignored" })).toEqual(first);
    const other = store.createActionExecution({ organizationId: 2, actionProposalId: 10, idempotencyKey: "a-1", executor: "task" });
    expect(other.id).not.toBe(first.id);
    expect(store.getActionExecution(first.id, 2)).toBeNull();
  });

  it("enforces state transitions and optimistic versions", () => {
    const db = new DatabaseSync(":memory:");
    databases.push(db);
    const store = createActionExecutionStore(db);
    const first = store.createActionExecution({ organizationId: 1, actionProposalId: 10, idempotencyKey: "a-1", executor: "task" });
    const done = store.updateActionExecution(first.id, 1, { status: "SUCCEEDED", result: null, completedAt: "2026-08-14T00:00:00.000Z", expectedVersion: 1 });
    expect(done).toMatchObject({ status: "SUCCEEDED", version: 2, result: null });
    expect(store.updateActionExecution(first.id, 1, { status: "VERIFIED", expectedVersion: 1 })).toBeNull();
    expect(() => store.updateActionExecution(first.id, 1, { status: "RUNNING", expectedVersion: 2 })).toThrow(/Invalid execution status transition/);
  });
});
