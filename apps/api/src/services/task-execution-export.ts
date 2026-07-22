import type { Task, User } from "@amazon-monitor/shared";

const HEADERS = [
  "任务ID",
  "优先级",
  "任务类型",
  "任务标题",
  "任务说明",
  "负责人",
  "截止日期",
  "ASIN",
  "关键词",
  "品牌",
  "AI/规则建议",
  "执行记录",
  "更新时间"
] as const;

export function buildTaskExecutionCsv(tasks: Task[], users: User[]): string {
  const userNames = new Map(users.map((user) => [user.id, user.displayName || user.username]));
  const rows = tasks.map((task) => [
    task.id,
    task.priority,
    task.taskType,
    task.title,
    task.description,
    task.assigneeId === null ? "未分配" : userNames.get(task.assigneeId) ?? `用户 #${task.assigneeId}`,
    task.dueDate,
    task.relatedAsin,
    task.relatedKeyword,
    task.relatedBrand,
    task.aiRecommendation,
    task.actionTaken,
    task.updatedAt
  ]);
  return `\uFEFF${[HEADERS, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
