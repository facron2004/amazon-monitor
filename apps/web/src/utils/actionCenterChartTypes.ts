import type {
  ActionEvidenceMovementFilter,
  ActionScoreDriverFilter,
  InsightEventTrendPoint,
  StrategyTag,
} from "@amazon-monitor/shared";

export type ChartDatum = {
  name: string;
  value: number;
  [key: string]: unknown;
};
export type EchartsSeriesData = Array<number | ChartDatum>;

export interface ActionCenterSeries {
  name: string;
  type: "bar" | "line" | "pie";
  data: EchartsSeriesData;
  [key: string]: unknown;
}

export interface ReviewCadencePriorityDatum {
  name: string;
  total: number;
  P0: number;
  P1: number;
  P2: number;
}

export interface BrandActionPressureRow {
  brand: string;
  value: number;
  eventCount: number;
  p0Count: number;
  matrixSurgeCount: number;
  matrixDropCount: number;
  brandTop100ShareChange: number | null;
  topEventId: string;
  topEventTitle: string;
  canFocus: boolean;
}

export interface ActionStrategyFocusRow {
  tag: StrategyTag;
  name: string;
  value: number;
}

export interface ActionChartSummary {
  visibleCount: number;
  openCount: number;
  reviewedCount: number;
  topScoreDriver: {
    key: ActionScoreDriverFilter;
    label: string;
    value: number;
    percent: number;
  } | null;
  topEvidenceMovement: {
    filter: ActionEvidenceMovementFilter;
    label: string;
    value: number;
  } | null;
  topBrandPressure: {
    brand: string;
    value: number;
    eventCount: number;
    p0Count: number;
    matrixSurgeCount: number;
    matrixDropCount: number;
    brandTop100ShareChange: number | null;
    canFocus: boolean;
  } | null;
  topStrategyFocus: {
    tag: StrategyTag;
    label: string;
    value: number;
  } | null;
  latestTrend: InsightEventTrendPoint | null;
  trendDelta: number | null;
}

export interface ActionReviewQueueSummary {
  totalCount: number;
  dueNowCount: number;
  overdueCount: number;
  todayCount: number;
  p0DueCount: number;
  dueNowPercent: number;
  healthLabel: string;
  healthTone: "danger" | "warning" | "success" | "info";
}

export interface ActionChartCaptions {
  workflow: string;
  priority: string;
  brandPressure: string;
  eventType: string;
  score: string;
  evidenceMovement: string;
  attribution: string;
  strategy: string;
  reviewCadence: string;
  trend: string;
  reviewOutcome: string;
}

export type ActionChartTakeawayTone = "success" | "warning" | "info" | "error";

export interface ActionChartTakeaway {
  key: "pressure" | "driver" | "followUp";
  label: string;
  title: string;
  detail: string;
  tone: ActionChartTakeawayTone;
  actionLabel: string;
}

export type ActionChartPathStepKey =
  "scope" | "pressure" | "driver" | "followUp";
export type ActionChartPathStepStatus =
  "wait" | "process" | "finish" | "error" | "success";

export interface ActionChartPathStep {
  key: ActionChartPathStepKey;
  label: string;
  title: string;
  detail: string;
  status: ActionChartPathStepStatus;
  actionLabel: string;
}
