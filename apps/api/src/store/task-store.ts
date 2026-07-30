import type { DatabaseSync } from "node:sqlite";
import type {
  CreateTaskInput,
  InsightEventTaskLink,
  Task,
  TaskExecutionInput,
  TaskNote,
  TaskPriority,
  TaskSourceType,
  TaskStatus,
  UpdateTaskInput
} from "@amazon-monitor/shared";
import { nowIso, withTransaction } from "./sql-utils.js";
import type { Store } from "./types.js";
import {
  insertTask,
  mapEventTaskLink,
  mapTask,
  mapTaskNote,
  type EventTaskLinkRow,
  type TaskNoteRow,
  type TaskRow
} from "./workflow-mappers.js";

type TaskStoreMethods = Pick<
  Store,
  | "createTask"
  | "updateTask"
  | "submitTaskForReview"
  | "reviewTask"
  | "getTask"
  | "listTasks"
  | "addTaskNote"
  | "listTaskNotes"
  | "transitionTaskStatus"
  | "linkEventToTask"
  | "listTasksForEvent"
  | "listEventsForTask"
>;

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["in_progress", "cancelled"],
  in_progress: ["awaiting_review", "pending", "cancelled"],
  awaiting_review: ["done", "in_progress", "cancelled"],
  done: ["reviewed", "in_progress"],
  reviewed: ["in_progress"],
  cancelled: []
};

function isPriority(value: string | undefined): value is TaskPriority {
  return value === "P0" || value === "P1" || value === "P2" || value === "P3";
}

function isSourceType(value: string): value is TaskSourceType {
  return value === "insight_event"
    || value === "ai_run"
    || value === "agent_run"
    || value === "rule"
    || value === "manual"
    || value === "review_recurring";
}

function inferTaskTypeFromEvent(eventType: string): string {
  if (eventType.includes("KEYWORD")) return "keyword";
  if (eventType.includes("PRICE")) return "price";
  if (eventType.includes("DEAL") || eventType.includes("COUPON")) return "coupon";
  if (eventType.includes("BSR") || eventType.includes("RANK")) return "competitor";
  if (eventType.includes("REVIEW") || eventType.includes("LOW_REVIEW")) return "review";
  if (eventType.includes("LISTING")) return "listing";
  if (eventType.includes("BREAKOUT") || eventType.includes("NEW_PRODUCT")) return "competitor";
  return "other";
}

