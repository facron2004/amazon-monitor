import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Task } from "@amazon-monitor/shared";
import { useTaskStore } from "./tasks";

describe("useTaskStore task merging", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("merges idempotent bulk-created tasks without duplicating existing rows", () => {
    const store = useTaskStore();
    store.mergeTasks([task(2, "Profit validation"), task(1, "VOC validation")]);
    store.mergeTasks([task(3, "Compliance validation"), task(2, "Updated profit validation")]);

    expect(store.tasks.map((item) => item.id)).toEqual([3, 2, 1]);
    expect(store.tasks.find((item) => item.id === 2)?.title).toBe("Updated profit validation");
  });
});

function task(id: number, title: string): Task {
  return {
    id,
    orgId: 1,
    sourceType: "ai_run",
    sourceId: "9",
    title,
    description: "",
    taskType: "other",
    priority: "P1",
    status: "pending",
    assigneeId: null,
    dueDate: null,
    relatedAsin: null,
    relatedKeyword: null,
    relatedBrand: null,
    relatedCategoryId: 4,
    aiRecommendation: null,
    actionTaken: null,
    resultBeforeJson: null,
    resultAfterJson: null,
    reviewNote: null,
    reviewResult: null,
    promotedToSopId: null,
    createdBy: 1,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    completedAt: null,
    reviewedAt: null
  };
}
