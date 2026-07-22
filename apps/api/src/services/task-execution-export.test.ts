import { describe, expect, it } from "vitest";
import type { Task, User } from "@amazon-monitor/shared";
import { buildTaskExecutionCsv } from "./task-execution-export.js";

describe("task execution CSV", () => {
  it("exports execution context with an Excel BOM and formula-safe cells", () => {
    const csv = buildTaskExecutionCsv([
      task({ title: "=HYPERLINK(\"bad\")", description: "Line one\nLine two", assigneeId: 7 })
    ], [user(7, "Operator Chen")]);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"任务ID","优先级","任务类型"');
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"Line one\nLine two"');
    expect(csv).toContain('"Operator Chen"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

function task(overrides: Partial<Task>): Task {
  return {
    id: 12,
    orgId: 1,
    sourceType: "manual",
    sourceId: null,
    title: "Prepare campaign",
    description: "",
    taskType: "other",
    priority: "P1",
    status: "in_progress",
    assigneeId: null,
    dueDate: "2026-07-20",
    relatedAsin: "B0EXPORT001",
    relatedKeyword: null,
    relatedBrand: "Northstar",
    relatedCategoryId: null,
    aiRecommendation: "Confirm before execution",
    actionTaken: null,
    resultBeforeJson: null,
    resultAfterJson: null,
    reviewNote: null,
    reviewResult: null,
    promotedToSopId: null,
    createdBy: 1,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T01:00:00.000Z",
    completedAt: null,
    reviewedAt: null,
    ...overrides
  };
}

function user(id: number, displayName: string): User {
  return {
    id,
    orgId: 1,
    username: `user-${id}`,
    displayName,
    role: "operator",
    status: "active",
    email: null,
    lastLoginAt: null,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z"
  };
}
