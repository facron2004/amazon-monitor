import {
  strategyTagLabels,
  type InsightEventLevel,
  type StrategyTag
} from "@amazon-monitor/shared";

export type WorkflowChartColumn = "todo" | "mid" | "closed";
export type ChartNamedValue = { name: string; value: number };

const chartPlotLeft = 40;
const chartPlotRight = 16;
const chartPlotTop = 18;
const chartPlotBottom = 18;
const pieCenterXRatio = 0.5;
const pieCenterYRatio = 0.43;
const pieInnerRadiusRatio = 0.54;
const pieOuterRadiusRatio = 0.74;
const priorityLevels = new Set<InsightEventLevel>(["P0", "P1", "P2"]);
const workflowColumnByName: Record<string, WorkflowChartColumn> = {
  Todo: "todo",
  "In progress": "mid",
  Closed: "closed"
};

const dueReviewBucketNames = new Set(["Overdue", "Today"]);
const strategyTagByName = new Map<string, StrategyTag>(
  Object.entries(strategyTagLabels).map(([tag, label]) => [label, tag as StrategyTag])
);

export function workflowChartNameToColumn(name: string | null | undefined): WorkflowChartColumn | null {
  if (!name) return null;
  return workflowColumnByName[name] ?? null;
}

export function priorityChartNameToLevel(name: string | null | undefined): InsightEventLevel | null {
  if (!name || !priorityLevels.has(name as InsightEventLevel)) return null;
  return name as InsightEventLevel;
}

export function strategyChartNameToTag(name: string | null | undefined): StrategyTag | null {
  if (!name) return null;
  return strategyTagByName.get(name) ?? null;
}

export function isDueReviewCadenceChartName(name: string | null | undefined): boolean {
  return Boolean(name && dueReviewBucketNames.has(name));
}

export function chartBucketNameFromOffset(
  offsetX: number,
  chartWidth: number,
  bucketNames: readonly string[]
): string | null {
  const plotWidth = chartWidth - chartPlotLeft - chartPlotRight;
  if (plotWidth <= 0 || bucketNames.length === 0) return null;

  const plotX = offsetX - chartPlotLeft;
  if (plotX < 0 || plotX > plotWidth) return null;

  const index = Math.min(bucketNames.length - 1, Math.floor(plotX / (plotWidth / bucketNames.length)));
  return bucketNames[index] ?? null;
}

export function chartBucketNameFromVerticalOffset(
  offsetY: number,
  chartHeight: number,
  bucketNames: readonly string[]
): string | null {
  const plotHeight = chartHeight - chartPlotTop - chartPlotBottom;
  if (plotHeight <= 0 || bucketNames.length === 0) return null;

  const plotY = offsetY - chartPlotTop;
  if (plotY < 0 || plotY > plotHeight) return null;

  const index = Math.min(bucketNames.length - 1, Math.floor(plotY / (plotHeight / bucketNames.length)));
  return bucketNames[index] ?? null;
}

export function pieChartNameFromOffset(
  offsetX: number,
  offsetY: number,
  chartWidth: number,
  chartHeight: number,
  data: readonly ChartNamedValue[]
): string | null {
  const radiusBase = Math.min(chartWidth, chartHeight) / 2;
  const centerX = chartWidth * pieCenterXRatio;
  const centerY = chartHeight * pieCenterYRatio;
  const deltaX = offsetX - centerX;
  const deltaY = offsetY - centerY;
  const radius = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  if (radius < radiusBase * pieInnerRadiusRatio || radius > radiusBase * pieOuterRadiusRatio) return null;

  const total = data.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  if (total <= 0) return null;

  const angleFromRight = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
  const clockwiseFromTop = (angleFromRight + 90 + 360) % 360;
  let cursor = 0;
  for (const item of data) {
    const value = Math.max(0, item.value);
    if (value === 0) continue;
    cursor += (value / total) * 360;
    if (clockwiseFromTop <= cursor) return item.name;
  }
  return data.find((item) => item.value > 0)?.name ?? null;
}
