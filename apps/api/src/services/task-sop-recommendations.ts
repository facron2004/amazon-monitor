import {
  sopCategoryLabels,
  taskTypeLabels,
  taskTypeSopCategory,
  type Sop,
  type Task,
  type TaskSopRecommendation,
} from "@amazon-monitor/shared";

interface MatchContext {
  label: string;
  value: string;
}

const DEFAULT_LIMIT = 3;

export function buildTaskSopRecommendations(
  task: Task,
  sops: Sop[],
  limit = DEFAULT_LIMIT,
): TaskSopRecommendation[] {
  const expectedCategory = taskTypeSopCategory[task.taskType];
  const context = buildMatchContext(task);

  return sops
    .filter(
      (sop) =>
        sop.status === "published" &&
        sop.sourceTaskId !== task.id,
    )
    .map((sop) => scoreSop(sop, expectedCategory, context))
    .filter(
      (recommendation): recommendation is TaskSopRecommendation =>
        recommendation !== null,
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.sop.updatedAt.localeCompare(left.sop.updatedAt) ||
        right.sop.id - left.sop.id,
    )
    .slice(0, Math.max(0, limit));
}

function scoreSop(
  sop: Sop,
  expectedCategory: Sop["category"],
  context: MatchContext[],
): TaskSopRecommendation | null {
  let score = 0;
  const matchReasons: string[] = [];
  const normalizedTags = new Set(sop.tags.map(normalize));
  const normalizedContent = normalize(`${sop.title}\n${sop.bodyMd}`);

  if (sop.category === expectedCategory) {
    score += expectedCategory === "general" ? 30 : 50;
    matchReasons.push(`任务类型匹配：${sopCategoryLabels[expectedCategory]}`);
  }

  for (const item of context) {
    const normalizedValue = normalize(item.value);
    if (!normalizedValue) continue;
    if (normalizedTags.has(normalizedValue)) {
      score += 20;
      matchReasons.push(`标签匹配：${item.label}`);
      continue;
    }
    if (normalizedContent.includes(normalizedValue)) {
      score += 8;
      matchReasons.push(`内容匹配：${item.label}`);
    }
  }

  if (score === 0) return null;
  return {
    sop,
    score: Math.min(100, score),
    matchReasons,
  };
}

function buildMatchContext(task: Task): MatchContext[] {
  const context: MatchContext[] = [
    {
      label: taskTypeLabels[task.taskType],
      value: task.taskType,
    },
  ];
  if (task.relatedAsin) {
    context.push({ label: `ASIN ${task.relatedAsin}`, value: task.relatedAsin });
  }
  if (task.relatedBrand) {
    context.push({ label: `品牌 ${task.relatedBrand}`, value: task.relatedBrand });
  }
  if (task.relatedKeyword) {
    context.push({
      label: `关键词 ${task.relatedKeyword}`,
      value: task.relatedKeyword,
    });
  }
  return context;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
