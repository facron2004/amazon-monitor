import {
  isActionScoreDriverMatch,
  type ActionScoreDriverFilter,
  type InsightEvent
} from "@amazon-monitor/shared";

export { isActionScoreDriverMatch };
export type { ActionScoreDriverFilter };

export type ActionScoreBreakdownKey =
  | "rankingScore"
  | "productScore"
  | "promoScore"
  | "brandScore"
  | "riskScore";

export interface ActionScoreBreakdownRow {
  key: ActionScoreBreakdownKey;
  label: string;
  value: number;
  max: number;
  percent: number;
  color: string;
}

export interface ActionScoreCompositionRow {
  key: ActionScoreBreakdownKey;
  label: string;
  value: number;
  percent: number;
  color: string;
}

export const actionScoreAxes: Array<Omit<ActionScoreBreakdownRow, "value" | "percent">> = [
  { key: "rankingScore", label: "排名动能", max: 35, color: "#2563eb" },
  { key: "productScore", label: "商品机会", max: 25, color: "#0f766e" },
  { key: "promoScore", label: "活动/价格", max: 20, color: "#f97316" },
  { key: "brandScore", label: "品牌矩阵", max: 15, color: "#7c3aed" },
  { key: "riskScore", label: "核心风险", max: 15, color: "#dc2626" }
];

export const actionScoreDriverLabels: Record<ActionScoreDriverFilter, string> = Object.fromEntries(
  actionScoreAxes.map((axis) => [axis.key, axis.label])
) as Record<ActionScoreDriverFilter, string>;

export const actionScoreDriverOptions: Array<{ value: ActionScoreDriverFilter; label: string }> = actionScoreAxes.map((axis) => ({
  value: axis.key,
  label: axis.label
}));

export function getActionScoreBreakdownRows(event: InsightEvent): ActionScoreBreakdownRow[] {
  return actionScoreAxes.map((axis) => {
    const value = event.scoreBreakdown[axis.key];
    return {
      ...axis,
      value,
      percent: scorePercent(value, axis.max)
    };
  });
}

export function getTopActionScoreDrivers(event: InsightEvent, limit = 2): ActionScoreBreakdownRow[] {
  return getActionScoreBreakdownRows(event)
    .filter((row) => row.value > 0)
    .sort((left, right) => (
      right.value - left.value
      || right.percent - left.percent
      || left.label.localeCompare(right.label)
    ))
    .slice(0, limit);
}

export function getActionScoreCompositionRows(events: InsightEvent[]): ActionScoreCompositionRow[] {
  const totals = actionScoreAxes.map((axis) => ({
    key: axis.key,
    label: axis.label,
    value: events.reduce((sum, event) => sum + event.scoreBreakdown[axis.key], 0),
    color: axis.color
  }));
  const totalScore = totals.reduce((sum, row) => sum + row.value, 0);

  return totals.map((row) => ({
    ...row,
    percent: totalScore > 0 ? Math.round((row.value / totalScore) * 100) : 0
  }));
}

function scorePercent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}
