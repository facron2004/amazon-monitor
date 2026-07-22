import type { Express, Request, Response } from "express";
import { hasBusinessCapability, isoDate, type SessionContext, type Task, type TaskStatus } from "@amazon-monitor/shared";
import { createTaskFromEvent } from "../services/task-service.js";
import { buildTaskExecutionCsv } from "../services/task-execution-export.js";
import type { Store } from "../store.js";
import { asyncHandler } from "./http-utils.js";
import {
  createTaskSchema,
  reviewTaskSchema,
  taskExecutionSchema,
  taskListQuerySchema,
  taskNoteSchema,
  taskTransitionSchema,
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

const executionExportQuerySchema = taskListQuerySchema.pick({
  assigneeId: true,
  priority: true
});

function requireSessionContext(req: Request): SessionContext {
  const ctx = (req as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!ctx) {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }
  return ctx;
}

function requireOperatorOrAdmin(ctx: SessionContext): void {
  if (!hasBusinessCapability(ctx.user.role, "manage_workflow")) {
    throw Object.assign(new Error("Forbidden: role cannot manage tasks"), { statusCode: 403 });
  }
}

function requireTaskAssignment(ctx: SessionContext): void {
  if (!hasBusinessCapability(ctx.user.role, "assign_tasks")) {
    throw Object.assign(new Error("Forbidden: role cannot assign tasks"), { statusCode: 403 });
  }
}

function validateInsightEventIdParam(id: string): string {
  const decoded = decodeURIComponent(id);
  if (!decoded || decoded.length > 500) {
    throw Object.assign(new Error("Invalid insight event id"), { statusCode: 400 });
  }
  return decoded;
}

function listTasksForInsightEvent(request: Request, response: Response, store: Store): void {
  const ctx = requireSessionContext(request);
  const eventId = validateInsightEventIdParam(request.params.id);
  if (!store.getInsightEvent(eventId, ctx.organization.id)) {
    response.status(404).json({ message: "Insight event not found" });
    return;
  }
  response.json(store.listTasksForEvent(eventId, ctx.organization.id));
}

function requireOrganizationTask(store: Store, id: number, ctx: SessionContext): Task {
  const task = store.getTask(id);
  if (!task || task.orgId !== ctx.organization.id) {
    throw Object.assign(new Error("Task not found"), { statusCode: 404 });
  }
  return task;
}

function ensureAssigneeInOrganization(store: Store, assigneeId: number | null | undefined, orgId: number): void {
  if (assigneeId === undefined || assigneeId === null) return;
  const assignee = store.listUsers().find((user) => user.id === assigneeId);
  if (!assignee || assignee.orgId !== orgId) {
    throw Object.assign(new Error("Assignee not found"), { statusCode: 404 });
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
      orgId: ctx.organization.id,
      limit: rest.limit as number | undefined,
      offset: rest.offset as number | undefined
    });
    response.json(tasks);
  }));

  app.get("/api/tasks/execution.csv", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const query = validateQuery(executionExportQuerySchema, request.query);
    const tasks = store.listTasks({
      orgId: ctx.organization.id,
      status: "in_progress",
      assigneeId: query.assigneeId,
      priority: query.priority,
      limit: 1000
    });
    const users = store.listUsers().filter((user) => user.orgId === ctx.organization.id);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="task-execution-${isoDate()}.csv"`);
    response.send(buildTaskExecutionCsv(tasks, users));
  }));

  app.get("/api/tasks/:id/detail", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const task = requireOrganizationTask(store, validateIdParam(request.params.id), ctx);
    const sourceEvent = task.sourceType === "insight_event" && task.sourceId
      ? store.getInsightEvent(task.sourceId, ctx.organization.id)
      : null;
    const sourceAiRunId = task.sourceType === "ai_run" && task.sourceId
      ? Number(task.sourceId)
      : Number.NaN;
    const sourceAiRun = Number.isInteger(sourceAiRunId) && sourceAiRunId > 0
      ? store.getAiRun(sourceAiRunId, ctx.organization.id)
      : null;
    response.json({ task, sourceEvent, sourceAiRun });
  }));

  app.get("/api/tasks/:id", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    response.json(requireOrganizationTask(store, id, ctx));
  }));

  app.get("/api/tasks/:id/notes", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    requireOrganizationTask(store, id, ctx);
    response.json(store.listTaskNotes(id));
  }));

  app.get("/api/tasks/:id/events", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    requireOrganizationTask(store, id, ctx);
    response.json(
      store.listEventsForTask(id)
        .filter((link) => store.getInsightEvent(link.eventId, ctx.organization.id))
    );
  }));

  app.post("/api/tasks", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const data = validateBody(createTaskSchema, request.body);
    if (data.assigneeId !== undefined && data.assigneeId !== null) {
      requireTaskAssignment(ctx);
    }
    ensureAssigneeInOrganization(store, data.assigneeId, ctx.organization.id);
    if (data.sourceType === "ai_run") {
      const sourceAiRunId = Number(data.sourceId);
      if (!Number.isInteger(sourceAiRunId) || sourceAiRunId < 1 || !store.getAiRun(sourceAiRunId, ctx.organization.id)) {
        response.status(404).json({ message: "AI run not found" });
        return;
      }
    }
    if (data.linkEventId && !store.getInsightEvent(data.linkEventId, ctx.organization.id)) {
      response.status(404).json({ message: "Insight event not found" });
      return;
    }
    let task: Task;
    if (data.sourceType === "insight_event" && data.sourceId) {
      const event = store.getInsightEvent(data.sourceId, ctx.organization.id);
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

  const updateTaskHandler = asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    requireOrganizationTask(store, id, ctx);
    const data = validateBody(updateTaskSchema, request.body);
    if (data.assigneeId !== undefined) {
      requireTaskAssignment(ctx);
    }
    ensureAssigneeInOrganization(store, data.assigneeId, ctx.organization.id);
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
  });

  app.patch("/api/tasks/:id", updateTaskHandler);
  app.put("/api/tasks/:id", updateTaskHandler);

  app.post("/api/tasks/:id/transition", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    requireOrganizationTask(store, id, ctx);
    const data = validateBody(taskTransitionSchema, request.body);
    if (data.status === "awaiting_review") {
      response.status(409).json({ message: "Use /api/tasks/:id/submit to record execution before review" });
      return;
    }
    if (data.status === "reviewed") {
      response.status(409).json({ message: "Use /api/tasks/:id/review to record a review result" });
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

  app.post("/api/tasks/:id/complete", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    requireOrganizationTask(store, id, ctx);
    try {
      const task = store.transitionTaskStatus(id, "done");
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
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    requireOrganizationTask(store, id, ctx);
    const data = validateBody(taskNoteSchema, request.body);
    const note = store.addTaskNote({ taskId: id, authorId: ctx.user.id, body: data.body });
    response.status(201).json(note);
  }));

  app.post("/api/tasks/:id/submit", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    requireOrganizationTask(store, id, ctx);
    const data = validateBody(taskExecutionSchema, request.body);
    try {
      response.json(store.submitTaskForReview(id, data));
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("Illegal task transition")) {
        response.status(409).json({ message });
        return;
      }
      throw err;
    }
  }));

  app.post("/api/tasks/:id/review", asyncHandler(async (request, response) => {
    const ctx = requireSessionContext(request);
    requireOperatorOrAdmin(ctx);
    const id = validateIdParam(request.params.id);
    requireOrganizationTask(store, id, ctx);
    const data = validateBody(reviewTaskSchema, request.body);
    try {
      response.json(store.reviewTask(id, {
        reviewResult: data.reviewResult,
        reviewNote: data.reviewNote ?? null
      }));
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("Illegal task transition") || message.includes("execution record")) {
        response.status(409).json({ message });
        return;
      }
      throw err;
    }
  }));

  app.get("/api/insight-events/:id/tasks", asyncHandler(async (request, response) => {
    listTasksForInsightEvent(request, response, store);
  }));

  app.get("/api/insights/:id/tasks", asyncHandler(async (request, response) => {
    listTasksForInsightEvent(request, response, store);
  }));
}
