import {
  actionStageFilterLabels,
  actionStageFilters,
  attributionTagLabels,
  isActionStageMatch,
  insightReviewResultLabels,
  insightEventStatusLabels,
  insightEventTypeLabels,
  type ActionStageFilter,
  type InsightEvent,
  type InsightEventLevel,
  type InsightEventStatus
} from "@amazon-monitor/shared";

export type ActionSignalFlowTone = "danger" | "warning" | "success" | "info";

export interface ActionSignalFlowRow {
  id: string;
  title: string;
  summary: string;
  level: InsightEventLevel;
  statusLabel: string;
  typeLabel: string;
  driverLabel: string;
  actionStageLabel: string;
  actionStageTone: ActionSignalFlowTone;
  nextActionLabel: string;
  brandLabel: string;
  asinLabel: string;
  timestampLabel: string;
  scoreTotal: number;
  scorePercent: number;
  isReviewDue: boolean;
}

export type ActionSignalFlowStageKey = ActionStageFilter;

export interface ActionSignalFlowStageRow {
  key: ActionSignalFlowStageKey;
  label: string;
  count: number;
  percent: number;
  tone: ActionSignalFlowTone;
  detail: string;
}

export const actionSignalFlowStageLabels: Record<ActionSignalFlowStageKey, string> = actionStageFilterLabels;

export const actionSignalFlowStageOptions: Array<{ value: ActionSignalFlowStageKey; label: string }> = actionStageFilters.map((value) => ({
  value,
  label: actionSignalFlowStageLabels[value]
}));

export interface ActionSignalFlowSummary {
  totalCount: number;
  renderedCount: number;
  dueNowCount: number;
  p0Count: number;
  averageScore: number;
  averageScorePercent: number;
  pressureLabel: string;
  pressureTone: "danger" | "warning" | "success" | "info";
}

const levelWeight: Record<InsightEventLevel, number> = {
  P0: 3,
  P1: 2,
  P2: 1
};
const stageDefinitions: Array<{
  key: ActionSignalFlowStageKey;
  label: string;
  tone: ActionSignalFlowTone;
  detail: string;
}> = [
  { key: "reviewDue", label: actionSignalFlowStageLabels.reviewDue, tone: "danger", detail: "需要先核对判断结果" },
  { key: "unassigned", label: actionSignalFlowStageLabels.unassigned, tone: "warning", detail: "缺负责人会阻断跟进" },
  { key: "ready", label: actionSignalFlowStageLabels.ready, tone: "warning", detail: "可直接推进下一步" },
  { key: "watching", label: actionSignalFlowStageLabels.watching, tone: "info", detail: "等待数据继续变化" },
  { key: "scheduled", label: actionSignalFlowStageLabels.scheduled, tone: "info", detail: "等待复盘窗口" },
  { key: "closed", label: actionSignalFlowStageLabels.closed, tone: "success", detail: "已跟进、已复盘或已忽略" }
];

