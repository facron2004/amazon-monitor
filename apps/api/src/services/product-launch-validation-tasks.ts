import type {
  AiProductLaunchValidationItem,
  AiProductLaunchValidationTasksResponse,
  AiRun,
  CreateTaskInput,
  Task,
  TaskType
} from "@amazon-monitor/shared";
import type { Store } from "../store.js";

const VALIDATION_TASK_TYPES: Record<string, TaskType> = {
  "Review VOC 与用户问题验证": "review",
  "利润安全线": "price",
  "专利与合规审查": "other",
  "供应链可行性": "supplier"
};

interface CreateProductLaunchValidationTasksInput {
  run: AiRun;
  orgId: number;
  userId: number;
}

export function createProductLaunchValidationTasks(
  store: Store,
  input: CreateProductLaunchValidationTasksInput
): AiProductLaunchValidationTasksResponse {
  const brief = input.run.output?.artifacts?.productLaunchBrief;
  if (input.run.agentType !== "product_research" || input.run.status !== "success" || !brief) {
    throw Object.assign(new Error("Product Research run does not contain a launch brief"), { statusCode: 409 });
  }
  if (brief.decision !== "validate") {
    throw Object.assign(new Error("Launch brief is not ready for validation tasks"), { statusCode: 409 });
  }
  const freshness = input.run.output?.dataFreshness;
  if (
    freshness
    && (
      freshness.freshnessStatus !== "fresh"
      || freshness.syncStatus === "failed"
      || freshness.syncStatus === "partial"
      || freshness.syncStatus === "pending"
    )
  ) {
    throw Object.assign(new Error("Launch brief evidence is stale or incomplete"), { statusCode: 409 });
  }

  const requiredGates = brief.validationChecklist.filter((item) => item.gate === "required");
  if (requiredGates.length === 0) {
    throw Object.assign(new Error("Launch brief has no required validation gates"), { statusCode: 409 });
  }

  const existingTasks = store.listTasks({
    orgId: input.orgId,
    sourceType: "ai_run",
    sourceId: String(input.run.id),
    limit: 1000,
    offset: 0
  });
  const existingByTitle = new Map(existingTasks.map((task) => [task.title, task]));
  const categoryId = parseCategoryId(input.run.inputContextJson);
  const tasks: Task[] = [];
  let createdCount = 0;

  for (const gate of requiredGates) {
    const taskInput = buildValidationTask(input, gate, brief.title, brief.evidenceDate, categoryId);
    const existing = existingByTitle.get(taskInput.title);
    if (existing) {
      tasks.push(existing);
      continue;
    }
    const created = store.createTask(taskInput);
    existingByTitle.set(created.title, created);
    tasks.push(created);
    createdCount += 1;
  }

  return {
    runId: input.run.id,
    requiredGateCount: requiredGates.length,
    createdCount,
    existingCount: requiredGates.length - createdCount,
    tasks
  };
}

function buildValidationTask(
  input: CreateProductLaunchValidationTasksInput,
  gate: AiProductLaunchValidationItem,
  briefTitle: string,
  evidenceDate: string,
  categoryId: number | null
): CreateTaskInput {
  return {
    orgId: input.orgId,
    sourceType: "ai_run",
    sourceId: String(input.run.id),
    title: `[新品立项] ${gate.item}`,
    description: [
      `来源草案：${briefTitle}`,
      `证据日期：${evidenceDate}`,
      `立项门槛：${gate.item}`,
      `验收证据：${gate.evidenceRequired}`,
      "完成并复核证据前，不得视为通过立项。"
    ].join("\n"),
    taskType: VALIDATION_TASK_TYPES[gate.item] ?? "other",
    priority: "P1",
    relatedCategoryId: categoryId,
    aiRecommendation: `补齐并复核“${gate.item}”证据：${gate.evidenceRequired}`,
    createdBy: input.userId
  };
}

function parseCategoryId(inputContextJson: string): number | null {
  try {
    const value: unknown = JSON.parse(inputContextJson);
    if (!value || typeof value !== "object" || !("categoryId" in value)) return null;
    const categoryId = (value as { categoryId?: unknown }).categoryId;
    return typeof categoryId === "number" && Number.isInteger(categoryId) && categoryId > 0
      ? categoryId
      : null;
  } catch {
    return null;
  }
}
