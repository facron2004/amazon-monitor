import {
  taskStatuses,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@amazon-monitor/shared";

export type TaskStatusGroups = Record<TaskStatus, Task[]>;

export interface TaskWorkspaceSummary {
  total: number;
  pending: number;
  inProgress: number;
  awaitingReview: number;
  awaitingRecap: number;
  overdue: number;
}

export const taskStatusOrder: TaskStatus[] = [...taskStatuses];

export const taskPriorityTagTypes: Record<
  TaskPriority,
  "danger" | "warning" | "info" | "primary"
> = {
  P0: "danger",
  P1: "warning",
  P2: "info",
  P3: "primary",
};

const terminalStatuses = new Set<TaskStatus>(["reviewed", "cancelled"]);

export function groupTasksByStatus(tasks: Task[]): TaskStatusGroups {
  const groups: TaskStatusGroups = {
    pending: [],
    in_progress: [],
    awaiting_review: [],
    done: [],
    reviewed: [],
    cancelled: [],
  };

  for (const task of tasks) groups[task.status].push(task);
  return groups;
}

export function buildTaskWorkspaceSummary(
  tasks: Task[],
  today = currentLocalDate(),
): TaskWorkspaceSummary {
  return {
    total: tasks.length,
    pending: countStatus(tasks, "pending"),
    inProgress: countStatus(tasks, "in_progress"),
    awaitingReview: countStatus(tasks, "awaiting_review"),
    awaitingRecap: countStatus(tasks, "done"),
    overdue: tasks.filter(
      (task) =>
        task.dueDate !== null &&
        task.dueDate < today &&
        !terminalStatuses.has(task.status),
    ).length,
  };
}

export function isTaskOverdue(task: Task, today = currentLocalDate()): boolean {
  return (
    task.dueDate !== null &&
    task.dueDate < today &&
    !terminalStatuses.has(task.status)
  );
}

function countStatus(tasks: Task[], status: TaskStatus): number {
  return tasks.filter((task) => task.status === status).length;
}

function currentLocalDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