export function createTaskStore(db: DatabaseSync): TaskStoreMethods {
  return {
    createTask(input) {
      const sourceType = isSourceType(input.sourceType) ? input.sourceType : "manual";
      const priority: TaskPriority = isPriority(input.priority ?? "") ? (input.priority as TaskPriority) : "P1";
      const row = insertTask(db, {
        orgId: input.orgId,
        sourceType,
        sourceId: input.sourceId ?? null,
        title: input.title,
        description: input.description ?? "",
        taskType: input.taskType,
        priority,
        status: "pending",
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ?? null,
        relatedAsin: input.relatedAsin ?? null,
        relatedKeyword: input.relatedKeyword ?? null,
        relatedBrand: input.relatedBrand ?? null,
        relatedCategoryId: input.relatedCategoryId ?? null,
        aiRecommendation: input.aiRecommendation ?? null,
        createdBy: input.createdBy ?? null
      });
      return mapTask(row);
    },

    updateTask(id, input) {
      const current = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as unknown as TaskRow | undefined;
      if (!current) {
        throw new Error(`Task ${id} not found`);
      }
      const now = nowIso();
      const next = {
        title: input.title ?? current.title,
        description: input.description ?? current.description,
        priority: input.priority ?? current.priority,
        status: input.status ?? current.status,
        assignee_id: input.assigneeId !== undefined ? input.assigneeId : current.assignee_id,
        due_date: input.dueDate !== undefined ? input.dueDate : current.due_date,
        action_taken: input.actionTaken !== undefined ? input.actionTaken : current.action_taken,
        result_before_json: input.resultBeforeJson !== undefined ? input.resultBeforeJson : current.result_before_json,
        result_after_json: input.resultAfterJson !== undefined ? input.resultAfterJson : current.result_after_json,
        review_note: input.reviewNote !== undefined ? input.reviewNote : current.review_note,
        review_result: input.reviewResult ?? current.review_result,
        completed_at: input.status === "done" && current.status !== "done" ? now : current.completed_at,
        reviewed_at: input.status === "reviewed" && current.status !== "reviewed" ? now : current.reviewed_at,
        updated_at: now
      };
      db.prepare(
        `UPDATE tasks SET
          title = ?, description = ?, priority = ?, status = ?,
          assignee_id = ?, due_date = ?, action_taken = ?,
          result_before_json = ?, result_after_json = ?,
          review_note = ?, review_result = ?,
          completed_at = ?, reviewed_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        next.title,
        next.description,
        next.priority,
        next.status,
        next.assignee_id,
        next.due_date,
        next.action_taken,
        next.result_before_json,
        next.result_after_json,
        next.review_note,
        next.review_result,
        next.completed_at,
        next.reviewed_at,
        next.updated_at,
        id
      );
      return mapTask(db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as unknown as TaskRow);
    },

    getTask(id) {
      const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as unknown as TaskRow | undefined;
      return row ? mapTask(row) : null;
    },

    listTasks(filter) {
      const where: string[] = ["1=1"];
      const params: Array<string | number> = [];
      if (filter?.orgId !== undefined) {
        where.push("org_id = ?");
        params.push(filter.orgId);
      }
      if (filter?.sourceType !== undefined) {
        where.push("source_type = ?");
        params.push(filter.sourceType);
      }
      if (filter?.sourceId !== undefined) {
        where.push("source_id = ?");
        params.push(filter.sourceId);
      }
      if (filter?.status) {
        where.push("status = ?");
        params.push(filter.status);
      } else if (filter?.statusIn && filter.statusIn.length) {
        where.push(`status IN (${filter.statusIn.map(() => "?").join(",")})`);
        params.push(...filter.statusIn);
      }
      if (filter?.assigneeId !== undefined) {
        where.push("assignee_id = ?");
        params.push(filter.assigneeId);
      }
      if (filter?.relatedAsin) {
        where.push("related_asin = ?");
        params.push(filter.relatedAsin);
      }
      if (filter?.priority) {
        where.push("priority = ?");
        params.push(filter.priority);
      }
      const limit = filter?.limit ?? 200;
      const offset = filter?.offset ?? 0;
      const rows = db
        .prepare(`SELECT * FROM tasks WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset) as unknown as TaskRow[];
      return rows.map(mapTask);
    },

    submitTaskForReview(id, input) {
      const current = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as unknown as TaskRow | undefined;
      if (!current) {
        throw new Error(`Task ${id} not found`);
      }
      if (current.status !== "in_progress") {
        throw new Error(`Illegal task transition: ${current.status} → awaiting_review`);
      }
      const now = nowIso();
      const actionTaken = input.actionTaken.trim();
      if (!actionTaken) {
        throw new Error("Task execution record requires an action taken");
      }
      const resultBeforeJson = input.resultBefore === undefined
        ? current.result_before_json
        : JSON.stringify(input.resultBefore);
      const resultAfterJson = input.resultAfter === undefined
        ? current.result_after_json
        : JSON.stringify(input.resultAfter);
      db.prepare(
        `UPDATE tasks SET
          status = 'awaiting_review', action_taken = ?, result_before_json = ?, result_after_json = ?, updated_at = ?
         WHERE id = ?`
      ).run(actionTaken, resultBeforeJson, resultAfterJson, now, id);
      return mapTask(db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as unknown as TaskRow);
    },

    reviewTask(id, input) {
      const current = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as unknown as TaskRow | undefined;
      if (!current) {
        throw new Error(`Task ${id} not found`);
      }
      if (current.status !== "done") {
        throw new Error(`Illegal task transition: ${current.status} → reviewed`);
      }
      if (!current.action_taken?.trim()) {
        throw new Error("Task must have an execution record before review");
      }
      const now = nowIso();
      db.prepare(
        `UPDATE tasks SET status = 'reviewed', review_result = ?, review_note = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`
      ).run(input.reviewResult, input.reviewNote ?? null, now, now, id);
      return mapTask(db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as unknown as TaskRow);
    },

    addTaskNote(input) {
      const result = db
        .prepare(`INSERT INTO task_notes (task_id, author_id, body, created_at) VALUES (?, ?, ?, ?)`)
        .run(input.taskId, input.authorId ?? null, input.body, nowIso());
      return mapTaskNote(
        db.prepare("SELECT * FROM task_notes WHERE id = ?").get(Number(result.lastInsertRowid)) as unknown as TaskNoteRow
      );
    },

    listTaskNotes(taskId) {
      const rows = db
        .prepare("SELECT * FROM task_notes WHERE task_id = ? ORDER BY id ASC")
        .all(taskId) as unknown as TaskNoteRow[];
      return rows.map(mapTaskNote);
    },

    transitionTaskStatus(id, nextStatus) {
      const current = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as unknown as TaskRow | undefined;
      if (!current) return null;
      const allowed = VALID_TRANSITIONS[current.status as TaskStatus] ?? [];
      if (!allowed.includes(nextStatus)) {
        throw new Error(`Illegal task transition: ${current.status} → ${nextStatus}`);
      }
      const now = nowIso();
      const completedAt = nextStatus === "done" && current.status !== "done" ? now : current.completed_at;
      const reviewedAt = nextStatus === "reviewed" && current.status !== "reviewed" ? now : current.reviewed_at;
      db.prepare(
        `UPDATE tasks SET status = ?, completed_at = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`
      ).run(nextStatus, completedAt, reviewedAt, now, id);
      return mapTask(db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as unknown as TaskRow);
    },

    linkEventToTask(eventId, taskId) {
      const now = nowIso();
      db.prepare(
        `INSERT OR IGNORE INTO insight_event_tasks (event_id, task_id, created_at) VALUES (?, ?, ?)`
      ).run(eventId, taskId, now);
      return mapEventTaskLink(
        db.prepare("SELECT * FROM insight_event_tasks WHERE event_id = ? AND task_id = ?")
          .get(eventId, taskId) as unknown as EventTaskLinkRow
      );
    },

    listTasksForEvent(eventId, orgId) {
      const orgFilter = orgId === undefined ? "" : " AND t.org_id = ?";
      const params: Array<string | number> = orgId === undefined ? [eventId] : [eventId, orgId];
      const rows = db
        .prepare(
          `SELECT t.* FROM tasks t
           JOIN insight_event_tasks iet ON iet.task_id = t.id
           WHERE iet.event_id = ?${orgFilter} ORDER BY t.id DESC`
        )
        .all(...params) as unknown as TaskRow[];
      return rows.map(mapTask);
    },

    listEventsForTask(taskId) {
      const rows = db
        .prepare(
          `SELECT * FROM insight_event_tasks WHERE task_id = ? ORDER BY created_at ASC`
        )
        .all(taskId) as unknown as EventTaskLinkRow[];
      return rows.map(mapEventTaskLink);
    }
  };
}

export { inferTaskTypeFromEvent, VALID_TRANSITIONS };
