import {
  attributionTagLabels,
  insightEventTypeLabels,
  insightReviewResultLabels,
  strategyTagLabels,
  type AttributionTag,
  type InsightEventType,
  type InsightReviewResult,
  type InsightEventLevel,
  type StrategyTag
} from "@amazon-monitor/shared";
import {
  actionEvidenceMovementFilterLabels,
  type ActionEvidenceMovementFilter
} from "./actionCenterEvidenceDeltas";
import {
  reviewCadenceBucketLabels,
  type ReviewCadenceBucketKey
} from "./actionCenterReviewCadence";
import {
  actionScoreDriverLabels,
  type ActionScoreDriverFilter
} from "./actionCenterScoreBreakdown";

export type WorkflowChartColumn = "todo" | "mid" | "closed";
export type ChartNamedValue = { name: string; value: number };

const chartPlotLeft = 40;
const chartPlotRight = 16;
const chartPlotTop = 18;
const chartPlotBottom = 18;
const scoreChartPlotLeft = 72;
const scoreChartPlotRight = 18;
const pieCenterXRatio = 0.5;
const pieCenterYRatio = 0.43;
const pieInnerRadiusRatio = 0.54;
const pieOuterRadiusRatio = 0.74;
const priorityLevels = new Set<InsightEventLevel>(["P0", "P1", "P2"]);
const workflowColumnByName: Record<string, WorkflowChartColumn> = {
  Todo: "todo",
  "In progress": "mid",
  Closed: "closed",
  "待处理": "todo",
  "处理中": "mid",
  "已关闭": "closed"
};

const attributionTagByName = new Map<string, AttributionTag>(
  Object.entries(attributionTagLabels).map(([tag, label]) => [label, tag as AttributionTag])
);
const eventTypeByName = new Map<string, InsightEventType>(
  Object.entries(insightEventTypeLabels).map(([type, label]) => [label, type as InsightEventType])
);
const evidenceMovementByName = new Map<string, ActionEvidenceMovementFilter>(
  Object.entries(actionEvidenceMovementFilterLabels).map(([filter, label]) => [label, filter as ActionEvidenceMovementFilter])
);
const scoreDriverByName = new Map<string, ActionScoreDriverFilter>(
  Object.entries(actionScoreDriverLabels).map(([filter, label]) => [label, filter as ActionScoreDriverFilter])
);
const strategyTagByName = new Map<string, StrategyTag>(
  Object.entries(strategyTagLabels).map(([tag, label]) => [label, tag as StrategyTag])
);
const reviewResultByName = new Map<string, InsightReviewResult>(
  Object.entries(insightReviewResultLabels).map(([result, label]) => [label, result as InsightReviewResult])
);
const reviewCadenceByName = new Map<string, ReviewCadenceBucketKey>(
  Object.entries(reviewCadenceBucketLabels).map(([bucket, label]) => [label, bucket as ReviewCadenceBucketKey])
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

export function attributionChartNameToTag(name: string | null | undefined): AttributionTag | null {
  if (!name) return null;
  return attributionTagByName.get(name) ?? null;
}

export function eventTypeChartNameToType(name: string | null | undefined): InsightEventType | null {
  if (!name) return null;
  return eventTypeByName.get(name) ?? null;
}

export function evidenceMovementChartNameToFilter(name: string | null | undefined): ActionEvidenceMovementFilter | null {
  if (!name) return null;
  return evidenceMovementByName.get(name) ?? null;
}

export function scoreDriverChartNameToFilter(name: string | null | undefined): ActionScoreDriverFilter | null {
  if (!name) return null;
  return scoreDriverByName.get(name) ?? null;
}

export function reviewOutcomeChartNameToResult(name: string | null | undefined): InsightReviewResult | null {
  if (!name) return null;
  return reviewResultByName.get(name) ?? null;
}

export function reviewCadenceChartNameToFilter(name: string | null | undefined): ReviewCadenceBucketKey | null {
  if (!name) return null;
  return reviewCadenceByName.get(name) ?? null;
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

export function stackedScoreChartNameFromOffset(
  offsetX: number,
  chartWidth: number,
  data: readonly ChartNamedValue[]
): string | null {
  const plotWidth = chartWidth - scoreChartPlotLeft - scoreChartPlotRight;
  if (plotWidth <= 0 || data.length === 0) return null;

  const plotX = offsetX - scoreChartPlotLeft;
  if (plotX < 0 || plotX > plotWidth) return null;

  const total = data.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  if (total <= 0) return null;

  const valueAtPointer = (plotX / plotWidth) * total;
  let cursor = 0;
  for (const item of data) {
    const value = Math.max(0, item.value);
    if (value === 0) continue;
    cursor += value;
    if (valueAtPointer <= cursor) return item.name;
  }
  return data.find((item) => item.value > 0)?.name ?? null;
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
