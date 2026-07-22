import type { Task } from "@amazon-monitor/shared";

export function buildTaskSopDraft(task: Task): string {
  const target = [
    task.relatedAsin ? `- ASIN：${task.relatedAsin}` : null,
    task.relatedBrand ? `- 品牌：${task.relatedBrand}` : null,
    task.relatedKeyword ? `- 关键词：${task.relatedKeyword}` : null
  ].filter((line): line is string => line !== null);

  const lines = [
    `# ${task.title}`,
    "",
    "## 适用场景",
    task.description || "待补充",
    "",
    "## 触发对象",
    ...(target.length ? target : ["待补充"]),
    "",
    "## AI 建议",
    task.aiRecommendation || "待补充",
    "",
    "## 执行动作",
    task.actionTaken || "待补充",
    "",
    "## 指标变化"
  ];

  if (task.resultBeforeJson) {
    lines.push("执行前：", "```json", task.resultBeforeJson, "```");
  }
  if (task.resultAfterJson) {
    lines.push("执行后：", "```json", task.resultAfterJson, "```");
  }
  if (!task.resultBeforeJson && !task.resultAfterJson) {
    lines.push("待补充");
  }

  lines.push(
    "",
    "## 复盘结论",
    task.reviewNote || "待补充",
    "",
    "## 下次执行检查项",
    "- 核对证据是否仍然成立",
    "- 记录负责人、动作和完成时间",
    "- 复盘关键指标变化"
  );

  return lines.join("\n");
}
