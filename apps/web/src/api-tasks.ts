import { request } from "./api-base.js";
import type { Task, TaskNote, TaskPriority, TaskStatus, TaskType } from "@amazon-monitor/shared";

export interface CreateTaskInput {
  sourceType: "insight_event" | "rule" | "manual" | "review_recurring";
  sourceId?: string | null;
  title: string;
  description?: string;
  taskType: TaskType;
  priority: TaskPriority;
  assigneeId?: number | null;
  dueDate?: string | null;
  relatedAsin?: string | null;
  relatedKeyword?: string | null;
  relatedBrand?: string | null;
  relatedCategoryId?: number | null;
  aiRecommendation?: string | null;
  linkEventId?: string;
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
  reviewResult?: Task["reviewResult"] | null;
}

export interface TaskListParams {
  status?: TaskStatus;
  statusIn?: TaskStatus[];
  assigneeId?: number;
  relatedAsin?: string;
  priority?: TaskPriority;
  limit?: number;
  offset?: number;
}

export function listTasks(params: TaskListParams = {}): Promise<Task[]> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.statusIn?.length) search.set("statusIn", params.statusIn.join(","));
  if (params.assigneeId !== undefined) search.set("assigneeId", String(params.assigneeId));
  if (params.relatedAsin) search.set("relatedAsin", params.relatedAsin);
  if (params.priority) search.set("priority", params.priority);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  const qs = search.toString();
  return request<Task[]>(`/api/tasks${qs ? `?${qs}` : ""}`);
}

export function getTask(id: number): Promise<Task> {
  return request<Task>(`/api/tasks/${id}`);
}

export function createTask(input: CreateTaskInput): Promise<Task> {
  return request<Task>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateTask(id: number, input: UpdateTaskInput): Promise<Task> {
  return request<Task>(`/api/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function transitionTask(id: number, status: TaskStatus): Promise<Task> {
  return request<Task>(`/api/tasks/${id}/transition`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}

export function reviewTask(id: number, reviewResult: Task["reviewResult"], reviewNote?: string): Promise<Task> {
  return request<Task>(`/api/tasks/${id}/review`, {
    method: "POST",
    body: JSON.stringify({ reviewResult, reviewNote })
  });
}

export function listTaskNotes(id: number): Promise<TaskNote[]> {
  return request<TaskNote[]>(`/api/tasks/${id}/notes`);
}

export function addTaskNote(id: number, body: string): Promise<TaskNote> {
  return request<TaskNote>(`/api/tasks/${id}/notes`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
}

export function listTasksForEvent(eventId: string): Promise<Task[]> {
  return request<Task[]>(`/api/insights/${eventId}/tasks`);
}

export function convertEventToTask(eventId: string, title: string, taskType: TaskType, priority: TaskPriority, relatedAsin?: string | null, relatedBrand?: string | null, relatedCategoryId?: number | null, aiRecommendation?: string | null): Promise<Task> {
  return createTask({
    sourceType: "insight_event",
    sourceId: eventId,
    title,
    taskType,
    priority,
    relatedAsin: relatedAsin ?? null,
    relatedBrand: relatedBrand ?? null,
    relatedCategoryId: relatedCategoryId ?? null,
    aiRecommendation: aiRecommendation ?? null,
    linkEventId: eventId
  });
}
