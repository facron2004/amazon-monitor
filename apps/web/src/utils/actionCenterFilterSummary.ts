import {
  insightEventStatusLabels,
  insightEventTypeLabels,
  insightReviewResultLabels,
  attributionTagLabels,
  strategyTagLabels
} from "@amazon-monitor/shared";
import type { InsightEventFilters } from "../stores/insightEvents";
import { actionEvidenceMovementFilterLabels } from "./actionCenterEvidenceDeltas";
import { reviewCadenceBucketLabels } from "./actionCenterReviewCadence";
import { actionScoreDriverLabels } from "./actionCenterScoreBreakdown";
import { actionSignalFlowStageLabels } from "./actionCenterSignalFlow";

export type ActionFilterKey =
  | "level"
  | "status"
  | "eventType"
  | "reviewResult"
  | "attributionTag"
  | "evidenceMovement"
  | "reviewCadence"
  | "actionStage"
  | "scoreDriver"
  | "strategyTag"
  | "brand"
  | "asin"
  | "assignee"
  | "unassignedOnly"
  | "coreOnly"
  | "newBreakoutOnly"
  | "reviewDueOnly"
  | "sortBy";

export interface ActionFilterBadge {
  key: ActionFilterKey;
  label: string;
  value: string;
}

export interface ActionFilterSummaryStats {
  visibleCount: number;
  asinCaseCount: number;
  activeFilterCount: number;
  scopeLabel: string;
  scopeTone: "success" | "warning" | "info";
  filterDepthPercent: number;
  eventsPerCase: number;
}

const sortLabels: Record<InsightEventFilters["sortBy"], string> = {
  score: "机会分",
  level: "事件等级",
  rankChange: "排名变化",
  reviewChange: "Review 增量",
  createdAt: "创建时间"
};

export function getActionFilterBadges(filters: InsightEventFilters): ActionFilterBadge[] {
  const badges: ActionFilterBadge[] = [];
  if (filters.level) badges.push({ key: "level", label: "等级", value: filters.level });
  if (filters.status) badges.push({ key: "status", label: "状态", value: insightEventStatusLabels[filters.status] });
  if (filters.eventType) badges.push({ key: "eventType", label: "类型", value: insightEventTypeLabels[filters.eventType] });
  if (filters.reviewResult) badges.push({ key: "reviewResult", label: "复盘结果", value: insightReviewResultLabels[filters.reviewResult] });
  if (filters.attributionTag) badges.push({ key: "attributionTag", label: "归因", value: attributionTagLabels[filters.attributionTag] });
  if (filters.evidenceMovement) badges.push({ key: "evidenceMovement", label: "证据变化", value: actionEvidenceMovementFilterLabels[filters.evidenceMovement] });
  if (filters.reviewCadence) badges.push({ key: "reviewCadence", label: "复盘窗口", value: reviewCadenceBucketLabels[filters.reviewCadence] });
  if (filters.actionStage) badges.push({ key: "actionStage", label: "行动阶段", value: actionSignalFlowStageLabels[filters.actionStage] });
  if (filters.scoreDriver) badges.push({ key: "scoreDriver", label: "评分驱动", value: actionScoreDriverLabels[filters.scoreDriver] });
  if (filters.strategyTag) badges.push({ key: "strategyTag", label: "策略", value: strategyTagLabels[filters.strategyTag] });
  if (filters.brand.trim()) badges.push({ key: "brand", label: "品牌", value: filters.brand.trim() });
  if (filters.asin.trim()) badges.push({ key: "asin", label: "ASIN", value: filters.asin.trim() });
  if (filters.assignee.trim() && !filters.unassignedOnly) {
    badges.push({ key: "assignee", label: "负责人", value: filters.assignee.trim() });
  }
  if (filters.unassignedOnly) badges.push({ key: "unassignedOnly", label: "负责人", value: "未分配" });
  if (filters.coreOnly) badges.push({ key: "coreOnly", label: "观察", value: "核心竞品" });
  if (filters.newBreakoutOnly) badges.push({ key: "newBreakoutOnly", label: "信号", value: "新品黑马" });
  if (filters.reviewDueOnly) badges.push({ key: "reviewDueOnly", label: "队列", value: "待复盘" });
  if (filters.sortBy !== "score") badges.push({ key: "sortBy", label: "排序", value: sortLabels[filters.sortBy] });
  return badges;
}

export function getActionFilterSummaryStats(
  filters: InsightEventFilters,
  visibleCount: number,
  asinCaseCount: number
): ActionFilterSummaryStats {
  const activeFilterCount = getActionFilterBadges(filters).length;
  const hasVisibleEvents = visibleCount > 0;
  return {
    visibleCount,
    asinCaseCount,
    activeFilterCount,
    scopeLabel: activeFilterCount > 0 ? "聚焦视图" : "全局行动视图",
    scopeTone: !hasVisibleEvents ? "warning" : activeFilterCount > 0 ? "success" : "info",
    filterDepthPercent: Math.min(100, Math.round((activeFilterCount / 8) * 100)),
    eventsPerCase: asinCaseCount > 0 ? Number((visibleCount / asinCaseCount).toFixed(1)) : 0
  };
}

export function clearActionFilter(filters: InsightEventFilters, key: ActionFilterKey): InsightEventFilters {
  const next = { ...filters };
  if (key === "level") next.level = "";
  if (key === "status") next.status = "";
  if (key === "eventType") next.eventType = "";
  if (key === "reviewResult") next.reviewResult = "";
  if (key === "attributionTag") next.attributionTag = "";
  if (key === "evidenceMovement") next.evidenceMovement = "";
  if (key === "reviewCadence") next.reviewCadence = "";
  if (key === "actionStage") next.actionStage = "";
  if (key === "scoreDriver") next.scoreDriver = "";
  if (key === "strategyTag") next.strategyTag = "";
  if (key === "brand") next.brand = "";
  if (key === "asin") next.asin = "";
  if (key === "assignee") next.assignee = "";
  if (key === "unassignedOnly") next.unassignedOnly = false;
  if (key === "coreOnly") next.coreOnly = false;
  if (key === "newBreakoutOnly") next.newBreakoutOnly = false;
  if (key === "reviewDueOnly") next.reviewDueOnly = false;
  if (key === "sortBy") next.sortBy = "score";
  return next;
}

export function clearActionFilters(filters: InsightEventFilters): InsightEventFilters {
  return {
    ...filters,
    level: "",
    status: "",
    eventType: "",
    reviewResult: "",
    strategyTag: "",
    evidenceMovement: "",
    reviewCadence: "",
    actionStage: "",
    scoreDriver: "",
    brand: "",
    asin: "",
    assignee: "",
    attributionTag: "",
    unassignedOnly: false,
    coreOnly: false,
    newBreakoutOnly: false,
    reviewDueOnly: false,
    sortBy: "score"
  };
}