export function getActionSignalFlowStageRows(
  events: InsightEvent[],
  currentDate: string
): ActionSignalFlowStageRow[] {
  const counts = new Map<ActionSignalFlowStageKey, number>(
    stageDefinitions.map((stage) => [stage.key, 0])
  );

  for (const event of events) {
    const key = getActionSignalFlowStageKey(event, currentDate);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const totalCount = events.length;
  return stageDefinitions.map((stage) => {
    const count = counts.get(stage.key) ?? 0;
    return {
      ...stage,
      count,
      percent: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
    };
  });
}

export function getActionSignalFlowRows(
  events: InsightEvent[],
  currentDate: string,
  limit = 6
): ActionSignalFlowRow[] {
  return [...events]
    .sort((left, right) => {
      const dueDelta = Number(isReviewDue(right, currentDate)) - Number(isReviewDue(left, currentDate));
      if (dueDelta !== 0) return dueDelta;

      const levelDelta = levelWeight[right.eventLevel] - levelWeight[left.eventLevel];
      if (levelDelta !== 0) return levelDelta;

      const scoreDelta = right.scoreTotal - left.scoreTotal;
      if (scoreDelta !== 0) return scoreDelta;

      return right.createdAt.localeCompare(left.createdAt);
    })
    .slice(0, limit)
    .map((event) => {
      const reviewDue = isReviewDue(event, currentDate);
      const actionStage = getActionStage(event.status, Boolean(event.assignee?.trim()), reviewDue);
      return {
        id: event.id,
        title: event.eventTitle,
        summary: event.eventSummary,
        level: event.eventLevel,
        statusLabel: insightEventStatusLabels[event.status],
        typeLabel: insightEventTypeLabels[event.eventType],
        driverLabel: getDriverLabel(event),
        actionStageLabel: actionStage.label,
        actionStageTone: actionStage.tone,
        nextActionLabel: getNextActionLabel(event, reviewDue),
        brandLabel: event.brand?.trim() || "未知品牌",
        asinLabel: event.asin ?? "无 ASIN",
        timestampLabel: getSignalTimestampLabel(event),
        scoreTotal: event.scoreTotal,
        scorePercent: clampScorePercent(event.scoreTotal),
        isReviewDue: reviewDue
      };
    });
}

export function getActionSignalFlowSummary(
  events: InsightEvent[],
  currentDate: string,
  limit = 6
): ActionSignalFlowSummary {
  const dueNowCount = events.filter((event) => isReviewDue(event, currentDate)).length;
  const p0Count = events.filter((event) => event.eventLevel === "P0").length;
  const averageScore = average(events.map((event) => event.scoreTotal));

  return {
    totalCount: events.length,
    renderedCount: Math.min(Math.max(0, limit), events.length),
    dueNowCount,
    p0Count,
    averageScore,
    averageScorePercent: clampScorePercent(averageScore),
    pressureLabel: getPressureLabel(dueNowCount, p0Count, averageScore),
    pressureTone: getPressureTone(dueNowCount, p0Count, averageScore)
  };
}

function isReviewDue(event: InsightEvent, currentDate: string): boolean {
  return event.status !== "REVIEWED" && event.reviewDueDate !== null && Boolean(currentDate) && event.reviewDueDate <= currentDate;
}

export function getActionSignalFlowStageKey(event: InsightEvent, currentDate: string): ActionSignalFlowStageKey {
  return actionStageFilters.find((filter) => isActionStageMatch(event, filter, currentDate)) ?? "scheduled";
}

function getDriverLabel(event: InsightEvent): string {
  if (event.attributionTags.length === 0) return attributionTagLabels.NO_CLEAR_DRIVER;
  return event.attributionTags.slice(0, 2).map((tag) => attributionTagLabels[tag]).join(" / ");
}

function getActionStage(
  status: InsightEventStatus,
  hasAssignee: boolean,
  reviewDue: boolean
): { label: string; tone: ActionSignalFlowTone } {
  if (reviewDue) return { label: "立即复盘", tone: "danger" };
  if (status === "TODO") return { label: hasAssignee ? "可执行" : "待分配", tone: "warning" };
  if (status === "WATCHING") return { label: "观察中", tone: "info" };
  if (status === "REVIEW_PENDING") return { label: "已排期复盘", tone: "warning" };
  if (status === "FOLLOWED") return { label: "已跟进", tone: "success" };
  if (status === "REVIEWED") return { label: "已复盘", tone: "success" };
  return { label: "已忽略", tone: "info" };
}

function getNextActionLabel(event: InsightEvent, reviewDue: boolean): string {
  if (reviewDue) return "打开事件并核对复盘证据。";
  if (!event.assignee?.trim() && event.status !== "REVIEWED" && event.status !== "IGNORED") {
    return "先分配负责人，再推进下一步。";
  }
  if (event.status === "TODO") return event.suggestedAction.trim() || "判断观察、跟进或忽略。";
  if (event.status === "WATCHING") return event.reviewDueDate ? `观察到 ${event.reviewDueDate.slice(5)}。` : "设置 3/7 天复盘日期。";
  if (event.status === "REVIEW_PENDING") return event.reviewDueDate ? `${event.reviewDueDate.slice(5)} 复盘。` : "执行复盘评估。";
  if (event.status === "FOLLOWED") return event.reviewDueDate ? `${event.reviewDueDate.slice(5)} 检查结果。` : "补一个复盘检查点。";
  if (event.status === "REVIEWED") {
    return event.reviewResult ? `复盘结果：${insightReviewResultLabels[event.reviewResult]}。` : "已关闭但没有结果标签。";
  }
  return "无需继续处理。";
}

function getSignalTimestampLabel(event: InsightEvent): string {
  const createdAt = event.createdAt.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(createdAt)) {
    return `${createdAt.slice(5, 10)} ${createdAt.slice(11, 16)}`;
  }
  return event.eventDate.slice(5) || event.eventDate;
}

function clampScorePercent(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function average(values: number[]): number {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return 0;
  return Math.round(finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length);
}

function getPressureLabel(dueNowCount: number, p0Count: number, averageScore: number): string {
  if (dueNowCount > 0) return `${dueNowCount} 个待复盘`;
  if (p0Count > 0) return `${p0Count} 条 P0 信号`;
  if (averageScore >= 70) return "高分信息流";
  if (averageScore > 0) return "常规信息流";
  return "暂无可见信息流";
}

function getPressureTone(
  dueNowCount: number,
  p0Count: number,
  averageScore: number
): ActionSignalFlowSummary["pressureTone"] {
  if (dueNowCount > 0 || p0Count > 0) return "danger";
  if (averageScore >= 70) return "warning";
  if (averageScore > 0) return "success";
  return "info";
}
