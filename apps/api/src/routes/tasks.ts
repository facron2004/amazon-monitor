import type { Express, Request, Response } from "express";
import type { SessionContext, Task, TaskStatus } from "@amazon-monitor/shared";
import { createTaskFromEvent } from "../services/task-service.js";
import type { Store } from "../store.js";
import { asyncHandler } from "./http-utils.js";
import {
  createTaskSchema,
  idParamSchema,
  reviewTaskSchema,
  taskListQuerySchema,
  taskNoteSchema,
  updateTaskSchema,
  validateBody,
  validateIdParam,
  validateQuery
} from "./validation.js";
const STATUS_VALUES: readonly TaskStatus[] = [
  "pending",
  "in_progress",
  "awaiting_review",
  "done",
  "reviewed",
  "cancelled"
];

function requireSessionContext(req: Request): SessionContext {
  const ctx = (req as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!ctx) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  return ctx;
}

function requireOperatorOrAdmin(ctx: SessionContext): void {
  if (ctx.user.role !== "admin" && ctx.user.role !== "operator") {
    throw Object.assign(new Error("Forbidden: only operator or admin can manage tasks"), { statusCode: 403 });
  }
}

export function registerTaskRoutes(app: Express, store: Store): void {
  app.get("/api/tasks", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const filter = validateQuery(taskListQuerySchema, request.query) as Record<string, unknown>;
    const statusInRaw = typeof filter.statusIn === "string" ? filter.statusIn : undefined;
    const statusIn: TaskStatus[] | undefined = statusInRaw
      ? statusInRaw.split(",").filter((s): s is TaskStatus => STATUS_VALUES.includes(s as TaskStatus))
      : undefined;
    const { statusIn: _drop, ...rest } = filter;
    const tasks = store.listTasks({
      status: rest.status as TaskStatus | undefined,
      statusIn,
      assigneeId: rest.assigneeId as number | undefined,
      relatedAsin: rest.relatedAsin as string | undefined,
      priority: rest.priority as Task["priority"] | undefined,
      limit: rest.limit as number | undefined,
      offset: rest.offset as number | undefined
    });
    void ctx;
    response.json(tasks);
  }));

  app.get("/api/tasks/:id", asyncHandler(async (request, response) => {
    requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    const task = store.getTask(id);
    if (!task) {
      response.status(404).json({ message: "Task not found" });
      return;
    }
    response.json(task);
  }));

  app.get("/api/tasks/:id/notes", asyncHandler(async (request, response) => {
    requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    response.json(store.listTaskNotes(id));
  }));

  app.get("/api/tasks/:id/events", asyncHandler(async (request, response) => {
    requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    response.json(store.listEventsForTask(id));
  }));

  app.post("/api/tasks", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const data = validateBody(createTaskSchema, request.body);
    let task: Task;
    if (data.sourceType === "insight_event" && data.sourceId) {
      const event = store.getInsightEvent(data.sourceId);
      if (!event) {
        response.status(404).json({ message: `Insight event ${data.sourceId} not found` });
        return;
      }
      task = createTaskFromEvent(store, event, {
        orgId: ctx.user.orgId,
        createdBy: ctx.user.id,
        assigneeId: data.assigneeId ?? null,
        dueDate: data.dueDate ?? null
      });
    } else {
      task = store.createTask({
        orgId: ctx.user.orgId,
        sourceType: data.sourceType,
        sourceId: data.sourceId ?? null,
        title: data.title,
        description: data.description ?? "",
        taskType: data.taskType as Task["taskType"],
        priority: data.priority,
        assigneeId: data.assigneeId ?? null,
        dueDate: data.dueDate ?? null,
        relatedAsin: data.relatedAsin ?? null,
        relatedKeyword: data.relatedKeyword ?? null,
        relatedBrand: data.relatedBrand ?? null,
        relatedCategoryId: data.relatedCategoryId ?? null,
        aiRecommendation: data.aiRecommendation ?? null,
        createdBy: ctx.user.id
      });
    }
    if (data.linkEventId) {
      store.linkEventToTask(data.linkEventId, task.id);
    }
    response.status(201).json(task);
  }));

  app.patch("/api/tasks/:id", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    const data = validateBody(updateTaskSchema, request.body);
    try {
      const task = store.updateTask(id, data);
      response.json(task);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("Illegal task transition")) {
        response.status(409).json({ message });
        return;
      }
      if (message.includes("not found")) {
        response.status(404).json({ message });
        return;
      }
      throw err;
    }
  }));

  app.post("/api/tasks/:id/transition", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    const data = validateBody(updateTaskSchema.pick({ status: true }), request.body);
    if (!data.status) {
      response.status(400).json({ message: "status is required" });
      return;
    }
    try {
      const task = store.transitionTaskStatus(id, data.status);
      if (!task) {
        response.status(404).json({ message: "Task not found" });
        return;
      }
      response.json(task);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("Illegal")) {
        response.status(409).json({ message });
        return;
      }
      throw err;
    }
  }));

  app.post("/api/tasks/:id/notes", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    const data = validateBody(taskNoteSchema, request.body);
    const note = store.addTaskNote({ taskId: id, authorId: ctx.user.id, body: data.body });
    response.status(201).json(note);
  }));

  app.post("/api/tasks/:id/review", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    const data = validateBody(reviewTaskSchema, request.body);
    const updated = store.updateTask(id, {
      status: "reviewed",
      reviewResult: data.reviewResult,
      reviewNote: data.reviewNote ?? null
    });
    response.json(updated);
  }));

  app.get("/api/insights/:id/tasks", asyncHandler(async (request, response) => {
    requireSessionContext(request);
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      response.status(400).json({ message: "Invalid id" });
      return;
    }
    response.json(store.listTasksForEvent(params.data.id));
  }));
}
