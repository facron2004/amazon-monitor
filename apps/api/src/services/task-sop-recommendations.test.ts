import { describe, expect, it } from "vitest";
import type { Sop, Task } from "@amazon-monitor/shared";
import { buildTaskSopRecommendations } from "./task-sop-recommendations.js";

const task: Task = {
  id: 11,
  orgId: 1,
  sourceType: "manual",
  sourceId: null,
  title: "Reduce Acme bid",
  description: "",
  taskType: "ad",
  priority: "P1",
  status: "in_progress",
  assigneeId: null,
  dueDate: null,
  relatedAsin: "B0MATCH123",
  relatedKeyword: "ice maker",
  relatedBrand: "Acme",
  relatedCategoryId: null,
  aiRecommendation: null,
  actionTaken: null,
  resultBeforeJson: null,
  resultAfterJson: null,
  reviewNote: null,
  reviewResult: null,
  promotedToSopId: null,
  createdBy: 1,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  completedAt: null,
  reviewedAt: null,
};

describe("buildTaskSopRecommendations", () => {
  it("ranks published SOPs using explainable category and structured-context matches", () => {
    const recommendations = buildTaskSopRecommendations(task, [
      sop(1, {
        category: "ad_optimization",
        tags: ["ad", "B0MATCH123", "Acme"],
      }),
      sop(2, {
        category: "general",
        tags: ["ice maker"],
      }),
      sop(3, {
        category: "ad_optimization",
        status: "draft",
      }),
      sop(4, {
        category: "ad_optimization",
        sourceTaskId: task.id,
      }),
    ]);

    expect(recommendations.map((item) => item.sop.id)).toEqual([1, 2]);
    expect(recommendations[0]).toMatchObject({
      score: 100,
      matchReasons: [
        "任务类型匹配：广告优化",
        "标签匹配：广告",
        "标签匹配：ASIN B0MATCH123",
        "标签匹配：品牌 Acme",
      ],
    });
    expect(recommendations[1].matchReasons).toEqual([
      "标签匹配：关键词 ice maker",
    ]);
  });

  it("uses structured content matches for older SOPs without tags", () => {
    const recommendations = buildTaskSopRecommendations(task, [
      sop(5, {
        category: "general",
        bodyMd: "Apply this playbook to B0MATCH123 after checking margin.",
      }),
    ]);

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].matchReasons).toEqual([
      "内容匹配：ASIN B0MATCH123",
    ]);
  });
});

function sop(id: number, overrides: Partial<Sop> = {}): Sop {
  return {
    id,
    orgId: 1,
    title: `SOP ${id}`,
    category: "general",
    bodyMd: "# Steps",
    sourceTaskId: null,
    status: "published",
    tags: [],
    createdBy: 1,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: `2026-07-0${id}T00:00:00.000Z`,
    ...overrides,
  };
}
