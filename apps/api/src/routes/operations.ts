import type { Express } from "express";
import type { Store } from "../store.js";
import { optionalNumber, optionalString } from "./http-utils.js";
import { alertStatusSchema, paginationQuerySchema, validateBody, validateIdParam, validateQuery } from "./validation.js";

export function registerOperationRoutes(app: Express, store: Store): void {
  app.get("/api/alerts", (request, response) => {
    response.json(
      store.listAlerts({
        date: optionalString(request.query.date),
        status: optionalString(request.query.status),
        limit: optionalNumber(request.query.limit),
        offset: optionalNumber(request.query.offset)
      })
    );
  });

  app.patch("/api/alerts/:id/status", (request, response) => {
    const id = validateIdParam(request.params.id);
    const data = validateBody(alertStatusSchema, request.body);
    const result = store.updateAlertStatus(id, data.status ?? "viewed");
    if (!result) {
      response.status(404).json({ message: "alert not found" });
      return;
    }
    response.json(result);
  });

  app.get("/api/changes", (request, response) => {
    response.json(
      store.listDailyChanges({
        date: optionalString(request.query.date),
        keyword: optionalString(request.query.keyword)
      })
    );
  });

  app.get("/api/task-logs", (request, response) => {
    const query = validateQuery(paginationQuerySchema, request.query);
    response.json(store.listTaskLogs(query.limit ?? 50, query.offset ?? 0));
  });

  app.get("/api/collect/jobs", (request, response) => {
    const query = validateQuery(paginationQuerySchema, request.query);
    response.json(store.listJobs(query.limit ?? 50, query.offset ?? 0));
  });

  app.get("/api/collect/jobs/:id", (request, response) => {
    const id = validateIdParam(request.params.id);
    const job = store.getJobStatus(id);
    if (!job) {
      response.status(404).json({ message: "Job not found" });
      return;
    }
    response.json(job);
  });

  // Per-taskType freshness snapshot for the dashboard freshness badge.
  app.get("/api/collect/freshness", (_request, response) => {
    response.json(store.getCollectionFreshness());
  });

  // Aggregate queue health for the topbar "pending/processing" indicator.
  app.get("/api/collect/queue-stats", (_request, response) => {
    response.json(store.getQueueStats());
  });

  // Live health of the background collection Worker — last heart-beat,
  // uptime, and whether it has gone stale. Powers the topbar online dot.
  app.get("/api/collect/worker-status", (_request, response) => {
    response.json(store.getWorkerStatus());
  });
}
