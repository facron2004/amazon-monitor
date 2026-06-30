import {
  insightEventStatusLabels,
  insightEventTypeLabels,
  strategyTagLabels
} from "@amazon-monitor/shared";
import type { InsightEventFilters } from "../stores/insightEvents";

export type ActionFilterKey =
  | "level"
  | "status"
  | "eventType"
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

const sortLabels: Record<InsightEventFilters["sortBy"], string> = {
  score: "Opportunity score",
  level: "Event level",
  rankChange: "Rank change",
  reviewChange: "Review growth",
  createdAt: "Created time"
};

export function getActionFilterBadges(filters: InsightEventFilters): ActionFilterBadge[] {
  const badges: ActionFilterBadge[] = [];
  if (filters.level) badges.push({ key: "level", label: "Level", value: filters.level });
  if (filters.status) badges.push({ key: "status", label: "Status", value: insightEventStatusLabels[filters.status] });
  if (filters.eventType) badges.push({ key: "eventType", label: "Type", value: insightEventTypeLabels[filters.eventType] });
  if (filters.strategyTag) badges.push({ key: "strategyTag", label: "Strategy", value: strategyTagLabels[filters.strategyTag] });
  if (filters.brand.trim()) badges.push({ key: "brand", label: "Brand", value: filters.brand.trim() });
  if (filters.asin.trim()) badges.push({ key: "asin", label: "ASIN", value: filters.asin.trim() });
  if (filters.assignee.trim() && !filters.unassignedOnly) {
    badges.push({ key: "assignee", label: "Owner", value: filters.assignee.trim() });
  }
  if (filters.unassignedOnly) badges.push({ key: "unassignedOnly", label: "Owner", value: "Unassigned" });
  if (filters.coreOnly) badges.push({ key: "coreOnly", label: "Watch", value: "Core competitors" });
  if (filters.newBreakoutOnly) badges.push({ key: "newBreakoutOnly", label: "Signal", value: "New breakout" });
  if (filters.reviewDueOnly) badges.push({ key: "reviewDueOnly", label: "Queue", value: "Review due" });
  if (filters.sortBy !== "score") badges.push({ key: "sortBy", label: "Sort", value: sortLabels[filters.sortBy] });
  return badges;
}

export function clearActionFilter(filters: InsightEventFilters, key: ActionFilterKey): InsightEventFilters {
  const next = { ...filters };
  if (key === "level") next.level = "";
  if (key === "status") next.status = "";
  if (key === "eventType") next.eventType = "";
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
    strategyTag: "",
    brand: "",
    asin: "",
    assignee: "",
    unassignedOnly: false,
    coreOnly: false,
    newBreakoutOnly: false,
    reviewDueOnly: false,
    sortBy: "score"
  };
}
