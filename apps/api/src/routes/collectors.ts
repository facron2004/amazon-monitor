import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express, Request, RequestHandler } from "express";
import type { CollectJob, SessionContext } from "@amazon-monitor/shared";
import { ts } from "../log.js";
import { isoDate } from "../pipeline.js";
import type { Store } from "../store.js";
import { asyncHandler } from "./http-utils.js";
import {
  collectorRunSchema,
  paginationQuerySchema,
  validateBody,
  validateIdParam,
  validateQuery
} from "./validation.js";

interface CollectorRouteOptions {
  collectLimiter?: RequestHandler;
}

function requireSessionContext(request: Request): SessionContext {
  const context = (request as Request & { sessionContext?: SessionContext }).sessionContext;
  if (!context) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  return context;
}

export function registerCollectorRoutes(
  app: Express,
  store: Store,
  options: CollectorRouteOptions = {}
): void {
  const collectGuard: RequestHandler[] = options.collectLimiter ? [options.collectLimiter] : [];

  app.post("/api/collectors/run", ...collectGuard, asyncHandler(async (request, response) => {
    const context = requireSessionContext(request);
    const input = validateBody(collectorRunSchema, request.body ?? {});
    const jobs = queueCollectorJobs(store, context.organization.id, input.taskType, input.date ?? isoDate(), input.targetId);
    console.log(
      `[${ts()}] [API] Collector run requested: task_type=${input.taskType}, jobs=${jobs.length}, date=${input.date ?? jobs[0]?.date ?? isoDate()}`
    );
    response.status(202).json(jobs);
  }));

  app.get("/api/collectors/jobs", (request, response) => {
    const context = requireSessionContext(request);
    const query = validateQuery(paginationQuerySchema, request.query);
    response.json(store.listJobs(query.limit ?? 50, query.offset ?? 0, context.organization.id));
  });

  app.get("/api/collectors/jobs/:id", (request, response) => {
    const context = requireSessionContext(request);
    const id = validateIdParam(request.params.id);
    const job = store.getJobStatus(id, context.organization.id);
    if (!job) {
      response.status(404).json({ message: "Collector job not found" });
      return;
    }
    response.json(job);
  });

  app.get("/api/collectors/logs", (request, response) => {
    const context = requireSessionContext(request);
    const query = validateQuery(paginationQuerySchema, request.query);
    response.json(store.listTaskLogs(query.limit ?? 50, query.offset ?? 0, context.organization.id));
  });

  app.get("/api/collectors/freshness", (request, response) => {
    const context = requireSessionContext(request);
    response.json(store.getCollectionFreshness(context.organization.id));
  });

  app.get("/api/collectors/queue-stats", (request, response) => {
    const context = requireSessionContext(request);
    response.json(store.getQueueStats(context.organization.id));
  });

  app.get("/api/collectors/worker-status", (_request, response) => {
    response.json(store.getWorkerStatus());
  });

  app.post("/api/collectors/worker-restart", asyncHandler(async (_request, response) => {
    const child = spawn("npm", ["run", "worker"], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      shell: true
    });
    child.unref();
    response.status(202).json({ started: true, pid: child.pid ?? null });
  }));
}

function queueCollectorJobs(
  store: Store,
  organizationId: number,
  taskType: "all" | "keyword" | "category",
  date: string,
  targetId?: number
): CollectJob[] {
  if (taskType === "all") {
    const keywordJobs = store
      .listKeywords({ orgId: organizationId, status: "enabled" })
      .map((keyword) => store.pushJob("keyword", keyword.id, date, organizationId));
    const categoryJobs = store
      .listCategoryMonitors({ orgId: organizationId, status: "enabled" })
      .map((category) => store.pushJob("category", category.id, date, organizationId));
    return [...keywordJobs, ...categoryJobs];
  }

  if (targetId !== undefined) {
    assertCollectTargetAvailable(store, organizationId, taskType, targetId);
    return [store.pushJob(taskType, targetId, date, organizationId)];
  }

  if (taskType === "keyword") {
    return store
      .listKeywords({ orgId: organizationId, status: "enabled" })
      .map((keyword) => store.pushJob("keyword", keyword.id, date, organizationId));
  }

  return store
    .listCategoryMonitors({ orgId: organizationId, status: "enabled" })
    .map((category) => store.pushJob("category", category.id, date, organizationId));
}

function assertCollectTargetAvailable(
  store: Store,
  organizationId: number,
  taskType: "keyword" | "category",
  targetId: number
): void {
  const target = taskType === "keyword"
    ? store.getKeyword(targetId, organizationId)
    : store.getCategoryMonitor(targetId, organizationId);
  if (!target) {
    throw Object.assign(new Error(`${taskType} target not found`), { statusCode: 404 });
  }
  if (target.status !== "enabled") {
    throw Object.assign(new Error(`${taskType} target is disabled`), { statusCode: 409 });
  }
}
