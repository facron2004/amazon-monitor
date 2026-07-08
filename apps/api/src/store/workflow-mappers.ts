import type { DatabaseSync } from "node:sqlite";
import type {
  InsightEventTaskLink,
  Sop,
  SopCategory,
  SopStatus,
  Task,
  TaskNote,
  TaskPriority,
  TaskReviewResult,
  TaskSourceType,
  TaskStatus,
  TaskType
} from "@amazon-monitor/shared";
import { nowIso } from "./sql-utils.js";

export interface TaskRow {
  id: number;
  org_id: number;
  source_type: string;
  source_id: string | null;
  title: string;
  description: string;
  task_type: string;
  priority: string;
  status: string;
  assignee_id: number | null;
  due_date: string | null;
  related_asin: string | null;
  related_keyword: string | null;
  related_brand: string | null;
  related_category_id: number | null;
  ai_recommendation: string | null;
  action_taken: string | null;
  result_before_json: string | null;
  result_after_json: string | null;
  review_note: string | null;
  review_result: string | null;
  promoted_to_sop_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  reviewed_at: string | null;
}

export interface TaskNoteRow {
  id: number;
  task_id: number;
  author_id: number | null;
  body: string;
  created_at: string;
}

export interface SopRow {
  id: number;
  org_id: number;
  title: string;
  category: string;
  body_md: string;
  source_task_id: number | null;
  status: string;
  tags_json: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface EventTaskLinkRow {
  event_id: string;
  task_id: number;
  created_at: string;
}

export function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    orgId: row.org_id,
    sourceType: row.source_type as TaskSourceType,
    sourceId: row.source_id,
    title: row.title,
    description: row.description,
    taskType: row.task_type as TaskType,
    priority: row.priority as TaskPriority,
    status: row.status as TaskStatus,
    assigneeId: row.assignee_id,
    dueDate: row.due_date,
    relatedAsin: row.related_asin,
    relatedKeyword: row.related_keyword,
    relatedBrand: row.related_brand,
    relatedCategoryId: row.related_category_id,
    aiRecommendation: row.ai_recommendation,
    actionTaken: row.action_taken,
    resultBeforeJson: row.result_before_json,
    resultAfterJson: row.result_after_json,
    reviewNote: row.review_note,
    reviewResult: row.review_result as TaskReviewResult | null,
    promotedToSopId: row.promoted_to_sop_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    reviewedAt: row.reviewed_at
  };
}

export function mapTaskNote(row: TaskNoteRow): TaskNote {
  return {
    id: row.id,
    taskId: row.task_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at
  };
}

export function mapSop(row: SopRow): Sop {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.tags_json ?? "[]");
    if (Array.isArray(parsed)) {
      tags = parsed.filter((t): t is string => typeof t === "string");
    }
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    orgId: row.org_id,
    title: row.title,
    category: row.category as SopCategory,
    bodyMd: row.body_md,
    sourceTaskId: row.source_task_id,
    status: row.status as SopStatus,
    tags,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapEventTaskLink(row: EventTaskLinkRow): InsightEventTaskLink {
  return {
    eventId: row.event_id,
    taskId: row.task_id,
    createdAt: row.created_at
  };
}

export function insertTask(db: DatabaseSync, input: {
  orgId: number;
  sourceType: string;
  sourceId: string | null;
  title: string;
  description: string;
  taskType: string;
  priority: string;
  status: string;
  assigneeId: number | null;
  dueDate: string | null;
  relatedAsin: string | null;
  relatedKeyword: string | null;
  relatedBrand: string | null;
  relatedCategoryId: number | null;
  aiRecommendation: string | null;
  createdBy: number | null;
}): TaskRow {
  const now = nowIso();
  const result = db.prepare(
    `INSERT INTO tasks
       (org_id, source_type, source_id, title, description, task_type, priority, status,
        assignee_id, due_date, related_asin, related_keyword, related_brand, related_category_id,
        ai_recommendation, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.orgId,
    input.sourceType,
    input.sourceId,
    input.title,
    input.description,
    input.taskType,
    input.priority,
    input.status,
    input.assigneeId,
    input.dueDate,
    input.relatedAsin,
    input.relatedKeyword,
    input.relatedBrand,
    input.relatedCategoryId,
    input.aiRecommendation,
    input.createdBy,
    now,
    now
  );
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(Number(result.lastInsertRowid)) as unknown as TaskRow;
}

export function insertSop(db: DatabaseSync, input: {
  orgId: number;
  title: string;
  category: string;
  bodyMd: string;
  sourceTaskId: number | null;
  status: string;
  tagsJson: string;
  createdBy: number | null;
}): SopRow {
  const now = nowIso();
  const result = db.prepare(
    `INSERT INTO sops
       (org_id, title, category, body_md, source_task_id, status, tags_json, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.orgId,
    input.title,
    input.category,
    input.bodyMd,
    input.sourceTaskId,
    input.status,
    input.tagsJson,
    input.createdBy,
    now,
    now
  );
  return db.prepare("SELECT * FROM sops WHERE id = ?").get(Number(result.lastInsertRowid)) as unknown as SopRow;
}
