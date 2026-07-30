/**
 * Workflow types (Stage 1)
 *
 * Closes the "InsightEvent → Task → Review → SOP" loop. Task lifecycle has
 * five states; the SOP is the final, reusable artifact distilled from
 * reviewed tasks.
 */

export const TASK_STATUSES = [
  "pending",
  "in_progress",
  "awaiting_review",
  "done",
  "reviewed",
  "cancelled"
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_TYPES = [
  "price",
  "coupon",
  "ad",
  "listing",
  "image",
  "inventory",
  "keyword",
  "competitor",
  "review",
  "supplier",
  "campaign_recap",
  "other"
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_SOURCE_TYPES = [
  "insight_event",
  "ai_run",
  "agent_run",
  "rule",
  "manual",
  "review_recurring",
] as const;
export type TaskSourceType = (typeof TASK_SOURCE_TYPES)[number];

export const TASK_REVIEW_RESULTS = ["CONFIRMED", "REVERTED", "CONTINUING", "FAILED", "UNCLEAR"] as const;
export type TaskReviewResult = (typeof TASK_REVIEW_RESULTS)[number];

export interface Task {
  id: number;
  orgId: number;
  sourceType: TaskSourceType;
  sourceId: string | null;
  title: string;
  description: string;
  taskType: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId: number | null;
  dueDate: string | null;
  relatedAsin: string | null;
  relatedKeyword: string | null;
  relatedBrand: string | null;
  relatedCategoryId: number | null;
  aiRecommendation: string | null;
  actionTaken: string | null;
  resultBeforeJson: string | null;
  resultAfterJson: string | null;
  reviewNote: string | null;
  reviewResult: TaskReviewResult | null;
  promotedToSopId: number | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  reviewedAt: string | null;
}

export interface TaskNote {
  id: number;
  taskId: number;
  authorId: number | null;
  body: string;
  createdAt: string;
}

export const SOP_STATUSES = ["draft", "published", "archived"] as const;
export type SopStatus = (typeof SOP_STATUSES)[number];

export const SOP_CATEGORIES = [
  "competitor_response",
  "price_action",
  "ad_optimization",
  "listing_optimization",
  "review_response",
  "inventory_replenishment",
  "supplier_negotiation",
  "general"
] as const;
export type SopCategory = (typeof SOP_CATEGORIES)[number];

export const sopStatuses = SOP_STATUSES;
export const sopCategories = SOP_CATEGORIES;

export const sopStatusLabels: Record<SopStatus, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档"
};

export const sopCategoryLabels: Record<SopCategory, string> = {
  competitor_response: "竞品应对",
  price_action: "价格动作",
  ad_optimization: "广告优化",
  listing_optimization: "Listing 优化",
  review_response: "评论处理",
  inventory_replenishment: "库存补货",
  supplier_negotiation: "供应商沟通",
  general: "通用"
};

export const taskStatuses = TASK_STATUSES;
export const taskPriorities = TASK_PRIORITIES;

export const taskTypeLabels: Record<TaskType, string> = {
  price: "价格",
  coupon: "Coupon",
  ad: "广告",
  listing: "Listing",
  image: "图片",
  inventory: "库存",
  keyword: "关键词",
  competitor: "竞品",
  review: "评论",
  supplier: "供应商",
  campaign_recap: "活动复盘",
  other: "其他"
};

export const taskTypeSopCategory: Record<TaskType, SopCategory> = {
  price: "price_action",
  coupon: "price_action",
  ad: "ad_optimization",
  listing: "listing_optimization",
  image: "listing_optimization",
  inventory: "inventory_replenishment",
  keyword: "general",
  competitor: "competitor_response",
  review: "review_response",
  supplier: "supplier_negotiation",
  campaign_recap: "competitor_response",
  other: "general"
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  pending: "待处理",
  in_progress: "进行中",
  awaiting_review: "待复核",
  done: "已完成",
  reviewed: "已复盘",
  cancelled: "已取消"
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  P0: "P0 紧急",
  P1: "P1 高",
  P2: "P2 中",
  P3: "P3 低"
};

export interface Sop {
  id: number;
  orgId: number;
  title: string;
  category: SopCategory;
  bodyMd: string;
  sourceTaskId: number | null;
  status: SopStatus;
  tags: string[];
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSopRecommendation {
  sop: Sop;
  score: number;
  matchReasons: string[];
}

export interface SopStatusCounts {
  all: number;
  draft: number;
  published: number;
  archived: number;
}

export interface SopListResponse {
  sops: Sop[];
  total: number;
  limit: number;
  offset: number;
  statusCounts: SopStatusCounts;
}

export interface InsightEventTaskLink {
  eventId: string;
  taskId: number;
  createdAt: string;
}

export interface CreateTaskInput {
  orgId: number;
  sourceType: TaskSourceType;
  sourceId?: string | null;
  title: string;
  description?: string;
  taskType: TaskType;
  priority?: TaskPriority;
  assigneeId?: number | null;
  dueDate?: string | null;
  relatedAsin?: string | null;
  relatedKeyword?: string | null;
  relatedBrand?: string | null;
  relatedCategoryId?: number | null;
  aiRecommendation?: string | null;
  createdBy?: number | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  assigneeId?: number | null;
  dueDate?: string | null;
  actionTaken?: string | null;
  resultBeforeJson?: string | null;
  resultAfterJson?: string | null;
  reviewNote?: string | null;
  reviewResult?: TaskReviewResult | null;
}

export interface TaskMetricEntry {
  label: string;
  value: string;
  unit?: string | null;
}

export interface TaskExecutionInput {
  actionTaken: string;
  resultBefore?: TaskMetricEntry[];
  resultAfter?: TaskMetricEntry[];
}

export interface TaskTeamPerformanceMetrics {
  assignedCount: number;
  completedCount: number;
  openCount: number;
  overdueCount: number;
  reviewedCount: number;
  confirmedCount: number;
  dueCompletedCount: number;
  onTimeCompletedCount: number;
  onTimeRate: number | null;
  confirmationRate: number | null;
  averageCycleHours: number | null;
}

export interface TaskTeamPerformanceMember extends TaskTeamPerformanceMetrics {
  assigneeId: number | null;
  assigneeName: string;
}

export interface TaskTeamPerformanceResponse {
  windowDays: 7 | 30 | 90;
  rangeStart: string;
  rangeEnd: string;
  generatedAt: string;
  totals: TaskTeamPerformanceMetrics;
  members: TaskTeamPerformanceMember[];
}

export interface CreateSopInput {
  orgId: number;
  title: string;
  category: SopCategory;
  bodyMd: string;
  sourceTaskId?: number | null;
  tags?: string[];
  createdBy?: number | null;
}
