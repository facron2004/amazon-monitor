import type {
  Task,
  TaskTeamPerformanceMember,
  TaskTeamPerformanceMetrics,
  TaskTeamPerformanceResponse,
  User,
} from "@amazon-monitor/shared";

const OPEN_STATUSES = new Set<Task["status"]>([
  "pending",
  "in_progress",
  "awaiting_review",
  "done",
]);

interface MutableMetrics {
  assignedCount: number;
  completedCount: number;
  openCount: number;
  overdueCount: number;
  reviewedCount: number;
  confirmedCount: number;
  dueCompletedCount: number;
  onTimeCompletedCount: number;
  totalCycleHours: number;
  cycleCount: number;
}

function emptyMetrics(): MutableMetrics {
  return {
    assignedCount: 0,
    completedCount: 0,
    openCount: 0,
    overdueCount: 0,
    reviewedCount: 0,
    confirmedCount: 0,
    dueCompletedCount: 0,
    onTimeCompletedCount: 0,
    totalCycleHours: 0,
    cycleCount: 0,
  };
}

function isOnTime(completedAt: string, dueDate: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return completedAt.slice(0, 10) <= dueDate;
  }
  return Date.parse(completedAt) <= Date.parse(dueDate);
}

function isOverdue(task: Task, generatedAt: string): boolean {
  if (!task.dueDate || !OPEN_STATUSES.has(task.status)) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) {
    return task.dueDate < generatedAt.slice(0, 10);
  }
  return Date.parse(task.dueDate) < Date.parse(generatedAt);
}

function finalize(metrics: MutableMetrics): TaskTeamPerformanceMetrics {
  return {
    assignedCount: metrics.assignedCount,
    completedCount: metrics.completedCount,
    openCount: metrics.openCount,
    overdueCount: metrics.overdueCount,
    reviewedCount: metrics.reviewedCount,
    confirmedCount: metrics.confirmedCount,
    dueCompletedCount: metrics.dueCompletedCount,
    onTimeCompletedCount: metrics.onTimeCompletedCount,
    onTimeRate:
      metrics.dueCompletedCount > 0
        ? Math.round((metrics.onTimeCompletedCount / metrics.dueCompletedCount) * 100)
        : null,
    confirmationRate:
      metrics.reviewedCount > 0
        ? Math.round((metrics.confirmedCount / metrics.reviewedCount) * 100)
        : null,
    averageCycleHours:
      metrics.cycleCount > 0
        ? Math.round((metrics.totalCycleHours / metrics.cycleCount) * 10) / 10
        : null,
  };
}

export function buildTaskTeamPerformance(
  tasks: Task[],
  users: User[],
  options: {
    windowDays: 7 | 30 | 90;
    rangeStart: string;
    rangeEnd: string;
    generatedAt: string;
  },
): TaskTeamPerformanceResponse {
  const metricsByAssignee = new Map<number | null, MutableMetrics>();
  const userNames = new Map(
    users.map((user) => [
      user.id,
      user.displayName?.trim() || user.username,
    ]),
  );

  for (const user of users.filter((candidate) => candidate.status === "active")) {
    metricsByAssignee.set(user.id, emptyMetrics());
  }

  for (const task of tasks) {
    const metrics =
      metricsByAssignee.get(task.assigneeId) ??
      emptyMetrics();
    metricsByAssignee.set(task.assigneeId, metrics);

    if (OPEN_STATUSES.has(task.status)) {
      metrics.openCount += 1;
      if (isOverdue(task, options.generatedAt)) metrics.overdueCount += 1;
    }

    const isCohortTask =
      task.status !== "cancelled" &&
      task.createdAt >= options.rangeStart &&
      task.createdAt <= options.rangeEnd;
    if (!isCohortTask) continue;

    metrics.assignedCount += 1;
    if (task.completedAt) {
      metrics.completedCount += 1;
      const cycleHours =
        (Date.parse(task.completedAt) - Date.parse(task.createdAt)) / 3_600_000;
      if (Number.isFinite(cycleHours) && cycleHours >= 0) {
        metrics.totalCycleHours += cycleHours;
        metrics.cycleCount += 1;
      }
      if (task.dueDate) {
        metrics.dueCompletedCount += 1;
        if (isOnTime(task.completedAt, task.dueDate)) {
          metrics.onTimeCompletedCount += 1;
        }
      }
    }
    if (task.reviewedAt) {
      metrics.reviewedCount += 1;
      if (task.reviewResult === "CONFIRMED") metrics.confirmedCount += 1;
    }
  }

  const members: TaskTeamPerformanceMember[] = [...metricsByAssignee.entries()]
    .map(([assigneeId, metrics]) => ({
      assigneeId,
      assigneeName:
        assigneeId === null
          ? "未分配"
          : userNames.get(assigneeId) ?? `用户 #${assigneeId}`,
      ...finalize(metrics),
    }))
    .filter(
      (member) =>
        member.assignedCount > 0 ||
        member.openCount > 0 ||
        member.assigneeId !== null,
    )
    .sort(
      (left, right) =>
        right.overdueCount - left.overdueCount ||
        right.openCount - left.openCount ||
        right.assignedCount - left.assignedCount ||
        left.assigneeName.localeCompare(right.assigneeName, "zh-CN"),
    );

  const totals = emptyMetrics();
  for (const metrics of metricsByAssignee.values()) {
    totals.assignedCount += metrics.assignedCount;
    totals.completedCount += metrics.completedCount;
    totals.openCount += metrics.openCount;
    totals.overdueCount += metrics.overdueCount;
    totals.reviewedCount += metrics.reviewedCount;
    totals.confirmedCount += metrics.confirmedCount;
    totals.dueCompletedCount += metrics.dueCompletedCount;
    totals.onTimeCompletedCount += metrics.onTimeCompletedCount;
    totals.totalCycleHours += metrics.totalCycleHours;
    totals.cycleCount += metrics.cycleCount;
  }

  return {
    windowDays: options.windowDays,
    rangeStart: options.rangeStart,
    rangeEnd: options.rangeEnd,
    generatedAt: options.generatedAt,
    totals: finalize(totals),
    members,
  };
}
