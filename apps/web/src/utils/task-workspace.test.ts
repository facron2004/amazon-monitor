import { describe, expect, it } from "vitest";
import type { Task } from "@amazon-monitor/shared";
import {
  buildTaskWorkspaceSummary,
  groupTasksByStatus,
  isTaskOverdue,
} from "./task-workspace.js";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    orgId: 1,
    sourceType: "manual",
    sourceId: null,
    title: "检查竞品动作",
    description: "",
    taskType: "competitor",
    priority: "P1",
    status: "pending",
    assigneeId: null,
    dueDate: null,
    relatedAsin: null,
    relatedKeyword: null,
    relatedBrand: null,
    relatedCategoryId: null,
    aiRecommendation: null,
    actionTaken: null,
    resultBeforeJson: null,
    resultAfterJson: null,
    reviewNote: null,
    reviewResult: null,
    promotedToSopId: null,
    createdBy: null,
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt: "2026-07-20T08:00:00.000Z",
    completedAt: null,
    reviewedAt: null,
    ...overrides,
  };
}

describe("task workspace", () => {
  it("groups tasks without dropping empty workflow stages", () => {
    const groups = groupTasksByStatus([
      task({ id: 1, status: "pending" }),
      task({ id: 2, status: "done" }),
    ]);

    expect(groups.pending.map((item) => item.id)).toEqual([1]);
    expect(groups.done.map((item) => item.id)).toEqual([2]);
    expect(groups.in_progress).toEqual([]);
    expect(groups.cancelled).toEqual([]);
  });

  it("summarizes each operational handoff and excludes closed tasks from overdue", () => {
    const tasks = [
      task({ id: 1, status: "pending", dueDate: "2026-07-20" }),
      task({ id: 2, status: "in_progress", dueDate: "2026-07-23" }),
      task({ id: 3, status: "awaiting_review" }),
      task({ id: 4, status: "done" }),
      task({ id: 5, status: "reviewed", dueDate: "2026-07-10" }),
    ];

    expect(buildTaskWorkspaceSummary(tasks, "2026-07-22")).toEqual({
      total: 5,
      pending: 1,
      inProgress: 1,
      awaitingReview: 1,
      awaitingRecap: 1,
      overdue: 1,
    });
    expect(isTaskOverdue(tasks[0], "2026-07-22")).toBe(true);
    expect(isTaskOverdue(tasks[4], "2026-07-22")).toBe(false);
  });
});
